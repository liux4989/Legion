import { createOrUpdatePr } from "../lib/pr.js";
import { checkoutBranch, commitAll, currentBranch, ensureWorkingTreeSafe, pushBranch, remoteName, resolveBaseBranch, taskCommitMessage, workingTreeHasChanges } from "../lib/git.js";
import { effectiveTaskState, loadTask, saveTask } from "../lib/tasks.js";
import { assertTaskState, recordError, clearError, prBody, prTitle } from "../lib/workflow.js";
import { CliError } from "../lib/errors.js";
import { resolveProjectContext } from "../lib/projects.js";

export async function finalizeTaskPr(taskId) {
  if (!taskId) {
    throw new CliError("Task ID is required.");
  }

  const project = resolveProjectContext();
  const root = project.root;

  const task = loadTask(root, taskId);
  task.state = effectiveTaskState(root, task);
  const baseBranch = resolveBaseBranch(root, task.baseBranch);

  if (baseBranch !== task.baseBranch) {
    task.baseBranch = baseBranch;
    saveTask(root, task);
  }

  assertTaskState(task, ["pr_ready"], "open PR for");

  const activeBranch = currentBranch(root);
  if (activeBranch !== task.branchName) {
    ensureWorkingTreeSafe(root);
    checkoutBranch(root, task.branchName, task.baseBranch);
  }

  try {
    console.log(`Project: ${project.name} (${project.path})`);

    if (workingTreeHasChanges(root)) {
      commitAll(root, taskCommitMessage(task, "pr"));
    }

    const remote = remoteName(root);

    if (!remote) {
      throw new CliError("No git remote configured. Add a remote before creating a PR.");
    }

    pushBranch(root, remote, task.branchName);

    const pr = createOrUpdatePr({
      cwd: root,
      branchName: task.branchName,
      baseBranch,
      title: prTitle(task),
      body: prBody(root, task),
    });

    task.prUrl = pr.url;
    task.state = "done";
    clearError(root, task);
    saveTask(root, task);

    console.log(`PR ready: ${pr.url}`);
    console.log(`State: done`);
  } catch (error) {
    recordError(root, task, error);
    console.error(task.lastError);
  }
}
