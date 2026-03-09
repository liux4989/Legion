import { generateObjectWithCodex, generateTextWithCodex } from "../lib/codex.js";
import { currentBranch } from "../lib/git.js";
import { createTaskRecord, makeTaskId } from "../lib/tasks.js";
import { CliError } from "../lib/errors.js";
import { parseProjectArgs, resolveProjectContext } from "../lib/projects.js";
import {
  buildIntentPrompt,
  buildSpecPrompt,
  renderSpec,
  specOutputSchema,
} from "../lib/spec.js";

export async function createTask(args) {
  const parsed = parseProjectArgs(args);
  const intent = parsed.args.join(" ").trim();

  if (!intent) {
    throw new CliError('Usage: legion create [--project <name|path>] "<intent>"');
  }

  const project = resolveProjectContext(parsed.projectRef);
  const root = project.root;
  const taskId = makeTaskId();

  const intentResult = await generateTextWithCodex({
    repoRoot: root,
    prompt: buildIntentPrompt(intent, taskId),
    prefix: "legion-intent",
  });

  if (!intentResult.ok) {
    throw new CliError(`Failed to generate intent: ${intentResult.error}`, { cause: intentResult.cause });
  }

  const intentBrief = intentResult.value.trim();

  const specResult = await generateObjectWithCodex({
    repoRoot: root,
    prompt: buildSpecPrompt(intentBrief, taskId),
    schema: specOutputSchema(),
    prefix: "legion-spec",
  });

  if (!specResult.ok) {
    throw new CliError(`Failed to generate spec: ${specResult.error}`, { cause: specResult.cause });
  }

  const spec = renderSpec(taskId, specResult.value);
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

  console.log(`Project: ${project.name} (${project.path})`);
  console.log(`Created task ${taskId}`);
  console.log(`State: ready`);
  console.log(`Branch: ${branchName}`);
  console.log(`Task: tasks/task_${taskId}/task.json`);
}
