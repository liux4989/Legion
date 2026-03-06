import { runCommand } from "./shell.js";
import { CliError } from "./errors.js";

export function findExistingPr(cwd, branchName) {
  const result = runCommand(
    "gh",
    ["pr", "list", "--head", branchName, "--json", "number,url,title", "--limit", "1"],
    { cwd, allowFailure: true },
  );

  if (result.status !== 0) {
    return null;
  }

  try {
    const items = JSON.parse(result.stdout);
    return items[0] ?? null;
  } catch {
    return null;
  }
}

export function createOrUpdatePr({ cwd, branchName, baseBranch, title, body }) {
  const existing = findExistingPr(cwd, branchName);

  if (existing) {
    runCommand("gh", ["pr", "edit", String(existing.number), "--title", title, "--body", body], { cwd });
    return findExistingPr(cwd, branchName) ?? existing;
  }

  runCommand("gh", ["pr", "create", "--base", baseBranch, "--head", branchName, "--title", title, "--body", body], {
    cwd,
  });

  const created = findExistingPr(cwd, branchName);

  if (!created) {
    throw new CliError("PR creation succeeded but the PR could not be looked up afterwards.");
  }

  return created;
}
