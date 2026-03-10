import path from "node:path";
import { fileURLToPath } from "node:url";
import { readText } from "./fs.js";

const PROMPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../prompts");
const PLACEHOLDER_PATTERN = /\{\{([a-zA-Z0-9_]+)\}\}/g;

export function renderPromptTemplate(templateName, values) {
  const filePath = path.join(PROMPTS_DIR, templateName);
  const template = readText(filePath);

  const rendered = template.replace(PLACEHOLDER_PATTERN, (_match, key, offset, source) => {
    if (!(key in values)) {
      throw new Error(`Missing prompt template value: ${key}`);
    }

    const lineStart = source.lastIndexOf("\n", offset) + 1;
    const indentation = source.slice(lineStart, offset).match(/^\s*$/)?.[0] ?? "";
    const value = String(values[key]).replace(/\r\n?/g, "\n");

    if (!value.includes("\n")) {
      return value;
    }

    return value.split("\n").join(`\n${indentation}`);
  });

  const unresolved = rendered.match(PLACEHOLDER_PATTERN);
  if (unresolved) {
    throw new Error(`Unresolved prompt template placeholders in ${templateName}: ${unresolved.join(", ")}`);
  }

  return rendered;
}
