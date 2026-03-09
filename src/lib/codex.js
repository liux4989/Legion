import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCommandInteractive, runCommandInheritAsync } from "./shell.js";

const LEGION_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const NOTIFY_HOOK = path.join(LEGION_ROOT, "bin", "legion-notify");

function tmpFile(prefix, extension) {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function buildInteractiveArgs(prompt) {
  const extraArgs = process.env.LEGION_CODEX_ARGS?.trim()
    ? process.env.LEGION_CODEX_ARGS.trim().split(/\s+/)
    : [];

  return ["--no-alt-screen", "-c", `notify=[${JSON.stringify(NOTIFY_HOOK)}]`, ...extraArgs, prompt];
}

function appendJsonFileInstructions(prompt, outputFile) {
  return `${prompt}

Before you finish, write the final result as raw JSON to this absolute path:
${outputFile}

Rules for that file:
- The file must contain JSON only.
- Do not wrap the JSON in markdown.
- Ensure the file exists before you exit.`;
}

function appendTextFileInstructions(prompt, outputFile, formatLabel) {
  return `${prompt}

Before you finish, write the final result as raw ${formatLabel} to this absolute path:
${outputFile}

Rules for that file:
- The file must contain ${formatLabel} only.
- Ensure the file exists before you exit.`;
}

function runInlineCodex(repoRoot, prompt) {
  const result = runCommandInteractive("codex", buildInteractiveArgs(prompt), {
    cwd: repoRoot,
    allowFailure: true,
  });

  if (result.status !== 0) {
    return {
      ok: false,
      error: `Codex exited with code ${result.status}`,
    };
  }

  return { ok: true };
}

export async function generateTextWithCodex({
  repoRoot,
  prompt,
  prefix = "legion",
  extension = "md",
  formatLabel = "markdown",
  outputFile,
}) {
  const filePath = outputFile || tmpFile(prefix, extension);
  const inlinePrompt = appendTextFileInstructions(prompt, filePath, formatLabel);
  const shouldCleanup = !outputFile;

  try {
    const result = runInlineCodex(repoRoot, inlinePrompt);

    if (!result.ok) {
      return result;
    }

    if (!fs.existsSync(filePath)) {
      return {
        ok: false,
        error: `Codex did not write the expected ${formatLabel} output file: ${filePath}`,
      };
    }

    return {
      ok: true,
      value: readTextFile(filePath),
    };
  } finally {
    if (shouldCleanup) {
      fs.rmSync(filePath, { force: true });
    }
  }
}

const CODEX_TURN_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

async function watchForFile(filePath, timeoutMs, pollMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return "found";
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return "timeout";
}

async function runCodexAutoExit(repoRoot, prompt) {
  const sentinelFile = tmpFile("legion-sentinel", "flag");

  let child;
  const runPromise = runCommandInheritAsync("codex", ["--full-auto", ...buildInteractiveArgs(prompt)], {
    cwd: repoRoot,
    allowFailure: true,
    env: { LEGION_SENTINEL_FILE: sentinelFile },
    onChild(c) { child = c; },
  });

  try {
    // Race: sentinel written (turn done) vs codex self-exit vs timeout
    const outcome = await Promise.race([
      runPromise.then(() => "exited"),
      watchForFile(sentinelFile, CODEX_TURN_TIMEOUT_MS),
    ]);

    if (outcome === "timeout") {
      child?.kill("SIGINT");
      await runPromise;
      return { ok: false, error: `Codex did not complete a turn within ${CODEX_TURN_TIMEOUT_MS / 60000} minutes` };
    }

    if (outcome === "found") {
      // Turn complete — codex is still running (full-auto loops), stop it
      child?.kill("SIGINT");
    }

    // "exited" or post-kill: wait for the process to fully close
    const result = await runPromise;
    // exit 130 = terminated by SIGINT, which is the expected success path
    if (result.status !== 0 && result.status !== 130) {
      return { ok: false, error: `Codex exited with code ${result.status}` };
    }
    return { ok: true };
  } finally {
    fs.rmSync(sentinelFile, { force: true });
  }
}

export async function runCodexTaskAutoExit({ repoRoot, prompt }) {
  const result = await runCodexAutoExit(repoRoot, prompt);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    summary: "Completed via inline Codex session. Review the working tree for implementation details.",
  };
}


