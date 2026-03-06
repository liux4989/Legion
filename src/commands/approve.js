import { createOrUpdatePr } from "../lib/pr.js";
import { checkoutBranch, commitAll, currentBranch, ensureWorkingTreeSafe, pushBranch, remoteName, repoRoot, workingTreeHasChanges } from "../lib/git.js";
import { loadTask, saveTask } from "../lib/tasks.js";
import { assertTaskState, markBlocked, prBody, prTitle, writePrRecord } from "../lib/workflow.js";
import { CliError } from "../lib/errors.js";

export async function approveTask(args) {
  const taskId = args[0];
  const root = repoRoot();

  if (!taskId) {
    throw new CliError("Usage: legion approve <task-id>");
  }

  const task = loadTask(root, taskId);
  assertTaskState(task, ["pr_ready"], "approve");

  const activeBranch = currentBranch(root);
  if (activeBranch !== task.branchName) {
    ensureWorkingTreeSafe(root);
    checkoutBranch(root, task.branchName, task.baseBranch);
  }

  try {
    if (workingTreeHasChanges(root)) {
      commitAll(root, `task(${task.id}): ${task.intent}`);
    }

    const remote = remoteName(root);

    if (!remote) {
      throw new CliError("No git remote configured. Add a remote before creating a PR.");
    }

    pushBranch(root, remote, task.branchName);

    const pr = createOrUpdatePr({
      cwd: root,
      branchName: task.branchName,
      baseBranch: task.baseBranch,
      title: prTitle(task),
      body: prBody(task),
    });

    task.prUrl = pr.url;
    task.state = "done";
    task.lastError = null;
    saveTask(root, task);
    writePrRecord(root, task, pr);

    console.log(`PR ready: ${pr.url}`);
    console.log(`State: done`);
  } catch (error) {
    markBlocked(root, task, error);
    console.error(task.lastError);
  }
}
