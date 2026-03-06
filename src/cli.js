import { createTask } from "./commands/create.js";
import { runTask } from "./commands/run.js";
import { reviewTask } from "./commands/review.js";
import { prTask } from "./commands/pr.js";
import { CliError, formatError } from "./lib/errors.js";

function usage() {
  return [
    "Usage:",
    '  legion create "<intent>"',
    "  legion run <task-id>",
    "  legion review <task-id>",
    "  legion pr <task-id>",
  ].join("\n");
}

export async function main(argv) {
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case "create":
        return await createTask(rest);
      case "run":
        return await runTask(rest);
      case "review":
        return await reviewTask(rest);
      case "pr":
        return await prTask(rest);
      case "--help":
      case "-h":
      case undefined:
        console.log(usage());
        return;
      default:
        throw new CliError(`Unknown command: ${command}\n\n${usage()}`);
    }
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
}
