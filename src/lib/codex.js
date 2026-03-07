import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommand, runCommandInteractive, runCommandInheritAsync } from "./shell.js";

function tmpFile(prefix, extension) {
  return path.join(os.tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`);
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildInteractiveArgs(prompt) {
  const extraArgs = process.env.LEGION_CODEX_ARGS?.trim()
    ? process.env.LEGION_CODEX_ARGS.trim().split(/\s+/)
    : [];

  return ["--no-alt-screen", ...extraArgs, prompt];
}

function buildExecArgs(prompt) {
  const extraArgs = process.env.LEGION_CODEX_ARGS?.trim()
    ? process.env.LEGION_CODEX_ARGS.trim().split(/\s+/)
    : [];

  return ["exec", ...extraArgs, prompt];
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

function describeSchemaNode(node) {
  if (!node || typeof node !== "object") {
    throw new Error("Invalid schema node.");
  }

  if (node.type === "string") {
    return "string";
  }

  if (node.type === "array") {
    const itemType = describeSchemaNode(node.items);
    const minItems = typeof node.minItems === "number" ? `, min ${node.minItems}` : "";
    const maxItems = typeof node.maxItems === "number" ? `, max ${node.maxItems}` : "";
    return `array of ${itemType}${minItems}${maxItems}`;
  }

  if (node.type === "object") {
    return "object";
  }

  throw new Error(`Unsupported schema node type: ${node.type}`);
}

function buildJsonFieldInstructions(schema) {
  if (!schema || schema.type !== "object" || !schema.properties || !Array.isArray(schema.required)) {
    throw new Error("Schema must be an object schema with properties and required fields.");
  }

  const lines = ["Use exactly these top-level fields:"];

  for (const key of schema.required) {
    const propertySchema = schema.properties[key];

    if (!propertySchema) {
      throw new Error(`Schema is missing property definition for required field: ${key}`);
    }

    lines.push(`- ${key}: ${describeSchemaNode(propertySchema)}`);
  }

  lines.push("- Do not include extra fields.");
  return lines.join("\n");
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

function runExecCodex(repoRoot, prompt) {
  const result = runCommand("codex", buildExecArgs(prompt), {
    cwd: repoRoot,
    allowFailure: true,
  });

  if (result.status !== 0) {
    const details = result.stderr.trim() || result.stdout.trim();
    return {
      ok: false,
      error: details || `Codex exited with code ${result.status}`,
    };
  }

  return {
    ok: true,
    output: result.stdout.trim(),
  };
}

export async function generateObjectWithCodex({ repoRoot, prompt, schema, prefix = "legion" }) {
  const outputFile = tmpFile(prefix, "json");
  const inlinePrompt = appendJsonFileInstructions(
    `${prompt}

When you write the approved final JSON file, follow this format:
${buildJsonFieldInstructions(schema)}`,
    outputFile,
  );

  try {
    const result = runInlineCodex(repoRoot, inlinePrompt);

    if (!result.ok) {
      return result;
    }

    if (!fs.existsSync(outputFile)) {
      return {
        ok: false,
        error: `Codex did not write the expected JSON output file: ${outputFile}`,
      };
    }

    try {
      return {
        ok: true,
        value: readJsonFile(outputFile),
      };
    } catch (error) {
      return {
        ok: false,
        error: `Codex output was not valid JSON in ${outputFile}`,
        cause: error,
      };
    }
  } finally {
    fs.rmSync(outputFile, { force: true });
  }
}

export async function generateObjectWithCodexExec({ repoRoot, prompt, schema }) {
  const inlinePrompt = `${prompt}

Return JSON only.
${buildJsonFieldInstructions(schema)}`;
  const result = runExecCodex(repoRoot, inlinePrompt);

  if (!result.ok) {
    return result;
  }

  try {
    return {
      ok: true,
      value: JSON.parse(result.output),
    };
  } catch (error) {
    return {
      ok: false,
      error: "Codex output was not valid JSON.",
      cause: error,
    };
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

export async function reviewWithCodexAutoExit({ repoRoot, prompt }) {
  const outputFile = tmpFile("legion-review", "json");
  const inlinePrompt = appendJsonFileInstructions(prompt, outputFile);

  try {
    const result = await runCodexAutoExit(repoRoot, inlinePrompt);

    if (!result.ok) {
      return result;
    }

    if (!fs.existsSync(outputFile)) {
      return {
        ok: false,
        error: `Codex did not write the expected review file: ${outputFile}`,
      };
    }

    try {
      return {
        ok: true,
        review: readJsonFile(outputFile),
      };
    } catch (error) {
      return {
        ok: false,
        error: `Review output was not valid JSON in ${outputFile}`,
        cause: error,
      };
    }
  } finally {
    fs.rmSync(outputFile, { force: true });
  }
}
