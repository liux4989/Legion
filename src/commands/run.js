import { effectiveTaskState, loadTask, saveTask, specFile, latestTrajectoryEntry, readTrajectory, trajectoryFile } from "../lib/tasks.js";
import { assertTaskState, recordError, transitionTask } from "../lib/workflow.js";
import { checkoutBranch, commitAll, currentBranch, ensureWorkingTreeSafe, hasDiffAgainst, hasUnpushedCommits, pushUnpushedCommits, resolveStartSha, taskCommitMessage, workingTreeHasChanges } from "../lib/git.js";
import { runCodexTaskAutoExit } from "../lib/codex.js";
import { CliError } from "../lib/errors.js";
import { renderPromptTemplate } from "../lib/prompt-template.js";
import { resolveProjectContext } from "../lib/projects.js";

const MAX_ITERATIONS = 3;

function assertTrajectoryIteration(entry, expectedIteration, phase) {
  const actualIteration = Number(entry?.iteration);

  if (!Number.isInteger(actualIteration)) {
    throw new CliError(`Invalid ${phase} iteration: ${entry?.iteration}`);
  }

  if (actualIteration !== expectedIteration) {
    throw new CliError(`Unexpected ${phase} iteration: expected ${expectedIteration}, got ${entry.iteration}`);
  }
}

function nextPhaseIteration(root, taskId, phase) {
  return readTrajectory(root, taskId).filter((entry) => entry.phase === phase).length + 1;
}

function buildExecutePrompt(root, task) {
  return renderPromptTemplate("execute-task.yaml", {
    task_id: task.id,
    spec_path: specFile(root, task.id),
    trajectory_file: trajectoryFile(root, task.id),
  });
}

function buildFixPrompt(root, task, iteration) {
  const lastReview = latestTrajectoryEntry(root, task.id, "review");

  return renderPromptTemplate("fix-task.yaml", {
    task_id: task.id,
    iteration,
    review_findings: JSON.stringify(lastReview.findings ?? []),
    trajectory_file: trajectoryFile(root, task.id),
  });
}

function buildReviewPrompt(root, task, iteration) {
  const trajFile = trajectoryFile(root, task.id);
  const startSha = resolveStartSha(root, task.baseBranch);
  const lastReview = iteration > 1 ? latestTrajectoryEntry(root, task.id, "review") : null;
  return renderPromptTemplate("review-task.yaml", {
    task_id: task.id,
    iteration,
    spec_path: specFile(root, task.id),
    start_sha: startSha,
    trajectory_file: trajFile,
    prior_findings: JSON.stringify(lastReview?.findings ?? []),
  });
}

async function executePhase(root, task) {
  task.lastError = null;
  saveTask(root, task);

  const result = await runCodexTaskAutoExit({
    repoRoot: root,
    prompt: buildExecutePrompt(root, task),
  });

  if (!result.ok) {
    recordError(root, task, result.error);
    return false;
  }

  if (workingTreeHasChanges(root)) {
    commitAll(root, taskCommitMessage(task, "execute"));
  }

  const execution = latestTrajectoryEntry(root, task.id, "execute");
  if (!execution) {
    recordError(root, task, "Codex did not append an execute entry to the trajectory file.");
    return false;
  }
  transitionTask(task, "execute_succeeded");
  task.lastError = null;
  saveTask(root, task);
  console.log(`\n── execute done ── state: reviewing`);
  return true;
}

async function fixPhase(root, task, iteration) {
  task.lastError = null;
  saveTask(root, task);

  const result = await runCodexTaskAutoExit({
    repoRoot: root,
    prompt: buildFixPrompt(root, task, iteration),
  });

  if (!result.ok) {
    recordError(root, task, result.error);
    return false;
  }

  if (workingTreeHasChanges(root)) {
    commitAll(root, taskCommitMessage(task, "fix"));
  }

  const fixEntry = latestTrajectoryEntry(root, task.id, "fix");
  if (!fixEntry) {
    recordError(root, task, "Codex did not append a fix entry to the trajectory file.");
    return false;
  }
  try {
    assertTrajectoryIteration(fixEntry, iteration, "fix");
  } catch (error) {
    recordError(root, task, error);
    return false;
  }
  transitionTask(task, "fixing_succeeded");
  task.lastError = null;
  saveTask(root, task);
  console.log(`\n── fix done ── state: reviewing`);
  return true;
}

async function reviewPhase(root, task, iteration) {
  if (!hasDiffAgainst(root, task.baseBranch)) {
    console.error(`No diff against ${task.baseBranch}. Nothing to review.`);
    return false;
  }

  const result = await runCodexTaskAutoExit({
    repoRoot: root,
    prompt: buildReviewPrompt(root, task, iteration),
  });

  if (!result.ok) {
    recordError(root, task, result.error);
    return false;
  }

  const review = latestTrajectoryEntry(root, task.id, "review");
  if (!review) {
    recordError(root, task, "Codex did not append a review entry to the trajectory file.");
    return false;
  }
  try {
    assertTrajectoryIteration(review, iteration, "review");
  } catch (error) {
    recordError(root, task, error);
    return false;
  }

  if (review.decision !== "pass" && review.decision !== "fail") {
    recordError(root, task, `Invalid review decision: ${review.decision}`);
    return false;
  }

  if (review.decision === "pass") {
    transitionTask(task, "review_passed");
    task.lastError = null;
    console.log(`\n── review passed ── state: pr_ready`);
    return true;
  }

  transitionTask(task, "review_failed");
  task.lastError = null;
  saveTask(root, task);
  console.log(`\n── review failed ── state: fixing`);
  return true;
}

export async function runTask(args) {
  const taskId = args[0];

  if (!taskId) {
    throw new CliError("Usage: legion run <task-id>");
  }

  const project = resolveProjectContext();
  const root = project.root;

  let task = loadTask(root, taskId);
  task.state = effectiveTaskState(root, task);
  assertTaskState(task, ["ready", "fixing", "reviewing", "pr_ready"], "run");

  if (hasUnpushedCommits(root, task.baseBranch)) {
    pushUnpushedCommits(root, task.baseBranch);
  }

  const activeBranch = currentBranch(root);
  if (activeBranch !== task.branchName) {
    ensureWorkingTreeSafe(root);
    checkoutBranch(root, task.branchName, task.baseBranch);
  }

  console.log(`Project: ${project.name} (${project.path})`);
  console.log(`Starting autonomous loop for ${task.id} (max ${MAX_ITERATIONS} iterations, Ctrl-C to stop)`);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    task = loadTask(root, taskId);
    task.state = effectiveTaskState(root, task);

    if (task.state === "ready") {
      if (!await executePhase(root, task)) break;
      task = loadTask(root, taskId);
      task.state = effectiveTaskState(root, task);
    }

    if (task.state === "fixing") {
      const fixIteration = nextPhaseIteration(root, task.id, "fix");
      if (!await fixPhase(root, task, fixIteration)) break;
      task = loadTask(root, taskId);
      task.state = effectiveTaskState(root, task);
    }

    if (task.state === "reviewing") {
      const reviewIteration = nextPhaseIteration(root, task.id, "review");
      if (!await reviewPhase(root, task, reviewIteration)) break;
      task = loadTask(root, taskId);
      task.state = effectiveTaskState(root, task);
    }

    if (task.state === "pr_ready") {
      console.log(`Task ${task.id} is ready for PR. Run: legion pr ${task.id}`);
      return;
    }
  }

  task = loadTask(root, taskId);
  task.state = effectiveTaskState(root, task);
  if (task.state !== "pr_ready") {
    console.log(`Loop ended. Task ${task.id} state: ${task.state}`);
  }
}
