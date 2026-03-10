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
