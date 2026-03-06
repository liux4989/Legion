import { generateObjectWithCodex } from "../lib/codex.js";
import { repoRoot, currentBranch } from "../lib/git.js";
import { createTaskRecord, makeTaskId } from "../lib/tasks.js";
import { CliError } from "../lib/errors.js";
import { buildSpecPrompt, renderSpec, specOutputSchema } from "../lib/spec.js";

export async function createTask(args) {
  const intent = args.join(" ").trim();

  if (!intent) {
    throw new CliError('Usage: legion create "<intent>"');
  }

  const root = repoRoot();
  const taskId = makeTaskId();
  const draftResult = await generateObjectWithCodex({
    repoRoot: root,
    prompt: buildSpecPrompt(intent, taskId),
    schema: specOutputSchema(),
    prefix: "legion-create",
  });

  if (!draftResult.ok) {
    throw new CliError(`Failed to generate spec: ${draftResult.error}`, { cause: draftResult.cause });
  }

  const spec = renderSpec(taskId, draftResult.value);
  const baseBranch = currentBranch(root) || "main";
  const branchName = `task/${taskId}`;
  const now = new Date().toISOString();

  const task = {
    id: taskId,
    intent,
    state: "ready",
    baseBranch,
    branchName,
    createdAt: now,
    updatedAt: now,
    latestRunSummary: null,
    latestReviewSummary: null,
    latestReviewFeedback: null,
    prUrl: null,
    lastError: null,
  };

  createTaskRecord(root, { id: taskId, spec, task });

  console.log(`Created task ${taskId}`);
  console.log(`State: ready`);
  console.log(`Branch: ${branchName}`);
  console.log(`Task: tasks/task_${taskId}/task.json`);
}
