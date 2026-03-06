import { CliError } from "./errors.js";

function normalizeLine(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeList(values, sectionName) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new CliError(`Generated spec is missing section: ${sectionName}`);
  }

  return values
    .map((value) => normalizeLine(value))
    .filter(Boolean)
    .slice(0, 4);
}

export function buildSpecPrompt(intent, taskId) {
  return `Write a compact implementation spec for Legion task ${taskId}.

User intent:
${intent}

Return JSON only using the provided schema.

Rules:
- Enrich the user's intent into an execution-ready spec without broadening scope.
- Keep every section short and concrete.
- Prefer the smallest change that satisfies the request.
- Do not mention tests unless clearly required by the intent.
- Keep wording review-friendly for a coding agent.
`;
}

export function validateSpecDraft(draft) {
  if (!draft || typeof draft !== "object") {
    throw new CliError("Generated spec was not an object.");
  }

  const goal = normalizeLine(draft.goal);

  if (!goal) {
    throw new CliError("Generated spec is missing section: Goal");
  }

  return {
    goal,
    expectedBehavior: normalizeList(draft.expectedBehavior, "Expected Behavior"),
    constraints: normalizeList(draft.constraints, "Constraints"),
    successCriteria: normalizeList(draft.successCriteria, "Success Criteria"),
  };
}

export function specOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["goal", "expectedBehavior", "constraints", "successCriteria"],
    properties: {
      goal: { type: "string", minLength: 1 },
      expectedBehavior: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string", minLength: 1 },
      },
      constraints: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string", minLength: 1 },
      },
      successCriteria: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: { type: "string", minLength: 1 },
      },
    },
  };
}

export function renderSpec(taskId, draft) {
  const spec = validateSpecDraft(draft);
  const renderList = (items) => items.map((item) => `- ${item}`).join("\n");

  return `# Task ${taskId}

## Goal

${spec.goal}

## Expected Behavior

${renderList(spec.expectedBehavior)}

## Constraints

${renderList(spec.constraints)}

## Success Criteria

${renderList(spec.successCriteria)}
`;
}
