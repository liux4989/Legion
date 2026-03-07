import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { CliError } from "../src/lib/errors.js";
import { registerProject, resolveProjectContext } from "../src/lib/projects.js";

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createGitRepo(parentDir, name) {
  const repoPath = path.join(parentDir, name);
  fs.mkdirSync(repoPath, { recursive: true });
  execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
  return repoPath;
}

function withTempHome(run) {
  const originalHome = process.env.HOME;
  const tempHome = makeTempDir("legion-home-");
  process.env.HOME = tempHome;

  try {
    return run(tempHome);
  } finally {
    if (originalHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = originalHome;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

test("resolveProjectContext rejects an unregistered current repo when multiple projects are registered", () => {
  withTempHome(() => {
    const workspace = makeTempDir("legion-projects-");

    try {
      const repoA = createGitRepo(workspace, "repo-a");
      const repoB = createGitRepo(workspace, "repo-b");
      const repoC = createGitRepo(workspace, "repo-c");

      registerProject("app-a", repoA);
      registerProject("app-b", repoB);

      assert.throws(
        () => resolveProjectContext(null, repoC),
        (error) =>
          error instanceof CliError &&
          error.message === "Multiple local projects are registered. Re-run with --project <name>.",
      );
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});

test("resolveProjectContext still infers a registered current repo when multiple projects are registered", () => {
  withTempHome(() => {
    const workspace = makeTempDir("legion-projects-");

    try {
      const repoA = createGitRepo(workspace, "repo-a");
      const repoB = createGitRepo(workspace, "repo-b");

      registerProject("app-a", repoA);
      registerProject("app-b", repoB);

      assert.deepEqual(resolveProjectContext(null, repoB), {
        root: fs.realpathSync(repoB),
        name: "app-b",
        path: fs.realpathSync(repoB),
        explicit: false,
      });
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});

test("resolveProjectContext resolves an explicit registered project by name", () => {
  withTempHome(() => {
    const workspace = makeTempDir("legion-projects-");

    try {
      const repoA = createGitRepo(workspace, "repo-a");
      const repoB = createGitRepo(workspace, "repo-b");
      const repoC = createGitRepo(workspace, "repo-c");

      registerProject("app-a", repoA);
      registerProject("app-b", repoB);

      assert.deepEqual(resolveProjectContext("app-a", repoC), {
        root: fs.realpathSync(repoA),
        name: "app-a",
        path: fs.realpathSync(repoA),
        explicit: true,
      });
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});

test("resolveProjectContext throws for an explicit invalid project path", () => {
  withTempHome(() => {
    const workspace = makeTempDir("legion-projects-");
    const missingPath = path.join(workspace, "missing-project");

    try {
      assert.throws(
        () => resolveProjectContext(missingPath, workspace),
        (error) =>
          error instanceof CliError &&
          error.message === `Project path does not exist or is inaccessible: ${missingPath}`,
      );
    } finally {
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
