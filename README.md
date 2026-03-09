# Legion

Legion is a minimal prototype orchestrator for coding tasks. It implements a `Spec -> Execute -> Review -> Fix -> PR` loop with the local `codex` CLI.

## Decisions

- Harness: `codex` CLI only
- Isolation: git branches
- Spec creation: one inline Codex task that writes the final markdown spec
- PR creation: explicit `pr` command after review passes
- Auto-exit: passes a codex `notify` hook at launch time to detect turn completion and auto-advance phases
- Auto-exit: passes a codex `notify` hook at launch time to detect turn completion and auto-advance phases

## Requirements

- Node.js 22+
- `git`
- `codex`
- `gh` for PR creation
- a git remote if you want `pr` to open a PR

## Setup

Install as a project devDependency:

```bash
npm install --save-dev legion
```

Or link locally during development:

```bash
npm link
```

## Usage

Run all commands from inside the target git project.

Create a task:

```bash
legion create "Fix race condition in session cleanup"
```

`create` runs one inline Codex pass with a staged HIL workflow: structural intent draft and approval first, then spec draft and approval, then final markdown output.

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
    spec.md
    task.json
```

## Notes

- `create` keeps a single inline interactive Codex session, but the prompt enforces staged HIL gates: approve structural intent first, then approve the spec, then write the final markdown spec.
- The final spec is structured into:
  - `Title`
  - `Goal`
  - `Scope`
  - `Non-goals`
  - `Requirements`
  - `Success criteria`
  - `Notes`
- `run` launches codex with `--full-auto` and auto-advances through execute→review→fix phases without manual intervention.
- The user can interact with codex during execution (it runs inline with `stdio: "inherit"`). Ctrl-C aborts the loop.
- Review findings are fed back to codex as fix instructions on the next iteration.
- `pr` creates a commit if the task branch still has local changes, then pushes and creates or updates a PR with `gh`.
- The task spec is stored in `spec.md` and also copied into `task.json`; the PR body inlines the spec for reviewers.
- Set `LEGION_CODEX_ARGS` if you need to append extra flags to Codex commands, for example `LEGION_CODEX_ARGS='-m o3'`.
