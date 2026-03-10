import path from "node:path";
import { fileURLToPath } from "node:url";
import { readText } from "./fs.js";

const PROMPTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../prompts");
const PLACEHOLDER_PATTERN = /\{\{([a-zA-Z0-9_]+)\}\}/g;

export function yamlString(value) {
  return JSON.stringify(String(value));
}

export function yamlBlock(value, indentLevel = 0) {
  const indent = "  ".repeat(indentLevel);
  const contentIndent = `${indent}  `;
  const normalized = String(value).replace(/\r\n?/g, "\n").trimEnd();

  if (!normalized) {
    return `${indent}|-`;
  }

  return `${indent}|-\n${normalized
    .split("\n")
    .map((line) => `${contentIndent}${line}`)
    .join("\n")}`;
}

export function renderPromptTemplate(templateName, values) {
  const filePath = path.join(PROMPTS_DIR, templateName);
  const template = readText(filePath);

  const rendered = template.replace(PLACEHOLDER_PATTERN, (_match, key) => {
    if (!(key in values)) {
      throw new Error(`Missing prompt template value: ${key}`);
    }

    return String(values[key]);
  });

  const unresolved = rendered.match(PLACEHOLDER_PATTERN);
  if (unresolved) {
    throw new Error(`Unresolved prompt template placeholders in ${templateName}: ${unresolved.join(", ")}`);
  }

  return rendered;
}
