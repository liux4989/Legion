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
- List user stories.
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
