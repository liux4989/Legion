import path from "node:path";
import { CliError } from "./errors.js";
import { saveTask, specFile } from "./tasks.js";
import { readText } from "./fs.js";

const TASK_TRANSITIONS = {
  ready: {
    start_fixing: "fixing",
  },
  fixing: {
    fixing_succeeded: "reviewing",
  },
  reviewing: {
    review_passed: "pr_ready",
    review_failed: "fixing",
  },
  pr_ready: {},
  done: {},
};

export function assertTaskState(task, allowedStates, action) {
  if (!allowedStates.includes(task.state)) {
    throw new CliError(`Cannot ${action} task ${task.id} while state is ${task.state}. Allowed: ${allowedStates.join(", ")}`);
  }
}

export function transitionTask(task, event) {
  const nextState = TASK_TRANSITIONS[task.state]?.[event];

  if (!nextState) {
    throw new CliError(`Invalid transition for task ${task.id}: ${task.state} -> ${event}`);
  }

  task.state = nextState;
  return task;
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

export function prBody(repoRoot, task) {
  const summary = task.latestRunSummary || "No execution summary recorded.";
  const specPath = path.join("tasks", `task_${task.id}`, "spec.md");
  const spec = readText(specFile(repoRoot, task.id));

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
