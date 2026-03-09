import { runCommand } from "./shell.js";
import { readText } from "./fs.js";
import { specFile } from "./tasks.js";
import { CliError } from "./errors.js";

export function issueTitle(task) {
  return `task(${task.id}): ${task.intent}`;
}

export function issueBody(repoRoot, task) {
  const spec = readText(specFile(repoRoot, task.id));
  return [
    `Task ID: \`${task.id}\``,
    `State: \`${task.state}\``,
    `Base branch: \`${task.baseBranch}\``,
    `Task branch: \`${task.branchName}\``,
    "",
    "Spec:",
    "",
    spec.trim(),
  ].join("\n");
}

export function createIssue({ cwd, title, body }) {
  const result = runCommand("gh", ["issue", "create", "--title", title, "--body", body], { cwd });
  const url = result.stdout.trim();

  if (!url) {
    throw new CliError("Issue creation succeeded but no issue URL was returned.");
  }

  const match = url.match(/\/(\d+)$/);
  if (!match) {
    throw new CliError(`Could not parse issue number from URL: ${url}`);
  }

  return { url, number: Number(match[1]) };
}
