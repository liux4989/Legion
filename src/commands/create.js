import { generateObjectWithCodexExec } from "../lib/codex.js";
import { repoRoot, currentBranch } from "../lib/git.js";
import { createTaskRecord, makeTaskId } from "../lib/tasks.js";
import { CliError } from "../lib/errors.js";
import {
  buildIntentBriefPrompt,
  buildSpecPrompt,
  intentBriefOutputSchema,
  renderSpec,
  specOutputSchema,
  validateIntentBriefDraft,
} from "../lib/spec.js";

export async function createTask(args) {
  const intent = args.join(" ").trim();

  if (!intent) {
    throw new CliError('Usage: legion create "<intent>"');
  }

  const root = repoRoot();
  const taskId = makeTaskId();
  const briefResult = await generateObjectWithCodexExec({
    repoRoot: root,
    prompt: buildIntentBriefPrompt(intent, taskId),
    schema: intentBriefOutputSchema(),
  });

  if (!briefResult.ok) {
    throw new CliError(`Failed to generate intent brief: ${briefResult.error}`, { cause: briefResult.cause });
  }

  const intentBrief = validateIntentBriefDraft(briefResult.value);
  const draftResult = await generateObjectWithCodexExec({
    repoRoot: root,
    prompt: buildSpecPrompt(intentBrief, taskId),
    schema: specOutputSchema(),
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
    intentBrief,
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
