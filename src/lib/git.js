import { runCommand } from "./shell.js";
import { CliError } from "./errors.js";

export function repoRoot(cwd = process.cwd()) {
  return runCommand("git", ["rev-parse", "--show-toplevel"], { cwd }).stdout.trim();
}

export function currentBranch(cwd) {
  return runCommand("git", ["branch", "--show-current"], { cwd }).stdout.trim();
}

export function ensureWorkingTreeSafe(cwd) {
  const status = runCommand("git", ["status", "--porcelain"], { cwd }).stdout.trim();

  if (status) {
    throw new CliError("Working tree is dirty. Commit, stash, or clean changes before switching task branches.");
  }
}

export function branchExists(cwd, branchName) {
  const result = runCommand("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`], {
    cwd,
    allowFailure: true,
  });
  return result.status === 0;
}

export function checkoutBranch(cwd, branchName, baseBranch) {
  if (branchExists(cwd, branchName)) {
    runCommand("git", ["checkout", branchName], { cwd });
    return;
  }

  runCommand("git", ["checkout", "-b", branchName, baseBranch], { cwd });
}

export function hasDiffAgainst(cwd, baseBranch) {
  const committed = runCommand("git", ["diff", "--quiet", baseBranch, "HEAD"], {
    cwd,
    allowFailure: true,
  });
  const workingTree = runCommand("git", ["diff", "--quiet", baseBranch], {
    cwd,
    allowFailure: true,
  });

  return committed.status !== 0 || workingTree.status !== 0;
}

export function workingTreeHasChanges(cwd) {
  return Boolean(runCommand("git", ["status", "--porcelain"], { cwd }).stdout.trim());
}

export function commitAll(cwd, message) {
  runCommand("git", ["add", "-A"], { cwd });
  const commit = runCommand("git", ["commit", "-m", message], { cwd, allowFailure: true });

  if (commit.status !== 0 && !commit.stdout.includes("nothing to commit")) {
    const details = commit.stderr.trim() || commit.stdout.trim();
    throw new CliError(`Unable to create commit: ${details}`);
  }
}

export function remoteName(cwd) {
  const remotes = runCommand("git", ["remote"], { cwd }).stdout.trim().split(/\s+/).filter(Boolean);
  return remotes.includes("origin") ? "origin" : remotes[0] ?? null;
}

export function pushBranch(cwd, remote, branchName) {
  runCommand("git", ["push", "-u", remote, branchName], { cwd });
}
