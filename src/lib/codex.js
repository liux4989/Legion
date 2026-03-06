import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand } from "./shell.js";
import { CliError } from "./errors.js";

function tmpFile(prefix, extension) {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`);
}

function parseJsonLines(stdout) {
  const events = [];

  for (const line of stdout.split("\n")) {
    if (!line.trim()) {
      continue;
    }

    try {
      events.push(JSON.parse(line));
    } catch (error) {
      throw new CliError(`Unable to parse Codex JSON output: ${line}`, { cause: error });
    }
  }

  return events;
}

function extractThreadId(events) {
  return events.find((event) => event.type === "thread.started")?.thread_id ?? null;
}

function readLastMessage(filePath) {
  if (!fs.existsSync(filePath)) {
    return "";
  }

  return fs.readFileSync(filePath, "utf8").trim();
}

function buildCommonArgs(lastMessageFile) {
  const extraArgs = process.env.LEGION_CODEX_ARGS?.trim()
    ? process.env.LEGION_CODEX_ARGS.trim().split(/\s+/)
    : [];

  return ["--json", "--full-auto", "--output-last-message", lastMessageFile, ...extraArgs];
}

export function runCodexTask({ repoRoot, prompt, resumeSessionId = null }) {
  const lastMessageFile = tmpFile("legion-run-summary", "md");
  const commandArgs = resumeSessionId
    ? ["exec", "resume", ...buildCommonArgs(lastMessageFile), resumeSessionId, "-"]
    : ["exec", ...buildCommonArgs(lastMessageFile), "-"];

  const result = runCommand("codex", commandArgs, {
    cwd: repoRoot,
    input: prompt,
    allowFailure: true,
  });

  const events = parseJsonLines(result.stdout);

  if (result.status !== 0) {
    const message = readLastMessage(lastMessageFile) || result.stderr.trim() || "Codex execution failed";
    return {
      ok: false,
      sessionId: extractThreadId(events) ?? resumeSessionId,
      summary: message,
      rawOutput: result.stdout,
      error: message,
    };
  }

  return {
    ok: true,
    sessionId: extractThreadId(events) ?? resumeSessionId,
    summary: readLastMessage(lastMessageFile),
    rawOutput: result.stdout,
  };
}

export function reviewWithCodex({ repoRoot, baseBranch, prompt }) {
  const lastMessageFile = tmpFile("legion-review", "json");

  const result = runCommand(
    "codex",
    ["exec", "review", "--base", baseBranch, ...buildCommonArgs(lastMessageFile), "-"],
    {
      cwd: repoRoot,
      input: prompt,
      allowFailure: true,
    },
  );

  const events = parseJsonLines(result.stdout);
  const lastMessage = readLastMessage(lastMessageFile);

  if (result.status !== 0) {
    return {
      ok: false,
      sessionId: extractThreadId(events),
      error: lastMessage || result.stderr.trim() || "Codex review failed",
    };
  }

  try {
    return {
      ok: true,
      sessionId: extractThreadId(events),
      review: JSON.parse(lastMessage),
    };
  } catch (error) {
    return {
      ok: false,
      sessionId: extractThreadId(events),
      error: `Review output was not valid JSON: ${lastMessage}`,
      cause: error,
    };
  }
}
