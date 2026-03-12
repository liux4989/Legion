import { commitAll } from "../lib/git.js";
import { CliError } from "../lib/errors.js";

function resolveMessage(args) {
  const message = args.join(" ").trim();

  if (!message) {
    throw new CliError("Usage: legion auto-commit <message>");
  }

  return message;
}

export async function autoCommitTask(args = []) {
  commitAll(process.cwd(), resolveMessage(args));
}

export const autoCommit = autoCommitTask;
export const runAutoCommit = autoCommitTask;
export const handleAutoCommitCommand = autoCommitTask;
export default autoCommitTask;
