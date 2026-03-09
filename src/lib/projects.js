import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./git.js";
import { CliError } from "./errors.js";

function ensureReadableDirectory(projectRoot) {
  let stat;
  try {
    stat = fs.statSync(projectRoot);
  } catch (error) {
    throw new CliError(`Project path does not exist or is inaccessible: ${projectRoot}`, { cause: error });
  }

  if (!stat.isDirectory()) {
    throw new CliError(`Project path is not a directory: ${projectRoot}`);
  }

  try {
    fs.accessSync(projectRoot, fs.constants.R_OK);
  } catch (error) {
    throw new CliError(`Project path is not readable: ${projectRoot}`, { cause: error });
  }
}

export function canonicalProjectRoot(projectPath) {
  const absolutePath = path.resolve(projectPath);
  ensureReadableDirectory(absolutePath);

  let gitRoot;
  try {
    gitRoot = repoRoot(absolutePath);
  } catch (error) {
    throw new CliError(`Project path is not a supported local project: ${absolutePath}`, { cause: error });
  }

  return fs.realpathSync(gitRoot);
}

export function resolveProjectContext(cwd = process.cwd()) {
  const root = canonicalProjectRoot(cwd);

  return {
    root,
    name: path.basename(root),
    path: root,
  };
}
