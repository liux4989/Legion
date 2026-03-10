# Prompt Management

YAML prompt templates for the Legion task pipeline.

## Conventions

- Use `{{variable}}` (mustache-style) placeholders.
- One prompt per file, one file per stage (`create-spec`, `execute-task`, `review-task`, `fix-task`).
- A prompt must only concern its own stage.

## Refinement Workflow

1. Every change is an atomic commit describing *what changed and why*.
2. Tag stable versions (e.g., `prompt/review-task/v2`).
3. Diff against previous version before merging.

## Editing Rules

- All prompts live here — never inline in application code.
- No optional/fallback fields.
- Every line must earn its place.
