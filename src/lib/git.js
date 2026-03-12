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

export function resolveStartSha(cwd, baseBranch) {
  return runCommand("git", ["rev-parse", baseBranch], { cwd }).stdout.trim();
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

export function taskCommitMessage(task, phase) {
  return `task(${task.id}/${phase}): ${task.intent}`;
}


export function remoteName(cwd) {
  const remotes = runCommand("git", ["remote"], { cwd }).stdout.trim().split(/\s+/).filter(Boolean);
  return remotes.includes("origin") ? "origin" : remotes[0] ?? null;
}

export function pushBranch(cwd, remote, branchName) {
  runCommand("git", ["push", "-u", remote, branchName], { cwd });
}

export function hasUnpushedCommits(cwd, branchName) {
  const remote = remoteName(cwd);
  if (!remote) return false;
  const result = runCommand("git", ["rev-list", "--count", `${remote}/${branchName}..${branchName}`], {
    cwd,
    allowFailure: true,
  });
  if (result.status !== 0) return false;
  return parseInt(result.stdout.trim(), 10) > 0;
}

export function pushUnpushedCommits(cwd, branchName) {
  const remote = remoteName(cwd);
  if (!remote) {
    throw new CliError("No git remote configured.");
  }
  console.log(`Pushing unpushed commits on ${branchName} to ${remote}...`);
  pushBranch(cwd, remote, branchName);
}
