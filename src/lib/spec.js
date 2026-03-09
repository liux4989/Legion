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
- Stage 1: Structural intent.
- First, analyze the request and produce only a structural intent draft for human review.
- The structural intent should capture behaviors, goal, reason, and no-goals/assumptions.
- Do not draft the spec until the user explicitly approves the structural intent.
- Revise the structural intent from user feedback until it is explicitly approved.
- Stage 2: Executable spec.
- After structural intent approval, produce the spec draft for human review.
- Revise the spec from user feedback until it is explicitly approved.
- Only after explicit spec approval, write the final markdown file.
</workflow>

<structural_intent_format>
- Use a short markdown heading for the structural intent draft.
- Include:
  - behaviors
  - goal
  - reason
  - no-goals / assumptions
</structural_intent_format>

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
- During Stage 1, output only the structural intent draft.
- During Stage 2, output only the spec draft.
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
