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

function normalizeOptionalList(values) {
  if (!Array.isArray(values)) {
    throw new CliError("Generated intent brief is missing section: Unknowns");
  }

  return values
    .map((value) => normalizeLine(value))
    .filter(Boolean)
    .slice(0, 4);
}

export function buildIntentBriefPrompt(intent, taskId) {
  return `Normalize the user request into an Intent Brief for Legion task ${taskId}.

User intent:
${intent}

Rules:
- Keep the brief deterministic and structural.
- Do not broaden scope.
- Preserve the original intent in normalized form.
- Keep each field concise and execution-oriented.
- Unknowns should only include real unresolved items, not speculation.
- Do not mention tests unless clearly required by the intent.
`;
}

export function validateIntentBriefDraft(draft) {
  if (!draft || typeof draft !== "object") {
    throw new CliError("Generated intent brief was not an object.");
  }

  const originalIntent = normalizeLine(draft.originalIntent);
  const coreUserValue = normalizeLine(draft.coreUserValue);

  if (!originalIntent) {
    throw new CliError("Generated intent brief is missing section: Original Intent");
  }

  if (!coreUserValue) {
    throw new CliError("Generated intent brief is missing section: Core User Value");
  }

  return {
    originalIntent,
    coreUserValue,
    expectedBehavior: normalizeList(draft.expectedBehavior, "Expected Behavior"),
    constraints: normalizeList(draft.constraints, "Constraints"),
    unknowns: normalizeOptionalList(draft.unknowns),
  };
}

export function intentBriefOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["originalIntent", "coreUserValue", "expectedBehavior", "constraints", "unknowns"],
    properties: {
      originalIntent: { type: "string", minLength: 1 },
      coreUserValue: { type: "string", minLength: 1 },
      expectedBehavior: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string", minLength: 1 },
      },
      constraints: {
        type: "array",
        minItems: 1,
        maxItems: 4,
        items: { type: "string", minLength: 1 },
      },
      unknowns: {
        type: "array",
        minItems: 0,
        maxItems: 4,
        items: { type: "string", minLength: 1 },
      },
    },
  };
}

export function buildSpecPrompt(intentBrief, taskId) {
  return `Write a compact implementation spec issue for Legion task ${taskId} using the Intent Brief below.

Intent Brief:
- Original intent: ${intentBrief.originalIntent}
- Core user value: ${intentBrief.coreUserValue}
- Expected behavior:
${intentBrief.expectedBehavior.map((item) => `  - ${item}`).join("\n")}
- Constraints:
${intentBrief.constraints.map((item) => `  - ${item}`).join("\n")}
- Unknowns:
${intentBrief.unknowns.length > 0 ? intentBrief.unknowns.map((item) => `  - ${item}`).join("\n") : "  - None"}

Rules:
- Enrich the intent brief into an execution-ready spec without broadening scope.
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
