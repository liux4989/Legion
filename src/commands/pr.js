import { createOrUpdatePr } from "../lib/pr.js";
import { checkoutBranch, commitAll, currentBranch, ensureWorkingTreeSafe, pushBranch, remoteName, workingTreeHasChanges } from "../lib/git.js";
import { loadTask, saveTask } from "../lib/tasks.js";
import { assertTaskState, recordError, clearError, prBody, prTitle } from "../lib/workflow.js";
import { CliError } from "../lib/errors.js";
import { parseProjectArgs, resolveProjectContext } from "../lib/projects.js";

export async function prTask(args) {
  const parsed = parseProjectArgs(args);
  const taskId = parsed.args[0];

  if (!taskId) {
    throw new CliError("Usage: legion pr [--project <name|path>] <task-id>");
  }

  const project = resolveProjectContext(parsed.projectRef);
  const root = project.root;

  const task = loadTask(root, taskId);
  assertTaskState(task, ["pr_ready"], "open PR for");

  const activeBranch = currentBranch(root);
  if (activeBranch !== task.branchName) {
    ensureWorkingTreeSafe(root);
    checkoutBranch(root, task.branchName, task.baseBranch);
  }

  try {
    console.log(`Project: ${project.name} (${project.path})`);

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
    clearError(root, task);
    saveTask(root, task);

    console.log(`PR ready: ${pr.url}`);
    console.log(`State: done`);
  } catch (error) {
    recordError(root, task, error);
    console.error(task.lastError);
  }
}
