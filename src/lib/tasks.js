import { randomUUID } from "node:crypto";
import path from "node:path";
import { ensureDir, exists, readJson, readText, writeJson, writeText } from "./fs.js";
import { CliError } from "./errors.js";

export const TASK_STATES = new Set([
  "ready",
  "fixing",
  "reviewing",
  "pr_ready",
  "done",
]);

export function tasksRoot(repoRoot) {
  return path.join(repoRoot, "tasks");
}

export function makeTaskId() {
  return randomUUID();
}

export function taskDir(repoRoot, taskId) {
  return path.join(tasksRoot(repoRoot), `task_${taskId}`);
}

export function taskFile(repoRoot, taskId) {
  return path.join(taskDir(repoRoot, taskId), "task.json");
}

export function specFile(repoRoot, taskId) {
  return path.join(taskDir(repoRoot, taskId), "spec.md");
}

export function createTaskRecord(repoRoot, data) {
  const dir = taskDir(repoRoot, data.id);
  ensureDir(dir);
  writeText(specFile(repoRoot, data.id), data.spec);
  writeJson(taskFile(repoRoot, data.id), {
    ...data.task,
    spec: data.spec,
  });
}

export function loadTask(repoRoot, taskId) {
  const filePath = taskFile(repoRoot, taskId);

  if (!exists(filePath)) {
    throw new CliError(`Task not found: ${taskId}`);
  }

  const task = readJson(filePath);

  if (!task.spec && exists(specFile(repoRoot, taskId))) {
    task.spec = readText(specFile(repoRoot, taskId));
  }

  if (!TASK_STATES.has(task.state)) {
    throw new CliError(`Task ${taskId} has invalid state: ${task.state}`);
  }

  return task;
}

export function saveTask(repoRoot, task) {
  task.updatedAt = new Date().toISOString();
  writeJson(taskFile(repoRoot, task.id), task);
}
