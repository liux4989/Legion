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
- Output structured sections:
  - **behaviors** — extracted expected behaviors (not expanded scope)
  - **goal** — assumption about why this feature/fix exists
  - **reason** — assumption about root cause/motivation
  - **noGoals** — open questions the human didn't address
</Stage1 format>

<Stage2 format>
- **title** — [Tag] Short focus, with tag like feat, bug, docs
- **summary** — background + goal sentence
- **userStories[]** — each with:
  - **story** — user story text
  - **systemBehaviors** — EARS-format behaviors
  - **functionalRequirements** — list
  - **edgeCases** — list with error handling
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
