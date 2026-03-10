import { renderPromptTemplate, yamlBlock, yamlString } from "./prompt-template.js";

export function buildCreatePrompt(intent, taskId, specFilePath) {
  return renderPromptTemplate("create-spec.yaml", {
    task_id: yamlString(taskId),
    intent_block: intent.trim().includes("\n")
      ? yamlBlock(intent.trim(), 1)
      : yamlString(intent.trim()),
    spec_file: yamlString(specFilePath),
  });
}
