export function buildSpec(intent, taskId, notes = "") {
  const noteLine = notes.trim() || "- None provided";

  return `# Task ${taskId}

## Goal

${intent}

## Expected Behavior

- Describe the user-visible outcome the change should produce.
- Call out edge cases or workflows that must keep working.

## Constraints

- Stay within the current project scope.
- Prefer the smallest change that satisfies the task.
- Keep the implementation debuggable and easy to review.

## Success Criteria

- The requested change is implemented.
- Relevant checks have been run or their omission is explained.
- The execution summary explains what changed.

## Optional Notes

${noteLine}
`;
}
