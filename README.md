# Legion

Legion is a minimal prototype orchestrator for coding tasks. It implements an `Intent -> Intent Brief -> Spec -> Execute -> Review -> Fix -> PR` loop with the local `codex` CLI.

## Decisions

- Harness: `codex` CLI only
- Isolation: git branches
- Spec creation: Codex-generated `Intent Brief` then final spec issue
- PR creation: explicit `pr` command after review passes
- Auto-exit: passes a codex `notify` hook at launch time to detect turn completion and auto-advance phases

## Requirements

- Node.js 22+
- `git`
- `codex`
- `gh` for PR creation
- a git remote if you want `pr` to open a PR

## Setup

Install locally:

```bash
npm link
```

To reuse one Legion install across multiple local projects on macOS, register each git project once:

```bash
legion projects add app-one /absolute/path/to/app-one
legion projects add app-two /absolute/path/to/app-two
```

Registrations are stored locally at `~/Library/Application Support/Legion/projects.json`.

## Usage

Create a task:

```bash
legion create "Fix race condition in session cleanup"
```

If you are outside the target repo, or you have multiple registered projects, select it explicitly:

```bash
legion create --project app-one "Fix race condition in session cleanup"
legion run --project app-one <task-id>
legion pr --project app-one <task-id>
```

`create` runs two Codex passes:

1. Normalize raw intent into a structured `Intent Brief` with non-interactive `codex exec`
2. Expand the `Intent Brief` into the final spec issue in an inline interactive Codex session

Run the autonomous execute→review→fix loop:

```bash
legion run <task-id>
```

`run` launches codex inline with `--full-auto`. When codex finishes a turn, the notify hook signals completion and Legion auto-advances to the next phase. The loop runs up to 3 iterations (execute → review → fix → review → …) until review passes. Press Ctrl-C at any time to stop.

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

- `create` starts with a non-interactive `codex exec` pass to generate a structured `Intent Brief`, then keeps the spec-authoring pass inline and interactive.
- `Intent Brief` is the normalization layer between raw user input and the final spec issue. It includes:
  - `Original intent`
  - `Core user value`
  - `Expected behavior`
  - `Constraints`
  - `Unknowns`
- The final spec is structured into:
  - `Title`
  - `Goal`
  - `Scope`
  - `Non-goals`
  - `User-visible behavior`
  - `Requirements`
  - `Edge cases`
  - `Dependencies / assumptions`
  - `Success criteria`
  - `Implementation notes`
- `run` launches codex with `--full-auto` and auto-advances through execute→review→fix phases without manual intervention.
- The user can interact with codex during execution (it runs inline with `stdio: "inherit"`). Ctrl-C aborts the loop.
- Review findings are fed back to codex as fix instructions on the next iteration.
- `pr` creates a commit if the task branch still has local changes, then pushes and creates or updates a PR with `gh`.
- The task spec is stored in `task.json` and inlined into the PR body so reviewers can see the full scope.
- Set `LEGION_CODEX_ARGS` if you need to append extra flags to Codex commands, for example `LEGION_CODEX_ARGS='-m o3'`.
