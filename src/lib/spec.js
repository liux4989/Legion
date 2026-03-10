import { renderPromptTemplate, yamlBlock, yamlString } from "./prompt-template.js";

export function buildCreatePrompt(intent, taskId, specFilePath) {
  return renderPromptTemplate("create-spec.yaml", {
    task_id: yamlString(taskId),
    intent_block: yamlBlock(intent.trim(), 1),
    spec_file: yamlString(specFilePath),
  });
}
