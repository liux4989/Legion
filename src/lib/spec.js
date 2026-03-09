import { CliError } from "./errors.js";

function normalizeSpec(text) {
  return String(text ?? "").trim();
}

export function buildCreatePrompt(intent, taskId) {
  return `Turn the user request into an executable markdown spec for Legion task ${taskId}.

<intent>
${intent.trim()}
</intent>

<workflow>
- Stage 1:
- Normalize the intent to well-defined behavior.
- Output only the Stage 1 format for user review.
- Revise from user clarification and feedback.
- Only until explicit human approval, go on to Stage 2.
- Stage 2:
- Normalize the approved well-defined behavior to executable spec.
- Output only the Stage 2 format for user review.
- Revise from user clarification and feedback.
- Only until explicit human approval, write the final file.
</workflow>

<Stage1 format>
- Use a short markdown heading.
- Include:
  - behaviors
  - goal
  - reason
  - non-goals
</Stage1 format>

<Stage2 format>
- Start with: # [Tag] Short task focus
- Then include: Task ID: ${taskId}
- Include a section: ## Summary
- Include at least one section: ## User Story 1
- Under each user story include:
  - ### System Behaviors (EARS)
  - ### Functional Requirements
- Include ### Edge Cases when relevant
</Stage2 format>

<interaction>
- During Stage 1, output only the Stage 1 draft.
- During Stage 2, output only the Stage 2 draft.
- Wait for user feedback after each draft.
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
