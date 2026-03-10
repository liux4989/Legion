import { loadTask, saveTask, specFile, appendTrajectoryEntry, latestTrajectoryEntry, trajectoryFile } from "../lib/tasks.js";
import { assertTaskState, recordError, transitionTask } from "../lib/workflow.js";
import { checkoutBranch, commitAll, currentBranch, ensureWorkingTreeSafe, hasDiffAgainst, workingTreeHasChanges } from "../lib/git.js";
import { runCodexTaskAutoExit } from "../lib/codex.js";
import { CliError } from "../lib/errors.js";
import { resolveProjectContext } from "../lib/projects.js";
import { yamlBlock, yamlString } from "../lib/prompt-template.js";

const MAX_ITERATIONS = 3;

function buildExecutePrompt(root, task) {
  return `task:
  type: "execute"
  id: ${yamlString(task.id)}
spec:
  path: ${yamlString(specFile(root, task.id))}
instructions:
  - "Inspect the repository."
  - "Implement the requested change."
  - "Run relevant checks."
scope:
  rule: "Do not broaden scope beyond the spec."
`;
}

function buildFixPrompt(root, task) {
  const lastReview = latestTrajectoryEntry(root, task.id, "review");

  return `task:
  type: "fix"
  id: ${yamlString(task.id)}
spec:
  path: ${yamlString(specFile(root, task.id))}
review:
  status: "rejected"
  feedback:
${yamlBlock(lastReview.feedback, 2)}
instructions:
  - "Address the review feedback."
  - "Run relevant checks."
scope:
  rule: "Do not broaden scope beyond the spec."
`;
}

function buildReviewPrompt(root, task, iteration) {
  const trajFile = trajectoryFile(root, task.id);
  return `task:
  type: "review"
  id: ${yamlString(task.id)}
  iteration: ${iteration}
spec:
  path: ${yamlString(specFile(root, task.id))}
git:
  compare_branch: ${yamlString(task.baseBranch)}
review_scope:
  - "correctness"
  - "regressions"
  - "mismatch against the spec"
review_constraints:
  - "Do not request unrelated refactors."
  - "Do not request broader product changes."
output:
  trajectory_file: ${yamlString(trajFile)}
  append_mode: true
  json_line_schema:
${yamlBlock(`{"iteration":${iteration},"phase":"review","decision":"pass|fail","summary":"<one paragraph>","findings":[{"severity":"...","title":"...","file":"...","detail":"..."}],"feedback":"<summary + findings text if decision is fail, otherwise null>"}`, 2)}
  rules:
    - "Append exactly one JSON object line."
    - "Do not modify existing content."
    - "Use one JSON object per line with no trailing comma."
    - "Ensure the file exists after you finish."
`;
}

async function executePhase(root, task, iteration) {
  transitionTask(task, "start_fixing");
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

async function fixPhase(root, task, iteration) {
  task.lastError = null;
  saveTask(root, task);

  const result = await runCodexTaskAutoExit({
    repoRoot: root,
    prompt: buildFixPrompt(root, task),
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
    phase: "fix",
    summary: result.summary,
  });
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
  const taskId = args[0];

  if (!taskId) {
    throw new CliError("Usage: legion run <task-id>");
  }

  const project = resolveProjectContext();
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

    if (task.state === "ready") {
      if (!await executePhase(root, task, i + 1)) break;
      task = loadTask(root, taskId);
    }

    if (task.state === "fixing") {
      if (!await fixPhase(root, task, i + 1)) break;
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
