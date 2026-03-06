# Legion

Legion is a minimal agent orchestrator for coding tasks. It implements the v1 workflow from `SPEC.md` with one direct harness integration: the local `codex` CLI.

## Decisions

- Harness: `codex` CLI only
- Isolation: git branches
- Spec creation: local task files only
- PR creation: explicit `approve` command after review passes

## Requirements

- Node.js 22+
- `git`
- `codex`
- `gh` for PR creation
- a git remote if you want `approve` to open a PR

## Usage

Install locally:

```bash
npm link
```

Create a task:

```bash
legion create "Fix race condition in session cleanup"
```

Run the executor:

```bash
legion run <task-id>
```

Run review:

```bash
legion review <task-id>
```

Approve and open or update a PR:

```bash
legion approve <task-id>
```

Reject a task and mark it blocked:

```bash
legion reject <task-id> "Needs a different approach"
```

Inspect persisted state:

```bash
legion status <task-id>
```

## Task Layout

Runtime artifacts are stored under `tasks/` and kept out of git:

```text
tasks/
  task_<id>/
    spec.md
    task.json
    run_summary.md
    review_1.json
    review_2.json
    pr.json
```

## Notes

- `run` resumes the last executor session if the task is already in `executing` state and has a stored Codex session id.
- `review` uses `codex exec review` with prompt-constrained JSON output plus local validation.
- `approve` creates a commit if the task branch still has local changes, then pushes and creates or updates a PR with `gh`.
- Set `LEGION_CODEX_ARGS` if you need to append extra flags to Codex commands, for example `LEGION_CODEX_ARGS='-m o3'`.
