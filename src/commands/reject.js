import { repoRoot } from "../lib/git.js";
import { loadTask, saveTask } from "../lib/tasks.js";
import { CliError } from "../lib/errors.js";

export async function rejectTask(args) {
  const [taskId, ...reasonParts] = args;
  const root = repoRoot();

  if (!taskId) {
    throw new CliError("Usage: legion reject <task-id> [reason]");
  }

  const task = loadTask(root, taskId);
  const reason = reasonParts.join(" ").trim() || "Rejected by human.";

  task.state = "blocked";
  task.lastError = reason;
  saveTask(root, task);

  console.log(`Rejected ${task.id}`);
  console.log(`State: blocked`);
  console.log(reason);
}
