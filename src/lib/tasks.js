import fs from "node:fs";
import path from "node:path";
import { ensureDir, exists, readJson, writeJson } from "./fs.js";
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

export function makeTaskId(issueNumber) {
  return String(issueNumber);
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

export function trajectoryFile(repoRoot, taskId) {
  return path.join(taskDir(repoRoot, taskId), "trajectory.jsonl");
}


export function readTrajectory(repoRoot, taskId) {
  const file = trajectoryFile(repoRoot, taskId);
  if (!exists(file)) return [];
  const content = fs.readFileSync(file, "utf8").trim();
  if (!content) return [];
  return content.split("\n").flatMap((line) => {
    try { return [JSON.parse(line)]; }
    catch { return []; }
  });
}

export function latestTrajectoryEntry(repoRoot, taskId, phase) {
  const entries = readTrajectory(repoRoot, taskId);
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].phase === phase) return entries[i];
  }
  return null;
}
