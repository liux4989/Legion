# Legion

Legion is a minimal prototype orchestrator for coding tasks. It implements a direct `Intent -> Spec -> Execute -> Review -> Fix -> PR` loop with the local `codex` CLI.

## Decisions

- Harness: `codex` CLI only
- Isolation: git branches
- Spec creation: Codex-generated spec from the user intent
- PR creation: explicit `pr` command after review passes

## Requirements

- Node.js 22+
- `git`
- `codex`
- `gh` for PR creation
- a git remote if you want `pr` to open a PR

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

Open or update a PR:

```bash
legion pr <task-id>
```

## Task Layout

Runtime state is stored under `tasks/` and kept out of git:

```text
tasks/
  task_<id>/
    task.json
```

## Notes

- `create` uses Codex to expand the user intent into a short task spec stored in `task.json`.
- `run` launches an inline visible `codex` session and waits for it to exit.
- `run` is a one-shot invocation. If review fails and the task returns to `executing`, running it again starts a fresh Codex session.
- `review` uses `codex exec review` with prompt-constrained JSON output plus local validation.
- `review` returns failed findings back to `run` as fix instructions.
- `pr` creates a commit if the task branch still has local changes, then pushes and creates or updates a PR with `gh`.
- The task spec is stored in `task.json` and inlined into the PR body so reviewers can see the full scope.
- Set `LEGION_CODEX_ARGS` if you need to append extra flags to Codex commands, for example `LEGION_CODEX_ARGS='-m o3'`.
