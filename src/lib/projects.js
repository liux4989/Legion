import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "./git.js";
import { CliError } from "./errors.js";

function configDir() {
  const home = os.homedir();

  if (!home) {
    throw new CliError("Unable to determine the current user's home directory.");
  }

  return path.join(home, "Library", "Application Support", "Legion");
}

function registryFile() {
  return path.join(configDir(), "projects.json");
}

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

function normalizeRegistry(raw) {
  if (!raw) {
    return { projects: [] };
  }

  if (!Array.isArray(raw.projects)) {
    throw new CliError(`Invalid Legion project registry: ${registryFile()}`);
  }

  const projects = raw.projects.map((project, index) => {
    if (!project || typeof project !== "object") {
      throw new CliError(`Invalid Legion project entry at index ${index}.`);
    }
    if (typeof project.name !== "string" || !project.name.trim()) {
      throw new CliError(`Legion project entry ${index} is missing a valid name.`);
    }
    if (typeof project.path !== "string" || !project.path.trim()) {
      throw new CliError(`Legion project entry ${index} is missing a valid path.`);
    }
    return {
      name: project.name.trim(),
      path: project.path.trim(),
    };
  });

  return { projects };
}

export function loadProjectRegistry() {
  const filePath = registryFile();

  if (!fs.existsSync(filePath)) {
    return { projects: [] };
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new CliError(`Failed to read Legion project registry: ${filePath}`, { cause: error });
  }

  return normalizeRegistry(parsed);
}

function saveProjectRegistry(registry) {
  const dirPath = configDir();
  fs.mkdirSync(dirPath, { recursive: true });
  fs.writeFileSync(registryFile(), `${JSON.stringify(registry, null, 2)}\n`);
}

export function registerProject(name, projectPath) {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new CliError("Project name must not be empty.");
  }

  const root = canonicalProjectRoot(projectPath);
  const registry = loadProjectRegistry();

  if (registry.projects.some((project) => project.name === trimmedName)) {
    throw new CliError(`A project named "${trimmedName}" is already registered.`);
  }

  if (registry.projects.some((project) => project.path === root)) {
    throw new CliError(`Project path is already registered: ${root}`);
  }

  registry.projects.push({ name: trimmedName, path: root });
  registry.projects.sort((left, right) => left.name.localeCompare(right.name));
  saveProjectRegistry(registry);

  return { name: trimmedName, path: root };
}

export function listProjects() {
  return loadProjectRegistry().projects;
}

export function parseProjectArgs(args) {
  const remaining = [];
  let projectRef = null;

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--project") {
      projectRef = args[index + 1];
      index += 1;
      continue;
    }
    remaining.push(value);
  }

  if (args.includes("--project") && !projectRef) {
    throw new CliError("Usage error: --project requires a value.");
  }

  return { projectRef, args: remaining };
}

function resolveRegisteredProject(projectRef, registry) {
  const byName = registry.projects.find((project) => project.name === projectRef);
  if (byName) {
    return byName;
  }

  const absolutePath = path.resolve(projectRef);
  const byPath = registry.projects.find((project) => project.path === absolutePath);
  if (byPath) {
    return byPath;
  }

  return null;
}

export function resolveProjectContext(projectRef, cwd = process.cwd()) {
  const registry = loadProjectRegistry();

  if (projectRef) {
    const registered = resolveRegisteredProject(projectRef, registry);
    const root = registered ? canonicalProjectRoot(registered.path) : canonicalProjectRoot(projectRef);
    const project = registered ?? {
      name: path.basename(root),
      path: root,
    };

    if (project.path !== root) {
      throw new CliError(`Registered project path does not match its git root: ${project.path}`);
    }

    return {
      root,
      name: project.name,
      path: project.path,
      explicit: true,
    };
  }

  try {
    const root = canonicalProjectRoot(cwd);
    const registered = registry.projects.find((project) => project.path === root);

    if (registry.projects.length > 1 && !registered) {
      throw new CliError("Multiple local projects are registered. Re-run with --project <name>.");
    }

    return {
      root,
      name: registered?.name ?? path.basename(root),
      path: root,
      explicit: false,
    };
  } catch (error) {
    if (registry.projects.length === 1) {
      const [project] = registry.projects;
      const root = canonicalProjectRoot(project.path);
      return {
        root,
        name: project.name,
        path: root,
        explicit: false,
      };
    }

    if (registry.projects.length > 1) {
      throw new CliError("Multiple local projects are registered. Re-run with --project <name>.");
    }

    if (error instanceof CliError) {
      throw new CliError("No local project selected. Run this command inside a git project or pass --project <path>.");
    }

    throw error;
  }
}
