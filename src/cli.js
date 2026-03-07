import { createTask } from "./commands/create.js";
import { runTask } from "./commands/run.js";
import { prTask } from "./commands/pr.js";
import { manageProjects } from "./commands/projects.js";
import { CliError, formatError } from "./lib/errors.js";

function usage() {
  return [
    "Usage:",
    '  legion create [--project <name|path>] "<intent>"',
    "  legion run [--project <name|path>] <task-id>",
    "  legion pr [--project <name|path>] <task-id>",
    "  legion projects add <name> <path>",
    "  legion projects list",
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
      case "pr":
        return await prTask(rest);
      case "projects":
        return manageProjects(rest);
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
