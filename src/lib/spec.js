import { CliError } from "./errors.js";

function normalizeLine(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeList(values, sectionName) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new CliError(`Generated output is missing section: ${sectionName}`);
  }

  return values
    .map((value) => normalizeLine(value))
    .filter(Boolean);
}

function normalizeOptionalList(values) {
  if (!Array.isArray(values)) {
    throw new CliError("Generated output is missing required list section.");
  }

  return values
    .map((value) => normalizeLine(value))
    .filter(Boolean);
}

export function buildCreatePrompt(intent, taskId) {
  return `Turn the user request into an executable spec for Legion task ${taskId}.

<intent>
${intent.trim()}
</intent>

<analysis>
- First normalize the intent internally before writing the spec.
- Extract expected behaviors from the request.
- Infer goal, reason, and no-goals when the user left them implicit.
- Keep assumptions explicit in the resulting summary or requirements.
</analysis>

<expected_struct>
- title: [Tag] Short task focus. Tags: feat, bug, docs
- summary: background + goal (what problem, what vision)
- userStories: list of user stories, each with:
  - story: user story text
  - systemBehaviors: EARS format
  - functionalRequirements: list
  - edgeCases: list with expected error handling
</expected_struct>

<interaction>
- Present the draft spec as markdown for user review.
- Refine from user feedback until user explicitly approves.
- Only write final JSON after explicit approval.
</interaction>
`;
}

export function specOutputSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "summary", "userStories"],
    properties: {
      title: { type: "string", minLength: 1 },
      summary: { type: "string", minLength: 1 },
      userStories: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["story", "systemBehaviors", "functionalRequirements", "edgeCases"],
          properties: {
            story: { type: "string", minLength: 1 },
            systemBehaviors: {
              type: "array",
              minItems: 1,
              maxItems: 8,
              items: { type: "string", minLength: 1 },
            },
            functionalRequirements: {
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
          },
        },
      },
    },
  };
}

function validateUserStory(story, index) {
  if (!story || typeof story !== "object") {
    throw new CliError(`User story ${index + 1} is not an object.`);
  }

  const storyText = normalizeLine(story.story);
  if (!storyText) {
    throw new CliError(`User story ${index + 1} is missing story text.`);
  }

  return {
    story: storyText,
    systemBehaviors: normalizeList(story.systemBehaviors, `userStories[${index}].systemBehaviors`),
    functionalRequirements: normalizeList(story.functionalRequirements, `userStories[${index}].functionalRequirements`),
    edgeCases: normalizeOptionalList(story.edgeCases),
  };
}

export function validateSpecDraft(draft) {
  if (!draft || typeof draft !== "object") {
    throw new CliError("Generated spec was not an object.");
  }

  const title = normalizeLine(draft.title);
  const summary = normalizeLine(draft.summary);

  if (!title) {
    throw new CliError("Generated spec is missing section: title");
  }

  if (!summary) {
    throw new CliError("Generated spec is missing section: summary");
  }

  if (!Array.isArray(draft.userStories) || draft.userStories.length === 0) {
    throw new CliError("Generated spec is missing section: userStories");
  }

  return {
    title,
    summary,
    userStories: draft.userStories.map(validateUserStory),
  };
}

export function renderSpec(taskId, draft) {
  const spec = validateSpecDraft(draft);
  const renderList = (items) => items.map((item) => `- ${item}`).join("\n");

  const sections = [
    `# ${spec.title}`,
    `Task ID: ${taskId}`,
    `## Summary\n\n${spec.summary}`,
  ];

  spec.userStories.forEach((us, i) => {
    sections.push(`## User Story ${i + 1}\n\n${us.story}`);
    sections.push(`### System Behaviors (EARS)\n\n${renderList(us.systemBehaviors)}`);
    sections.push(`### Functional Requirements\n\n${renderList(us.functionalRequirements)}`);
    if (us.edgeCases.length > 0) {
      sections.push(`### Edge Cases\n\n${renderList(us.edgeCases)}`);
    }
  });

  return `${sections.join("\n\n")}\n`;
}
