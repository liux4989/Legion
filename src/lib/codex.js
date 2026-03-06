import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCommandInteractive } from "./shell.js";

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

function appendJsonFileInstructions(prompt, outputFile) {
  return `${prompt}

Before you finish, write the final result as raw JSON to this absolute path:
${outputFile}

Rules for that file:
- The file must contain JSON only.
- Do not wrap the JSON in markdown.
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

export async function generateObjectWithCodex({ repoRoot, prompt, schema, prefix = "legion" }) {
  const outputFile = tmpFile(prefix, "json");
  const inlinePrompt = appendJsonFileInstructions(
    `${prompt}

JSON schema:
${JSON.stringify(schema, null, 2)}`,
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

export async function runCodexTask({ repoRoot, prompt }) {
  const result = runInlineCodex(repoRoot, prompt);

  if (!result.ok) {
    return result;
  }

  return {
    ok: true,
    summary: "Completed via inline Codex session. Review the working tree for implementation details.",
  };
}

export async function reviewWithCodex({ repoRoot, prompt }) {
  const outputFile = tmpFile("legion-review", "json");
  const inlinePrompt = appendJsonFileInstructions(prompt, outputFile);

  try {
    const result = runInlineCodex(repoRoot, inlinePrompt);

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
