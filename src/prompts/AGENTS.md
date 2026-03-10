# Prompt Management

This directory contains isolated YAML prompt templates used by the Legion task pipeline.

## Conventions

- **Template format**: Use `{{variable}}` (mustache-style) placeholders for runtime inputs.
- **One prompt per file**: Each YAML file maps to exactly one pipeline stage (`create-spec`, `execute-task`, `review-task`, `fix-task`).
- **Scope isolation**: A prompt must only concern its own stage. Do not bleed cross-stage logic.

## Prompt Refinement Workflow

Follow a commit-based versioning model 

1. **Every change is a commit** — each saved update to a prompt must be an atomic git commit with a clear message describing *what changed and why*.
2. **Tag stable versions** — after validating a prompt revision, tag the commit (e.g., `prompt/review-task/v2`) so the pipeline can pin to known-good versions.
3. **Diff before merging** — review the YAML diff against the previous version to catch unintended side-effects (added scope, removed constraints, shifted tone).

## Editing Rules

- Do not inline prompts in application code; all prompts live here.
- Do not add optional/fallback fields. If a field is not needed, remove it.
- Keep instructions minimal — every line must earn its place.
