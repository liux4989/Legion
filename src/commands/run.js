import { loadTask, saveTask, specFile, appendTrajectoryEntry, latestTrajectoryEntry, trajectoryFile } from "../lib/tasks.js";
import { assertTaskState, recordError, transitionTask } from "../lib/workflow.js";
import { checkoutBranch, commitAll, currentBranch, ensureWorkingTreeSafe, hasDiffAgainst, workingTreeHasChanges } from "../lib/git.js";
import { runCodexTaskAutoExit } from "../lib/codex.js";
import { CliError } from "../lib/errors.js";
import { parseProjectArgs, resolveProjectContext } from "../lib/projects.js";

const MAX_ITERATIONS = 3;

function buildExecutePrompt(root, task) {
  return `You are working on Legion task ${task.id}.

Read the task spec at: ${specFile(root, task.id)}

Inspect the repository, implement the requested change, and run relevant checks.

Do not broaden scope beyond the spec.`;
}

function buildFixPrompt(root, task) {
  const lastReview = latestTrajectoryEntry(root, task.id, "review");

  return `You are working on Legion task ${task.id}.

Read the task spec at: ${specFile(root, task.id)}

A previous implementation was reviewed and rejected. Address the review feedback below, then run relevant checks.

Do not broaden scope beyond the spec.

Review feedback to address:
${lastReview.feedback}`;
}

function buildReviewPrompt(root, task, iteration) {
  const trajFile = trajectoryFile(root, task.id);
  return `Review task ${task.id} against the spec file at: ${specFile(root, task.id)}

Use git to compare the current branch against base branch ${task.baseBranch}.

Only check:
- correctness
- regressions
- mismatch against the spec
- missing tests if clearly required

Do not request unrelated refactors or broader product changes.

When done, append exactly one JSON line to: ${trajFile}

The line must be valid JSON matching this schema (no extra keys, no wrapping):
{"iteration":${iteration},"phase":"review","decision":"pass|fail","summary":"<one paragraph>","findings":[{"severity":"...","title":"...","file":"...","detail":"..."}],"feedback":"<summary + findings text if decision is fail, otherwise null>"}

Rules:
- Append only; do not modify existing content.
- One JSON object per line, no trailing comma.
- Ensure the file exists after you finish.`;
}

async function executePhase(root, task, iteration) {
  const isFirstRun = task.state === "ready";
  if (isFirstRun) {
    transitionTask(task, "start_fixing");
  }
  task.lastError = null;
  saveTask(root, task);

  const prompt = isFirstRun
    ? buildExecutePrompt(root, task)
    : buildFixPrompt(root, task);

  const result = await runCodexTaskAutoExit({
    repoRoot: root,
    prompt,
  });

  if (!result.ok) {
    recordError(root, task, result.error);
    return false;
  }

  if (workingTreeHasChanges(root)) {
    commitAll(root, `task(${task.id}): ${task.intent}`);
  }

  appendTrajectoryEntry(root, task.id, {
    iteration,
    phase: "execute",
    summary: result.summary,
  });
  transitionTask(task, "fixing_succeeded");
  task.lastError = null;
  saveTask(root, task);
  console.log(`\n── execute done ── state: reviewing`);
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
  if (!review || review.iteration !== iteration) {
    recordError(root, task, "Codex did not append a review entry to the trajectory file.");
    return false;
  }

  if (review.decision !== "pass" && review.decision !== "fail") {
    recordError(root, task, `Invalid review decision: ${review.decision}`);
    return false;
  }

  if (review.decision === "pass") {
    transitionTask(task, "review_passed");
    task.lastError = null;
    saveTask(root, task);
    console.log(`\n── review passed ── state: pr_ready`);
    return true;
  }

  transitionTask(task, "review_failed");
  task.lastError = null;
  saveTask(root, task);
  console.log(`\n── review failed ── looping back to execute`);
  return true;
}

export async function runTask(args) {
  const parsed = parseProjectArgs(args);
  const taskId = parsed.args[0];

  if (!taskId) {
    throw new CliError("Usage: legion run [--project <name|path>] <task-id>");
  }

  const project = resolveProjectContext(parsed.projectRef);
  const root = project.root;

  let task = loadTask(root, taskId);
  assertTaskState(task, ["ready", "fixing", "reviewing"], "run");

  const activeBranch = currentBranch(root);
  if (activeBranch !== task.branchName) {
    ensureWorkingTreeSafe(root);
    checkoutBranch(root, task.branchName, task.baseBranch);
  }

  console.log(`Project: ${project.name} (${project.path})`);
  console.log(`Starting autonomous loop for ${task.id} (max ${MAX_ITERATIONS} iterations, Ctrl-C to stop)`);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    task = loadTask(root, taskId);

    if (task.state === "ready" || task.state === "fixing") {
      if (!await executePhase(root, task, i + 1)) break;
      task = loadTask(root, taskId);
    }

    if (task.state === "reviewing") {
      if (!await reviewPhase(root, task, i + 1)) break;
      task = loadTask(root, taskId);
    }

    if (task.state === "pr_ready") {
      console.log(`Task ${task.id} is ready for PR. Run: legion pr ${task.id}`);
      return;
    }
  }

  task = loadTask(root, taskId);
  if (task.state !== "pr_ready") {
    console.log(`Loop ended. Task ${task.id} state: ${task.state}`);
  }
}
