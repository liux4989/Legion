import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runCodexTaskInteractive } from "../lib/codex.js";
import { commitPaths, currentBranch, defaultBranch, taskCommitMessage } from "../lib/git.js";
import { createTaskRecord, makeTaskId, specFile, taskDir } from "../lib/tasks.js";
import { CliError } from "../lib/errors.js";
import { resolveProjectContext } from "../lib/projects.js";
import { buildCreatePrompt } from "../lib/spec.js";
import { ensureDir } from "../lib/fs.js";
import { spawnDetached } from "../lib/shell.js";
import { runTask } from "./run.js";

const LEGION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TASKS_MODULE_URL = JSON.stringify(pathToFileURL(path.join(LEGION_ROOT, "src/lib/tasks.js")).href);
const ISSUES_MODULE_URL = JSON.stringify(pathToFileURL(path.join(LEGION_ROOT, "src/lib/issues.js")).href);
const ERRORS_MODULE_URL = JSON.stringify(pathToFileURL(path.join(LEGION_ROOT, "src/lib/errors.js")).href);

function enqueueIssueCreation(repoRoot, taskId) {
  const workerScript = [
    "const repoRoot = process.argv[1];",
    "const taskId = process.argv[2];",
    `const { loadTask, saveTask } = await import(${TASKS_MODULE_URL});`,
    `const { createIssue, issueBody, issueTitle } = await import(${ISSUES_MODULE_URL});`,
    `const { formatError } = await import(${ERRORS_MODULE_URL});`,
    "const task = loadTask(repoRoot, taskId);",
    "try {",
    "  const issue = createIssue({",
    "    cwd: repoRoot,",
    "    title: issueTitle(task),",
    "    body: issueBody(repoRoot, task),",
    "  });",
    "  task.issueUrl = issue.url;",
    "  task.issueError = null;",
    "  saveTask(repoRoot, task);",
    "} catch (error) {",
    "  task.issueError = formatError(error);",
    "  saveTask(repoRoot, task);",
    "  throw error;",
    "}",
  ].join("\n");

  spawnDetached(process.execPath, ["--input-type=module", "-e", workerScript, repoRoot, taskId], {
    cwd: repoRoot,
    logFile: path.join(taskDir(repoRoot, taskId), "issue.log"),
  });
}

export async function createTask(args) {
  const intent = args.join(" ").trim();

  if (!intent) {
    throw new CliError('Usage: legion create "<intent>"');
  }

  const project = resolveProjectContext();
  const root = project.root;
  const activeBranch = currentBranch(root);

  if (!activeBranch) {
    throw new CliError("Cannot create a task from a detached HEAD.");
  }

  const baseBranch = activeBranch.startsWith("task/") ? defaultBranch(root) : activeBranch;
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
  commitPaths(root, [taskDir(root, taskId)], taskCommitMessage(task, "create"));
  enqueueIssueCreation(root, taskId);

  console.log(`Project: ${project.name} (${project.path})`);
  console.log(`Created task ${taskId}`);
  console.log(`State: ready`);
  console.log(`Branch: ${branchName}`);
  console.log(`Spec: tasks/task_${taskId}/spec.md`);
  console.log(`Issue: pending`);
  console.log(`Task: tasks/task_${taskId}/task.json`);

  await runTask([taskId]);
}
