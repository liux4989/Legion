import { generateTextWithCodex } from "../lib/codex.js";
import { currentBranch } from "../lib/git.js";
import { createIssue, issueBody, issueTitle } from "../lib/issues.js";
import { createTaskRecord, makeTaskId, saveTask } from "../lib/tasks.js";
import { CliError } from "../lib/errors.js";
import { parseProjectArgs, resolveProjectContext } from "../lib/projects.js";
import { buildCreatePrompt } from "../lib/spec.js";

export async function createTask(args) {
  const parsed = parseProjectArgs(args);
  const intent = parsed.args.join(" ").trim();

  if (!intent) {
    throw new CliError('Usage: legion create [--project <name|path>] "<intent>"');
  }

  const project = resolveProjectContext(parsed.projectRef);
  const root = project.root;
  const baseBranch = currentBranch(root) || "main";
  const now = new Date().toISOString();

  const issue = createIssue({
    cwd: root,
    title: intent,
    body: "",
  });

  const taskId = makeTaskId(issue.number);
  const branchName = `task/${taskId}`;

  const task = {
    id: taskId,
    intent,
    state: "ready",
    baseBranch,
    branchName,
    createdAt: now,
    updatedAt: now,
    issueUrl: issue.url,
    prUrl: null,
    lastError: null,
  };

  const specResult = await generateTextWithCodex({
    repoRoot: root,
    prompt: buildCreatePrompt(intent, taskId),
    prefix: "legion-spec",
  });

  if (!specResult.ok) {
    throw new CliError(`Failed to generate spec: ${specResult.error}`, { cause: specResult.cause });
  }

  const spec = `${specResult.value.trim()}\n`;
  createTaskRecord(root, {
    id: taskId,
    spec,
    task,
  });

  console.log(`Project: ${project.name} (${project.path})`);
  console.log(`Created task ${taskId}`);
  console.log(`State: ready`);
  console.log(`Branch: ${branchName}`);
  console.log(`Spec: tasks/task_${taskId}/spec.md`);
  console.log(`Issue: ${issue.url}`);
  console.log(`Task: tasks/task_${taskId}/task.json`);
}
