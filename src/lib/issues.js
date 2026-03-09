import { runCommand } from "./shell.js";
import { CliError } from "./errors.js";

export function issueTitle(task) {
  return `task(${task.id}): ${task.intent}`;
}

export function issueBody(task) {
  return [
    `Task ID: \`${task.id}\``,
    `State: \`${task.state}\``,
    `Base branch: \`${task.baseBranch}\``,
    `Task branch: \`${task.branchName}\``,
    "",
    "Spec:",
    "",
    task.spec.trim(),
  ].join("\n");
}

export function createIssue({ cwd, title, body }) {
  const result = runCommand("gh", ["issue", "create", "--title", title, "--body", body], { cwd });
  const url = result.stdout.trim();

  if (!url) {
    throw new CliError("Issue creation succeeded but no issue URL was returned.");
  }

  return { url };
}
