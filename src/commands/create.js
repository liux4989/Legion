import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCodexTaskInteractive } from "../lib/codex.js";
import { currentBranch } from "../lib/git.js";
import { createIssue, issueBody, issueTitle } from "../lib/issues.js";
import { createTaskRecord, loadTask, makeTaskId, saveTask, specFile, taskDir } from "../lib/tasks.js";
import { CliError, formatError } from "../lib/errors.js";
import { resolveProjectContext } from "../lib/projects.js";
import { buildCreatePrompt } from "../lib/spec.js";
import { ensureDir } from "../lib/fs.js";
import { spawnDetached } from "../lib/shell.js";

const CLI_ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../bin/legion.js");

function enqueueIssueCreation(repoRoot, taskId) {
  spawnDetached(process.execPath, [CLI_ENTRY, "__create-issue", taskId], {
    cwd: repoRoot,
  });
}

export async function createTask(args) {
  const intent = args.join(" ").trim();

  if (!intent) {
    throw new CliError('Usage: legion create "<intent>"');
  }

  const project = resolveProjectContext();
  const root = project.root;
  const baseBranch = currentBranch(root) || "main";
  const now = new Date().toISOString();
  const taskId = makeTaskId(root);

  const branchName = `task/${taskId}`;

  const task = {
    id: taskId,
    intent,
    state: "ready",
    baseBranch,
    branchName,
    createdAt: now,
    updatedAt: now,
    issueUrl: null,
    issueError: null,
    prUrl: null,
    lastError: null,
  };

  const specPath = specFile(root, taskId);
  ensureDir(taskDir(root, taskId));

  const result = runCodexTaskInteractive({
    repoRoot: root,
    prompt: buildCreatePrompt(intent, taskId, specPath),
  });

  if (!result.ok) {
    throw new CliError(`Failed to generate spec: ${result.error}`);
  }

  createTaskRecord(root, { id: taskId, task });
  enqueueIssueCreation(root, taskId);

  console.log(`Project: ${project.name} (${project.path})`);
  console.log(`Created task ${taskId}`);
  console.log(`State: ready`);
  console.log(`Branch: ${branchName}`);
  console.log(`Spec: tasks/task_${taskId}/spec.md`);
  console.log(`Issue: pending`);
  console.log(`Task: tasks/task_${taskId}/task.json`);
}

export async function createTaskIssue(args) {
  const taskId = args[0];

  if (!taskId) {
    throw new CliError("Usage: legion __create-issue <task-id>");
  }

  const project = resolveProjectContext();
  const root = project.root;
  const task = loadTask(root, taskId);

  try {
    const issue = createIssue({
      cwd: root,
      title: issueTitle(task),
      body: issueBody(root, task),
    });

    task.issueUrl = issue.url;
    task.issueError = null;
    saveTask(root, task);
  } catch (error) {
    task.issueError = formatError(error);
    saveTask(root, task);
    throw error;
  }
}
