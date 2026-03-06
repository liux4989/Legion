import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand, runCommandStreaming } from "./shell.js";
import { CliError } from "./errors.js";
import { buildSpecPrompt, normalizeGeneratedSpec } from "./spec.js";

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

function parseStreamingJsonLines(chunk, state, onEvent) {
  state.buffer += chunk;

  while (true) {
    const newlineIndex = state.buffer.indexOf("\n");

    if (newlineIndex === -1) {
      break;
    }

    const line = state.buffer.slice(0, newlineIndex).trim();
    state.buffer = state.buffer.slice(newlineIndex + 1);

    if (!line) {
      continue;
    }

    let event;

    try {
      event = JSON.parse(line);
    } catch (error) {
      throw new CliError(`Unable to parse Codex JSON output: ${line}`, { cause: error });
    }

    state.events.push(event);
    onEvent?.(event);
  }
}

function flushStreamingJsonLines(state, onEvent) {
  const line = state.buffer.trim();

  if (!line) {
    state.buffer = "";
    return;
  }

  let event;

  try {
    event = JSON.parse(line);
  } catch (error) {
    throw new CliError(`Unable to parse Codex JSON output: ${line}`, { cause: error });
  }

  state.events.push(event);
  state.buffer = "";
  onEvent?.(event);
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

export async function runCodexTask({ repoRoot, prompt, resumeSessionId = null, onEvent = null }) {
  const lastMessageFile = tmpFile("legion-run-summary", "md");
  const commandArgs = resumeSessionId
    ? ["exec", "resume", ...buildCommonArgs(lastMessageFile), resumeSessionId, "-"]
    : ["exec", ...buildCommonArgs(lastMessageFile), "-"];

  const streamState = { buffer: "", events: [] };
  const result = await runCommandStreaming("codex", commandArgs, {
    cwd: repoRoot,
    input: prompt,
    allowFailure: true,
    onStdout: (chunk) => parseStreamingJsonLines(chunk, streamState, onEvent),
  });
  flushStreamingJsonLines(streamState, onEvent);
  const events = streamState.events.length > 0 ? streamState.events : parseJsonLines(result.stdout);

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

export function generateSpecWithCodex({ repoRoot, intent, taskId, notes = "" }) {
  const lastMessageFile = tmpFile("legion-spec", "md");
  const result = runCommand("codex", ["exec", ...buildCommonArgs(lastMessageFile), "-"], {
    cwd: repoRoot,
    input: buildSpecPrompt(intent, taskId, notes),
    allowFailure: true,
  });
  const events = parseJsonLines(result.stdout);
  const rawSpec = readLastMessage(lastMessageFile);

  if (result.status !== 0) {
    const message = rawSpec || result.stderr.trim() || "Codex spec generation failed";
    return {
      ok: false,
      sessionId: extractThreadId(events),
      error: message,
      rawOutput: result.stdout,
    };
  }

  try {
    return {
      ok: true,
      sessionId: extractThreadId(events),
      spec: normalizeGeneratedSpec(rawSpec, { intent, taskId, notes }),
      rawOutput: result.stdout,
    };
  } catch (error) {
    return {
      ok: false,
      sessionId: extractThreadId(events),
      error: `Codex returned an invalid task spec: ${error.message}`,
      rawOutput: result.stdout,
      cause: error,
    };
  }
}

export async function reviewWithCodex({ repoRoot, baseBranch, prompt, onEvent = null }) {
  const lastMessageFile = tmpFile("legion-review", "json");

  const streamState = { buffer: "", events: [] };
  const result = await runCommandStreaming(
    "codex",
    ["exec", "review", "--base", baseBranch, ...buildCommonArgs(lastMessageFile), "-"],
    {
      cwd: repoRoot,
      input: prompt,
      allowFailure: true,
      onStdout: (chunk) => parseStreamingJsonLines(chunk, streamState, onEvent),
    },
  );

  flushStreamingJsonLines(streamState, onEvent);
  const events = streamState.events.length > 0 ? streamState.events : parseJsonLines(result.stdout);
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

export const __testOnly = {
  flushStreamingJsonLines,
  parseStreamingJsonLines,
};
