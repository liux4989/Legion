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
4. **Test over cases** — run the revised Task against representative task inputs before promoting.

### Revise Task

When editing any prompt YAML in this directory, verify it does not conflict with upstream rules:

1. Collect all applicable AGENTS.md files from project root down to this directory.
2. For each instruction or constraint in the prompt YAML, check:
   - Does it contradict an AGENTS.md rule? → **Remove or rewrite** the conflicting line.
   - Does it duplicate an AGENTS.md rule? → **Remove** the duplicate; AGENTS.md already enforces it.
3. If a conflict is found, fail the revision and report which prompt line conflicts with which AGENTS.md rule.


## Editing Rules

- Do not inline prompts in application code; all prompts live here.
- Do not add optional/fallback fields. If a field is not needed, remove it.
- Keep instructions minimal — every line must earn its place.
