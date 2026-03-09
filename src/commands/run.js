import { loadTask, saveTask, specFile } from "../lib/tasks.js";
import { assertTaskState, recordError, transitionTask } from "../lib/workflow.js";
import { checkoutBranch, commitAll, currentBranch, ensureWorkingTreeSafe, hasDiffAgainst, workingTreeHasChanges } from "../lib/git.js";
import { runCodexTaskAutoExit, reviewWithCodexMarkdown } from "../lib/codex.js";
import { CliError } from "../lib/errors.js";
import { parseProjectArgs, resolveProjectContext } from "../lib/projects.js";

const MAX_ITERATIONS = 3;

function buildRunPrompt(task) {
  const feedback = task.latestReviewFeedback
    ? `\nReview feedback to address before you finish:\n${task.latestReviewFeedback}\n`
    : "";

  return `You are working on Legion task ${task.id}.

Read the task spec at: tasks/task_${task.id}/spec.md
Inspect the repository, implement the requested change, and run relevant checks.

Do not broaden scope beyond the spec.
${feedback}
When you are done, summarize:
- what changed
- what checks ran
- any remaining caveats`;
}

function buildReviewPrompt(root, task) {
  return `Review task ${task.id} against the spec file at: ${specFile(root, task.id)}

Use git to compare the current branch against base branch ${task.baseBranch}.

Only check:
- correctness
- regressions
- mismatch against the spec
- missing tests if clearly required

Do not request unrelated refactors or broader product changes.

Write your review in this exact format:

DECISION: pass|fail

SUMMARY: <one paragraph explaining the review outcome>

FINDINGS:
- [severity] title (file/path): detail`;
}

function parseReviewMarkdown(text) {
  const decisionMatch = text.match(/^DECISION:\s*(pass|fail)\s*$/m);
  if (!decisionMatch) {
    throw new CliError('Review output must include a "DECISION: pass" or "DECISION: fail" line.');
  }

  const summaryMatch = text.match(/^SUMMARY:\s*(.+)$/m);
  if (!summaryMatch || !summaryMatch[1].trim()) {
    throw new CliError("Review output must include a non-empty SUMMARY line.");
  }

  const findings = [];
  const findingsSection = text.split(/^FINDINGS:\s*$/m)[1];
  if (findingsSection) {
    for (const match of findingsSection.matchAll(/^- \[(\w+)\]\s+(.+?)(?:\s+\(([^)]+)\))?:\s*(.+)$/gm)) {
      findings.push({ severity: match[1], title: match[2], file: match[3] || null, detail: match[4] });
    }
  }

  return { decision: decisionMatch[1], summary: summaryMatch[1].trim(), findings };
}

async function executePhase(root, task) {
  if (task.state === "ready") {
    transitionTask(task, "start_fixing");
  }
  task.lastError = null;
  saveTask(root, task);

  const result = await runCodexTaskAutoExit({
    repoRoot: root,
    prompt: buildRunPrompt(task),
  });

  if (!result.ok) {
    recordError(root, task, result.error);
    return false;
  }

  if (workingTreeHasChanges(root)) {
    commitAll(root, `task(${task.id}): ${task.intent}`);
  }

  task.latestRunSummary = result.summary;
  task.latestReviewFeedback = null;
  task.latestReviewSummary = null;
  transitionTask(task, "fixing_succeeded");
  task.lastError = null;
  saveTask(root, task);
  console.log(`\n── execute done ── state: reviewing`);
  return true;
}

async function reviewPhase(root, task) {
  if (!hasDiffAgainst(root, task.baseBranch)) {
    console.error(`No diff against ${task.baseBranch}. Nothing to review.`);
    return false;
  }

  const result = await reviewWithCodexMarkdown({
    repoRoot: root,
    prompt: buildReviewPrompt(root, task),
  });

  if (!result.ok) {
    recordError(root, task, result.error);
    return false;
  }

  let review;
  try {
    review = parseReviewMarkdown(result.value);
  } catch (error) {
    recordError(root, task, error);
    return false;
  }

  task.latestReviewSummary = review.summary;

  if (review.decision === "pass") {
    transitionTask(task, "review_passed");
    task.latestReviewFeedback = null;
    task.lastError = null;
    saveTask(root, task);
    console.log(`\n── review passed ── state: pr_ready`);
    return true;
  }

  const findingsText = review.findings
    .map((f, i) => {
      const loc = f.file ? ` (${f.file})` : "";
      return `${i + 1}. [${f.severity}] ${f.title}${loc}\n${f.detail}`;
    })
    .join("\n\n");

  task.latestReviewFeedback = `${review.summary}\n\n${findingsText}`;
  transitionTask(task, "review_failed");
  task.lastError = null;
  saveTask(root, task);
  console.log(`\n── review failed ── looping back to execute`);
  return true;
}

export async function runTask(args) {
  const parsed = parseProjectArgs(args);
  const taskId = parsed.args[0];

  if (!taskId) {
    throw new CliError("Usage: legion run [--project <name|path>] <task-id>");
  }

  const project = resolveProjectContext(parsed.projectRef);
  const root = project.root;

  let task = loadTask(root, taskId);
  assertTaskState(task, ["ready", "fixing", "reviewing"], "run");

  const activeBranch = currentBranch(root);
  if (activeBranch !== task.branchName) {
    ensureWorkingTreeSafe(root);
    checkoutBranch(root, task.branchName, task.baseBranch);
  }

  console.log(`Project: ${project.name} (${project.path})`);
  console.log(`Starting autonomous loop for ${task.id} (max ${MAX_ITERATIONS} iterations, Ctrl-C to stop)`);

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    task = loadTask(root, taskId);

    if (task.state === "ready" || task.state === "fixing") {
      if (!await executePhase(root, task)) break;
      task = loadTask(root, taskId);
    }

    if (task.state === "reviewing") {
      if (!await reviewPhase(root, task)) break;
      task = loadTask(root, taskId);
    }

    if (task.state === "pr_ready") {
      console.log(`Task ${task.id} is ready for PR. Run: legion pr ${task.id}`);
      return;
    }
  }

  task = loadTask(root, taskId);
  if (task.state !== "pr_ready") {
    console.log(`Loop ended. Task ${task.id} state: ${task.state}`);
  }
}
