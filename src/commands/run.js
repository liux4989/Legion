import { loadTask, loadSpec, saveTask } from "../lib/tasks.js";
import { assertTaskState, markBlocked, writeRunSummary } from "../lib/workflow.js";
import { checkoutBranch, currentBranch, ensureWorkingTreeSafe, repoRoot } from "../lib/git.js";
import { runCodexTask } from "../lib/codex.js";
import { CliError } from "../lib/errors.js";

function buildRunPrompt(task, spec) {
  const feedback = task.latestReviewFeedback
    ? `\nReview feedback to address before you finish:\n${task.latestReviewFeedback}\n`
    : "";

  return `You are the executor agent for task ${task.id}.

Read the task spec below, inspect the repository, implement the requested change, run relevant checks, and finish with a concise execution summary that includes:
- what changed
- what checks ran
- any remaining caveats

Task spec:

${spec}
${feedback}
Do not broaden scope beyond the spec.`;
}

function buildResumePrompt(task) {
  return `Continue task ${task.id}. Re-check the repository state, finish any incomplete work, run relevant checks, and end with a concise execution summary.`;
}

export async function runTask(args) {
  const taskId = args[0];
  const root = repoRoot();

  if (!taskId) {
    throw new CliError("Usage: legion run <task-id>");
  }

  const task = loadTask(root, taskId);
  assertTaskState(task, ["ready", "executing", "blocked"], "run");
  const shouldResume = task.state === "executing" && Boolean(task.agentSessionId);

  const activeBranch = currentBranch(root);
  if (activeBranch !== task.branchName) {
    ensureWorkingTreeSafe(root);
    checkoutBranch(root, task.branchName, task.baseBranch);
  }

  task.state = "executing";
  task.lastError = null;
  saveTask(root, task);

  const spec = loadSpec(root, task.id);
  const result = runCodexTask({
    repoRoot: root,
    prompt: shouldResume ? buildResumePrompt(task) : buildRunPrompt(task, spec),
    resumeSessionId: shouldResume ? task.agentSessionId : null,
  });

  task.agentSessionId = result.sessionId;

  if (!result.ok) {
    markBlocked(root, task, result.error);
    console.error(result.error);
    return;
  }

  task.latestRunSummary = result.summary;
  task.latestReviewFeedback = null;
  task.latestReviewSummary = null;
  task.state = "reviewing";
  saveTask(root, task);
  writeRunSummary(root, task, result.summary);

  console.log(`Run completed for ${task.id}`);
  console.log(`State: reviewing`);
  console.log(result.summary);
}
