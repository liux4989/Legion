export function buildCreatePrompt(intent, taskId) {
  return `Turn the user request into an executable markdown spec for Legion task ${taskId}.

<intent>
${intent.trim()}
</intent>

<workflow>
- Stage 1:
- Turn the intent into well-defined user behaviors aligned to the user intent.
- Output only the Stage 1 format for user review.
- Revise from user clarification and feedback.
- Only until explicit human approval, go on to Stage 2.
- Stage 2:
- Normalize the approved Stage 1 behaviors to executable spec.
- Output only the Stage 2 format for user review.
- Revise from user clarification and feedback.
- Only until explicit human approval, write the final file.
</workflow>

<stage1_format>
- Use a short markdown heading.
- Output structured sections:
  - **behaviors** — well-defined user behaviors aligned to the user intent, keep them minimal and don't expand beyond what the user asked
  - **goal** — assumption about why this feature/fix exists
  - **reason** — assumption about root cause/motivation
  - **noGoals** — assumptions the human didn't address but are reasonable to consider
</stage1_format>

<stage2_format>
- **title** — \`task#<id>: <short title>\`
- **summary** — background + goal sentence
- **userStories** — list of user stories
  - each item must include:
  - **US<N>: <short title>**
    - **User story** — a concise user story in the format :As a (role), I want (function) so that (business value)
    - **Acceptance Criteria** — list using EARS patterns:
      - Ubiquitous: The [system] shall [action]
      - Event-driven: When [event], the [system] shall [action]
      - State-driven: While [state], the [system] shall [action]
      - Unwanted behavior: If [condition], then the [system] shall [action]
      - Optional: Where [feature], the [system] shall [action]
    - **Edge case** — relevant failure cases, boundary conditions, and error handling expectations
</stage2_format>

<interaction>
- Only write final markdown after explicit approval.
</interaction>
`;
}
