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
    throw new CliError("Generated output is missing required list section.");
  }

  return values
    .map((value) => normalizeLine(value))
    .filter(Boolean)
    .slice(0, 4);
}

export function buildIntentBriefPrompt(intent, taskId) {
  return `Create an Intent Brief for Legion task ${taskId}.

User request:
${intent}

Requirements:
- Preserve the original request in normalized form.
- Keep the brief deterministic, structural, and execution-oriented.
- Do not broaden scope or add new product behavior.
- Keep every field concise.
- Unknowns must contain only real unresolved items.
- Do not mention tests unless the request explicitly requires them.
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

function renderSectionList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function renderIntentBriefContext(intentBrief) {
  const unknowns = intentBrief.unknowns.length > 0 ? renderSectionList(intentBrief.unknowns) : "- None";

  return `<intent_brief>
# Intent Brief

## Original intent
${intentBrief.originalIntent}

## Core user value
${intentBrief.coreUserValue}

## Expected behavior
${renderSectionList(intentBrief.expectedBehavior)}

## Constraints
${renderSectionList(intentBrief.constraints)}

## Unknowns
${unknowns}
</intent_brief>`;
}

export function buildSpecPrompt(intentBrief, taskId) {
  return `Create a spec draft for Legion task ${taskId} from this Intent Brief.

Source of truth:
${renderIntentBriefContext(intentBrief)}

Process:
- Work interactively with the user in the terminal before finalizing the spec.
- First present the draft for review as markdown, not JSON.
- Keep that markdown aligned to the final spec structure: Title, Goal, Scope, Non-goals, User-visible behavior, Requirements, Edge cases, Dependencies / assumptions, Success Criteria, and Implementation notes.
- Refine the markdown draft from user feedback and ask for explicit approval.
- Do not write the final JSON output file until the user explicitly approves the spec.

Scope rules:
- Preserve the original intent and core user value.
- Do not broaden scope.
- Prefer the smallest complete unit of user value.
- Do not introduce new product behavior unless it is required to make the request executable.
- When ambiguity exists, resolve it conservatively, record it as an explicit assumption, or move it to non-goals.
- Separate in-scope work from non-goals clearly.
- Convert vague behavior into observable requirements.
- Define success criteria that a reviewer can validate quickly.
- Avoid implementation detail unless it removes ambiguity or prevents repeated failure.
- Do not mention tests unless the request explicitly requires them.

Writing style:
- Keep the spec concise, concrete, and execution-oriented.
- Prefer short bullets over dense paragraphs.
- Use concrete, observable wording.
- Avoid filler, repetition, and generic engineering advice.
- If a section has no meaningful content, return an empty list.
`;
}

export function validateSpecDraft(draft) {
  if (!draft || typeof draft !== "object") {
    throw new CliError("Generated spec was not an object.");
  }

  const title = normalizeLine(draft.title);
  const goal = normalizeLine(draft.goal);

  if (!title) {
    throw new CliError("Generated spec is missing section: Title");
  }

  if (!goal) {
    throw new CliError("Generated spec is missing section: Goal");
  }

  return {
    title,
    goal,
    scope: normalizeList(draft.scope, "Scope"),
    nonGoals: normalizeOptionalList(draft.nonGoals),
    userVisibleBehavior: normalizeOptionalList(draft.userVisibleBehavior),
    requirements: normalizeList(draft.requirements, "Requirements"),
    edgeCases: normalizeOptionalList(draft.edgeCases),
    dependenciesAssumptions: normalizeOptionalList(draft.dependenciesAssumptions),
    successCriteria: normalizeList(draft.successCriteria, "Success Criteria"),
    implementationNotes: normalizeOptionalList(draft.implementationNotes),
  };
}

export function specOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "title",
      "goal",
      "scope",
      "nonGoals",
      "userVisibleBehavior",
      "requirements",
      "edgeCases",
      "dependenciesAssumptions",
      "successCriteria",
      "implementationNotes",
    ],
    properties: {
      title: { type: "string", minLength: 1 },
      goal: { type: "string", minLength: 1 },
      scope: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: { type: "string", minLength: 1 },
      },
      nonGoals: {
        type: "array",
        minItems: 0,
        maxItems: 8,
        items: { type: "string", minLength: 1 },
      },
      userVisibleBehavior: {
        type: "array",
        minItems: 0,
        maxItems: 8,
        items: { type: "string", minLength: 1 },
      },
      requirements: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: { type: "string", minLength: 1 },
      },
      edgeCases: {
        type: "array",
        minItems: 0,
        maxItems: 8,
        items: { type: "string", minLength: 1 },
      },
      dependenciesAssumptions: {
        type: "array",
        minItems: 0,
        maxItems: 8,
        items: { type: "string", minLength: 1 },
      },
      successCriteria: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: { type: "string", minLength: 1 },
      },
      implementationNotes: {
        type: "array",
        minItems: 0,
        maxItems: 8,
        items: { type: "string", minLength: 1 },
      },
    },
  };
}

export function renderSpec(taskId, draft) {
  const spec = validateSpecDraft(draft);
  const renderList = (items) => items.map((item) => `- ${item}`).join("\n");
  const sections = [
    `# ${spec.title}`,
    `Task ID: ${taskId}`,
    `## Goal\n\n${spec.goal}`,
    `## Scope\n\n${renderList(spec.scope)}`,
  ];

  if (spec.nonGoals.length > 0) {
    sections.push(`## Non-goals\n\n${renderList(spec.nonGoals)}`);
  }

  if (spec.userVisibleBehavior.length > 0) {
    sections.push(`## User-visible behavior\n\n${renderList(spec.userVisibleBehavior)}`);
  }

  sections.push(`## Requirements\n\n${renderList(spec.requirements)}`);

  if (spec.edgeCases.length > 0) {
    sections.push(`## Edge cases\n\n${renderList(spec.edgeCases)}`);
  }

  if (spec.dependenciesAssumptions.length > 0) {
    sections.push(`## Dependencies / assumptions\n\n${renderList(spec.dependenciesAssumptions)}`);
  }

  sections.push(`## Success Criteria\n\n${renderList(spec.successCriteria)}`);

  if (spec.implementationNotes.length > 0) {
    sections.push(`## Implementation notes\n\n${renderList(spec.implementationNotes)}`);
  }

  return `${sections.join("\n\n")}\n`;
}
