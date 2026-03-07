# Legion

Legion is a minimal prototype orchestrator for coding tasks. It implements a direct `Intent -> Spec -> Execute -> Review -> Fix -> PR` loop with the local `codex` CLI.

## Decisions

- Harness: `codex` CLI only
- Isolation: git branches
- Spec creation: Codex-generated spec from the user intent
- PR creation: explicit `pr` command after review passes
- Auto-exit: uses codex `notify` hook to detect turn completion and auto-advance phases

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

The project ships a `.codex/config.toml` that registers the notify hook. Your codex user config (`~/.codex/config.toml`) must trust the project:

```toml
[projects."/path/to/Legion"]
trust_level = "trusted"
```

## Usage

Create a task:

```bash
legion create "Fix race condition in session cleanup"
```

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

- `create` launches an inline visible `codex` session to expand the user intent into a short task spec stored in `task.json`.
- `run` launches codex with `--full-auto` and auto-advances through execute→review→fix phases without manual intervention.
- The user can interact with codex during execution (it runs inline with `stdio: "inherit"`). Ctrl-C aborts the loop.
- Review findings are fed back to codex as fix instructions on the next iteration.
- `pr` creates a commit if the task branch still has local changes, then pushes and creates or updates a PR with `gh`.
- The task spec is stored in `task.json` and inlined into the PR body so reviewers can see the full scope.
- Set `LEGION_CODEX_ARGS` if you need to append extra flags to Codex commands, for example `LEGION_CODEX_ARGS='-m o3'`.
