import path from "node:path";
import { repoRoot } from "../lib/git.js";
import { loadTask } from "../lib/tasks.js";
import { CliError } from "../lib/errors.js";

export async function showStatus(args) {
  const taskId = args[0];
  const root = repoRoot();

  if (!taskId) {
    throw new CliError("Usage: legion status <task-id>");
  }

  const task = loadTask(root, taskId);

  console.log(`Task: ${task.id}`);
  console.log(`Intent: ${task.intent}`);
  console.log(`State: ${task.state}`);
  console.log(`Base branch: ${task.baseBranch}`);
  console.log(`Task branch: ${task.branchName}`);
  console.log(`Review count: ${task.reviewCount}`);
  console.log(`Session id: ${task.agentSessionId ?? "-"}`);
  console.log(`PR URL: ${task.prUrl ?? "-"}`);
  console.log(`Task dir: ${path.join("tasks", `task_${task.id}`)}`);

  if (task.latestRunSummary) {
    console.log("\nLatest run summary:");
    console.log(task.latestRunSummary);
  }

  if (task.latestReviewSummary) {
    console.log("\nLatest review summary:");
    console.log(task.latestReviewSummary);
  }

  if (task.lastError) {
    console.log("\nLast error:");
    console.log(task.lastError);
  }
}
