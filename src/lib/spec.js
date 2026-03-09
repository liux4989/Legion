import { CliError } from "./errors.js";

function normalizeSpec(text) {
  return String(text ?? "").trim();
}

export function buildCreatePrompt(intent, taskId) {
  return `Turn the user request into an executable markdown spec for Legion task ${taskId}.

<intent>
${intent.trim()}
</intent>

<analysis>
- First normalize the intent internally before writing the spec.
- Extract expected behaviors from the request.
- Infer goal, reason, and no-goals when the user left them implicit.
- Keep assumptions explicit in the spec.
</analysis>

<required_markdown>
- Start with: # [Tag] Short task focus
- Then include: Task ID: ${taskId}
- Include a section: ## Summary
- Include at least one section: ## User Story 1
- Under each user story include:
  - ### System Behaviors (EARS)
  - ### Functional Requirements
- Include ### Edge Cases when relevant
</required_markdown>

<interaction>
- Present the draft spec as markdown for user review.
- Refine from user feedback until user explicitly approves.
- Only write final markdown after explicit approval.
- Do not write JSON.
</interaction>
`;
}

export function validateSpecMarkdown(markdown, taskId) {
  const spec = normalizeSpec(markdown);

  if (!spec) {
    throw new CliError("Generated spec is empty.");
  }

  if (!spec.startsWith("# ")) {
    throw new CliError("Generated spec must start with a level-1 title.");
  }

  if (!spec.includes(`Task ID: ${taskId}`)) {
    throw new CliError(`Generated spec is missing task id line: Task ID: ${taskId}`);
  }

  if (!spec.includes("\n## Summary")) {
    throw new CliError("Generated spec is missing section: Summary");
  }

  if (!spec.includes("\n## User Story 1")) {
    throw new CliError("Generated spec is missing section: User Story 1");
  }

  if (!spec.includes("\n### System Behaviors (EARS)")) {
    throw new CliError("Generated spec is missing section: System Behaviors (EARS)");
  }

  if (!spec.includes("\n### Functional Requirements")) {
    throw new CliError("Generated spec is missing section: Functional Requirements");
  }

  return `${spec}\n`;
}
