import path from "node:path";
import { CliError } from "./errors.js";
import { saveTask } from "./tasks.js";

export function assertTaskState(task, allowedStates, action) {
  if (!allowedStates.includes(task.state)) {
    throw new CliError(`Cannot ${action} task ${task.id} while state is ${task.state}. Allowed: ${allowedStates.join(", ")}`);
  }
}

export function recordError(repoRoot, task, error) {
  task.lastError = error instanceof Error ? error.message : String(error);
  saveTask(repoRoot, task);
}

export function clearError(_repoRoot, task) {
  task.lastError = null;
}

export function prTitle(task) {
  return `[${task.id}] ${task.intent}`;
}

export function prBody(task) {
  const summary = task.latestRunSummary || "No execution summary recorded.";
  const specPath = path.join("tasks", `task_${task.id}`, "task.json");
  const spec = task.spec || "No spec recorded.";

  return [
    `## Task`,
    "",
    `${task.intent}`,
    "",
    `## Spec`,
    "",
    `Recorded in \`${specPath}\` locally and inlined here for reviewers:`,
    "",
    "```md",
    spec.trim(),
    "```",
    "",
    `## Execution Summary`,
    "",
    summary,
  ].join("\n");
}
