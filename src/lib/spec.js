import { renderPromptTemplate } from "./prompt-template.js";

export function buildCreatePrompt(intent, taskId, specFilePath) {
  return renderPromptTemplate("create-spec.yaml", {
    task_id: taskId,
    intent: intent.trim(),
    spec_file: specFilePath,
  });
}
