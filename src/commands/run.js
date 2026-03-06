import { loadTask, saveTask } from "../lib/tasks.js";
import { assertTaskState, recordError } from "../lib/workflow.js";
import { checkoutBranch, currentBranch, ensureWorkingTreeSafe, repoRoot } from "../lib/git.js";
import { runCodexTask } from "../lib/codex.js";
import { CliError } from "../lib/errors.js";

function buildRunPrompt(task, spec) {
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

${spec}
${feedback}
Do not broaden scope beyond the spec.`;
}

export async function runTask(args) {
  const taskId = args[0];
  const root = repoRoot();

  if (!taskId) {
    throw new CliError("Usage: legion run <task-id>");
  }

  const task = loadTask(root, taskId);
  assertTaskState(task, ["ready", "executing"], "run");

  const activeBranch = currentBranch(root);
  if (activeBranch !== task.branchName) {
    ensureWorkingTreeSafe(root);
    checkoutBranch(root, task.branchName, task.baseBranch);
  }

  task.state = "executing";
  task.lastError = null;
  saveTask(root, task);

  const result = await runCodexTask({
    repoRoot: root,
    prompt: buildRunPrompt(task, task.spec),
  });

  if (!result.ok) {
    recordError(root, task, result.error);
    console.error(result.error);
    return;
  }

  task.latestRunSummary = result.summary;
  task.latestReviewFeedback = null;
  task.latestReviewSummary = null;
  task.state = "reviewing";
  task.lastError = null;
  saveTask(root, task);

  console.log(`Run completed for ${task.id}`);
  console.log(`State: reviewing`);
  console.log(result.summary);
}
