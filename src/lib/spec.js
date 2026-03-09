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
- **title** — [Tag] Short focus, with tag like feat, bug, docs
- **summary** — background + goal sentence
- **userStories[]** — each with:
  - **story** — user story text
  - **systemBehaviors** — EARS-format behaviors
  - **functionalRequirements** — list
  - **edgeCases** — list with error handling
</stage2_format>

<interaction>
- Only write final markdown after explicit approval.
</interaction>
`;
}
