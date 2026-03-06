import { reviewWithCodex } from "../lib/codex.js";
import { checkoutBranch, currentBranch, ensureWorkingTreeSafe, hasDiffAgainst, repoRoot } from "../lib/git.js";
import { loadSpec, loadTask, saveTask } from "../lib/tasks.js";
import { REVIEW_LIMIT, assertTaskState, markBlocked, writeReviewResult } from "../lib/workflow.js";
import { CliError } from "../lib/errors.js";

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

  for (const finding of review.findings) {
    if (!finding || typeof finding !== "object") {
      throw new CliError("Each review finding must be an object.");
    }

    if (!["high", "medium", "low"].includes(finding.severity)) {
      throw new CliError("Review finding severity must be high, medium, or low.");
    }

    if (typeof finding.title !== "string" || !finding.title.trim()) {
      throw new CliError("Review finding title must be a non-empty string.");
    }

    if (typeof finding.detail !== "string" || !finding.detail.trim()) {
      throw new CliError("Review finding detail must be a non-empty string.");
    }
  }

  return review;
}

function buildReviewPrompt(task, spec) {
  return `Review task ${task.id} against the spec below.

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

${spec}`;
}

export async function reviewTask(args) {
  const taskId = args[0];
  const root = repoRoot();

  if (!taskId) {
    throw new CliError("Usage: legion review <task-id>");
  }

  const task = loadTask(root, taskId);
  assertTaskState(task, ["reviewing", "blocked"], "review");

  const activeBranch = currentBranch(root);
  if (activeBranch !== task.branchName) {
    ensureWorkingTreeSafe(root);
    checkoutBranch(root, task.branchName, task.baseBranch);
  }

  if (!hasDiffAgainst(root, task.baseBranch)) {
    throw new CliError(`Task ${task.id} has no diff against ${task.baseBranch}. Run the task before review.`);
  }

  const spec = loadSpec(root, task.id);
  let loggedProgress = false;
  const result = await reviewWithCodex({
    repoRoot: root,
    baseBranch: task.baseBranch,
    prompt: buildReviewPrompt(task, spec),
    onEvent: (event) => {
      if (event.type === "thread.started") {
        console.log(`Codex review session: ${event.thread_id}`);
        loggedProgress = true;
        return;
      }

      if (event.type === "turn.started") {
        console.log("Codex started review...");
        loggedProgress = true;
      }
    },
  });

  if (!result.ok) {
    markBlocked(root, task, result.error);
    console.error(result.error);
    return;
  }

  if (!loggedProgress) {
    console.log("Codex review completed without streaming progress events.");
  }

  let review;

  try {
    review = validateReviewShape(result.review);
  } catch (error) {
    markBlocked(root, task, error);
    console.error(task.lastError);
    return;
  }

  task.reviewCount += 1;
  task.latestReviewSummary = review.summary;
  writeReviewResult(root, task, task.reviewCount, review);

  if (review.decision === "pass") {
    task.state = "pr_ready";
    task.latestReviewFeedback = null;
    task.lastError = null;
    saveTask(root, task);
    console.log(`Review passed for ${task.id}`);
    console.log(`State: pr_ready`);
    console.log(review.summary);
    return;
  }

  const findingsText = review.findings
    .map((finding, index) => {
      const location = finding.file ? ` (${finding.file})` : "";
      return `${index + 1}. [${finding.severity}] ${finding.title}${location}\n${finding.detail}`;
    })
    .join("\n\n");

  task.latestReviewFeedback = `${review.summary}\n\n${findingsText}`;

  if (task.reviewCount >= REVIEW_LIMIT) {
    task.state = "blocked";
    task.lastError = `Review limit reached after ${task.reviewCount} rounds.`;
    saveTask(root, task);
    console.log(`Review failed for ${task.id}`);
    console.log(task.lastError);
    return;
  }

  task.state = "executing";
  task.lastError = null;
  saveTask(root, task);
  console.log(`Review failed for ${task.id}`);
  console.log(`State: executing`);
  console.log(task.latestReviewFeedback);
}
