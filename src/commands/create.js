import { runCodexTaskInteractive } from "../lib/codex.js";
import { commitAll, commitPaths, currentBranch, defaultBranch, taskCommitMessage, workingTreeHasChanges } from "../lib/git.js";
import { createTaskRecord, makeTaskId, saveTask, specFile, taskDir } from "../lib/tasks.js";
import { CliError } from "../lib/errors.js";
import { resolveProjectContext } from "../lib/projects.js";
import { buildCreatePrompt } from "../lib/spec.js";
import { ensureDir } from "../lib/fs.js";
import { createIssue, issueBody, issueTitle } from "../lib/issues.js";
import { runTask } from "./run.js";

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

  if (workingTreeHasChanges(root)) {
    commitAll(root, "legion: auto-commit dirty worktree before task creation");
  }

  commitPaths(root, [specPath], taskCommitMessage(task, "create"));

  const issue = createIssue({
    cwd: root,
    title: issueTitle(task),
    body: issueBody(root, task),
  });
  task.issueUrl = issue.url;
  task.issueError = null;
  saveTask(root, task);

  console.log(`Project: ${project.name} (${project.path})`);
  console.log(`Created task ${taskId}`);
  console.log(`State: ready`);
  console.log(`Branch: ${branchName}`);
  console.log(`Spec: tasks/task_${taskId}/spec.md`);
  console.log(`Issue: ${task.issueUrl}`);
  console.log(`Task: tasks/task_${taskId}/task.json`);

  await runTask([taskId]);
}
