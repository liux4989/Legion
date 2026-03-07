import { loadTask, saveTask } from "../lib/tasks.js";
import { assertTaskState, recordError, transitionTask } from "../lib/workflow.js";
import { checkoutBranch, commitAll, currentBranch, ensureWorkingTreeSafe, hasDiffAgainst, repoRoot, workingTreeHasChanges } from "../lib/git.js";
import { runCodexTaskAutoExit, reviewWithCodexAutoExit } from "../lib/codex.js";
import { CliError } from "../lib/errors.js";

const MAX_ITERATIONS = 3;

function buildRunPrompt(task) {
  const feedback = task.latestReviewFeedback
    ? `\nReview feedback to address before you finish:\n${task.latestReviewFeedback}\n`
    : "";

  return `You are working on Legion task ${task.id}.

Read the task spec below, inspect the repository, implement the requested change, and run relevant checks before you stop.

When you are done, summarize:
- what changed
- what checks ran
- any remaining caveats

Task spec:

${task.spec}
${feedback}
Do not broaden scope beyond the spec.`;
}

function buildReviewPrompt(task) {
  return `Review task ${task.id} against the spec below.

Use git to compare the current branch against base branch ${task.baseBranch}.

Only check:
- correctness
- regressions
- mismatch against the spec
- missing tests if clearly required

Do not request unrelated refactors or broader product changes.

Return decision "pass" if there are no material findings. Return decision "fail" with findings if the task should go back to execution.

Respond with JSON only in this shape:
{"decision":"pass|fail","summary":"...","findings":[{"severity":"high|medium|low","title":"...","detail":"...","file":"optional/path"}]}

Task spec:

${task.spec}`;
}

function validateReviewShape(review) {
  if (!review || typeof review !== "object") {
    throw new CliError("Review output was not an object.");
  }
  if (!["pass", "fail"].includes(review.decision)) {
    throw new CliError('Review output must include decision "pass" or "fail".');
  }
  if (typeof review.summary !== "string" || !review.summary.trim()) {
    throw new CliError("Review output must include a non-empty summary.");
  }
  if (!Array.isArray(review.findings)) {
    throw new CliError("Review output must include a findings array.");
  }
  return review;
}

async function executePhase(root, task) {
  if (task.state === "ready") {
    transitionTask(task, "start_execution");
  }
  task.lastError = null;
  saveTask(root, task);

  const result = await runCodexTaskAutoExit({
    repoRoot: root,
    prompt: buildRunPrompt(task),
  });

  if (!result.ok) {
    recordError(root, task, result.error);
    return false;
  }

  if (workingTreeHasChanges(root)) {
    commitAll(root, `task(${task.id}): ${task.intent}`);
  }

  task.latestRunSummary = result.summary;
  task.latestReviewFeedback = null;
  task.latestReviewSummary = null;
  transitionTask(task, "execution_succeeded");
  task.lastError = null;
  saveTask(root, task);
  console.log(`\n── execute done ── state: reviewing`);
  return true;
}

async function reviewPhase(root, task) {
  if (!hasDiffAgainst(root, task.baseBranch)) {
    console.error(`No diff against ${task.baseBranch}. Nothing to review.`);
    return false;
  }

  const result = await reviewWithCodexAutoExit({
    repoRoot: root,
    prompt: buildReviewPrompt(task),
  });

  if (!result.ok) {
    recordError(root, task, result.error);
    return false;
  }

  let review;
  try {
    review = validateReviewShape(result.review);
  } catch (error) {
    recordError(root, task, error);
    return false;
  }

  task.latestReviewSummary = review.summary;

  if (review.decision === "pass") {
    transitionTask(task, "review_passed");
    task.latestReviewFeedback = null;
    task.lastError = null;
    saveTask(root, task);
    console.log(`\n── review passed ── state: pr_ready`);
    return true;
  }

  const findingsText = review.findings
    .map((f, i) => {
      const loc = f.file ? ` (${f.file})` : "";
      return `${i + 1}. [${f.severity}] ${f.title}${loc}\n${f.detail}`;
    })
    .join("\n\n");

  task.latestReviewFeedback = `${review.summary}\n\n${findingsText}`;
  transitionTask(task, "review_failed");
  task.lastError = null;
  saveTask(root, task);
  console.log(`\n── review failed ── looping back to execute`);
  return true;
}

export async function runTask(args) {
  const taskId = args[0];
  const root = repoRoot();

  if (!taskId) {
    throw new CliError("Usage: legion run <task-id>");
  }

  let task = loadTask(root, taskId);
  assertTaskState(task, ["ready", "executing", "reviewing"], "run");

  const activeBranch = currentBranch(root);
  if (activeBranch !== task.branchName) {
    ensureWorkingTreeSafe(root);
    checkoutBranch(root, task.branchName, task.baseBranch);
  }

  console.log(`Starting autonomous loop for ${task.id} (max ${MAX_ITERATIONS} iterations, Ctrl-C to stop)`);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    task = loadTask(root, taskId);

    if (task.state === "ready" || task.state === "executing") {
      if (!await executePhase(root, task)) break;
      task = loadTask(root, taskId);
    }

    if (task.state === "reviewing") {
      if (!await reviewPhase(root, task)) break;
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
