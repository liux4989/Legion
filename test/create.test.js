import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { createTask } from "../src/commands/create.js";
import { CliError } from "../src/lib/errors.js";

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createGitRepo(parentDir, name) {
  const repoPath = path.join(parentDir, name);
  fs.mkdirSync(repoPath, { recursive: true });
  execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
  return repoPath;
}

function writeExecutable(filePath, contents) {
  fs.writeFileSync(filePath, contents);
  fs.chmodSync(filePath, 0o755);
}

async function withEnv(overrides, run) {
  const previous = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
        continue;
      }
      process.env[key] = value;
    }
  }
}

test("createTask keeps local spec and task record when issue creation fails", async () => {
  const tempHome = makeTempDir("legion-home-");
  const workspace = makeTempDir("legion-create-");
  const repoPath = createGitRepo(workspace, "repo");
  const binDir = path.join(workspace, "bin");
  fs.mkdirSync(binDir, { recursive: true });

  writeExecutable(
    path.join(binDir, "codex"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const prompt = process.argv[process.argv.length - 1];
const match = prompt.match(/write the final result as raw markdown to this absolute path:\\n([^\\n]+)/);
if (!match) {
  console.error("missing output path");
  process.exit(1);
}
const outputFile = match[1].trim();
fs.mkdirSync(path.dirname(outputFile), { recursive: true });
fs.writeFileSync(outputFile, "# Generated spec\\n\\nBody from fake codex\\n");
`,
  );

  writeExecutable(
    path.join(binDir, "gh"),
    `#!/usr/bin/env node
console.error("simulated gh failure");
process.exit(1);
`,
  );

  try {
    await withEnv(
      {
        HOME: tempHome,
        PATH: `${binDir}${path.delimiter}${process.env.PATH || ""}`,
      },
      async () => {
        await assert.rejects(
          () => createTask(["--project", repoPath, "Persist generated spec"]),
          (error) =>
            error instanceof CliError &&
            error.message.includes("gh issue create") &&
            error.message.includes("simulated gh failure"),
        );
      },
    );
  } catch (error) {
    fs.rmSync(tempHome, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
    throw error;
  }

  const tasksRoot = path.join(repoPath, "tasks");
  const [taskDirName] = fs.readdirSync(tasksRoot);
  const taskDir = path.join(tasksRoot, taskDirName);
  const specPath = path.join(taskDir, "spec.md");
  const taskPath = path.join(taskDir, "task.json");
  const spec = fs.readFileSync(specPath, "utf8");
  const task = JSON.parse(fs.readFileSync(taskPath, "utf8"));

  assert.equal(spec, "# Generated spec\n\nBody from fake codex\n");
  assert.equal(task.spec, spec);
  assert.equal(task.issueUrl, null);
  assert.equal(task.intent, "Persist generated spec");

  fs.rmSync(tempHome, { recursive: true, force: true });
  fs.rmSync(workspace, { recursive: true, force: true });
});
