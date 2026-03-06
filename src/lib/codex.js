import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand, runCommandInteractive, runCommandStreaming } from "./shell.js";
import { CliError } from "./errors.js";
import { writeJson } from "./fs.js";

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

function buildInteractiveArgs(prompt) {
  const extraArgs = process.env.LEGION_CODEX_ARGS?.trim()
    ? process.env.LEGION_CODEX_ARGS.trim().split(/\s+/)
    : [];

  return ["--no-alt-screen", ...extraArgs, prompt];
}

export async function generateObjectWithCodex({ repoRoot, prompt, schema, prefix = "legion" }) {
  const lastMessageFile = tmpFile(prefix, "json");
  const schemaFile = tmpFile(`${prefix}-schema`, "json");

  try {
    writeJson(schemaFile, schema);

    const result = runCommand(
      "codex",
      ["exec", ...buildCommonArgs(lastMessageFile), "--output-schema", schemaFile, "-"],
      {
        cwd: repoRoot,
        input: prompt,
        allowFailure: true,
      },
    );

    const lastMessage = readLastMessage(lastMessageFile);

    if (result.status !== 0) {
      return {
        ok: false,
        error: lastMessage || result.stderr.trim() || "Codex generation failed",
      };
    }

    try {
      return {
        ok: true,
        value: JSON.parse(lastMessage),
      };
    } catch (error) {
      return {
        ok: false,
        error: `Codex output was not valid JSON: ${lastMessage}`,
        cause: error,
      };
    }
  } finally {
    fs.rmSync(lastMessageFile, { force: true });
    fs.rmSync(schemaFile, { force: true });
  }
}

export async function runCodexTask({ repoRoot, prompt }) {
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

  return {
    ok: true,
    summary: "Completed via inline Codex session. Review the working tree for implementation details.",
  };
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
