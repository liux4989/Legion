import { CliError } from "../lib/errors.js";
import { listProjects, registerProject } from "../lib/projects.js";

function usage() {
  return [
    "Usage:",
    "  legion projects add <name> <path>",
    "  legion projects list",
  ].join("\n");
}

export function manageProjects(args) {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "add": {
      const [name, projectPath] = rest;
      if (!name || !projectPath) {
        throw new CliError(usage());
      }

      const project = registerProject(name, projectPath);
      console.log(`Registered project ${project.name}`);
      console.log(`Path: ${project.path}`);
      return;
    }
    case "list": {
      const projects = listProjects();
      if (!projects.length) {
        console.log("No local projects registered.");
        return;
      }

      for (const project of projects) {
        console.log(`${project.name}\t${project.path}`);
      }
      return;
    }
    default:
      throw new CliError(usage());
  }
}
