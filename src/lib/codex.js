import { runCommand, runCommandInheritAsync, runCommandInteractive } from "./shell.js";

function buildInteractiveArgs(prompt) {
  return ["--no-alt-screen", prompt];
}

async function runCodexSession(repoRoot, prompt) {
  const result = await runCommandInheritAsync("codex", ["--full-auto", ...buildInteractiveArgs(prompt)], {
    cwd: repoRoot,
    allowFailure: true,
  });

  if (result.status !== 0) {
    return { ok: false, error: `Codex exited with code ${result.status}` };
  }

  return { ok: true };
}

export async function runCodexTaskSession({ repoRoot, prompt }) {
  return runCodexSession(repoRoot, prompt);
}

export function runCodexOneshot({ repoRoot, prompt }) {
  const result = runCommand("codex", ["exec", "--full-auto", prompt], {
    cwd: repoRoot,
    allowFailure: true,
  });

  if (result.status !== 0) {
    throw new Error(`Codex exited with code ${result.status}: ${result.stderr.trim()}`);
  }

  return result.stdout.trim();
}

export function runCodexTaskInteractive({ repoRoot, prompt }) {
  const result = runCommandInteractive("codex", buildInteractiveArgs(prompt), {
    cwd: repoRoot,
    allowFailure: true,
  });

  if (result.status !== 0) {
    return { ok: false, error: `Codex exited with code ${result.status}` };
  }

  return { ok: true };
}
