import path from "node:path";
import { CliError } from "./errors.js";
import { reviewFile, runSummaryFile, saveTask, prFile } from "./tasks.js";
import { writeJson, writeText } from "./fs.js";

export const REVIEW_LIMIT = 2;

export function assertTaskState(task, allowedStates, action) {
  if (!allowedStates.includes(task.state)) {
    throw new CliError(`Cannot ${action} task ${task.id} while state is ${task.state}. Allowed: ${allowedStates.join(", ")}`);
  }
}

export function markBlocked(repoRoot, task, error) {
  task.state = "blocked";
  task.lastError = error instanceof Error ? error.message : String(error);
  saveTask(repoRoot, task);
}

export function writeRunSummary(repoRoot, task, summary) {
  writeText(runSummaryFile(repoRoot, task.id), summary);
}

export function writeReviewResult(repoRoot, task, round, review) {
  writeJson(reviewFile(repoRoot, task.id, round), review);
}

export function writePrRecord(repoRoot, task, pr) {
  writeJson(prFile(repoRoot, task.id), pr);
}

export function prTitle(task) {
  return `[${task.id}] ${task.intent}`;
}

export function prBody(task) {
  const summary = task.latestRunSummary || "No execution summary recorded.";
  const specPath = path.join("tasks", `task_${task.id}`, "spec.md");

  return [
    `## Task`,
    "",
    `${task.intent}`,
    "",
    `## Spec`,
    "",
    `See \`${specPath}\` in local task artifacts.`,
    "",
    `## Execution Summary`,
    "",
    summary,
  ].join("\n");
}
