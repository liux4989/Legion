import path from "node:path";
import { ensureDir, exists, readJson, readText, writeJson, writeText } from "./fs.js";
import { CliError } from "./errors.js";

export const TASK_STATES = new Set([
  "draft",
  "ready",
  "executing",
  "reviewing",
  "pr_ready",
  "done",
  "blocked",
]);

export function tasksRoot(repoRoot) {
  return path.join(repoRoot, "tasks");
}

export function makeTaskId(intent) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const slug = intent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "task";

  return `${stamp}-${slug}`;
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

export function runSummaryFile(repoRoot, taskId) {
  return path.join(taskDir(repoRoot, taskId), "run_summary.md");
}

export function reviewFile(repoRoot, taskId, round) {
  return path.join(taskDir(repoRoot, taskId), `review_${round}.json`);
}

export function prFile(repoRoot, taskId) {
  return path.join(taskDir(repoRoot, taskId), "pr.json");
}

export function createTaskRecord(repoRoot, data) {
  const dir = taskDir(repoRoot, data.id);
  ensureDir(dir);
  writeText(specFile(repoRoot, data.id), data.spec);
  writeJson(taskFile(repoRoot, data.id), data.task);
}

export function loadTask(repoRoot, taskId) {
  const filePath = taskFile(repoRoot, taskId);

  if (!exists(filePath)) {
    throw new CliError(`Task not found: ${taskId}`);
  }

  const task = readJson(filePath);

  if (!TASK_STATES.has(task.state)) {
    throw new CliError(`Task ${taskId} has invalid state: ${task.state}`);
  }

  return task;
}

export function saveTask(repoRoot, task) {
  task.updatedAt = new Date().toISOString();
  writeJson(taskFile(repoRoot, task.id), task);
}

export function loadSpec(repoRoot, taskId) {
  return readText(specFile(repoRoot, taskId));
}
