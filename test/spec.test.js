import test from "node:test";
import assert from "node:assert/strict";
import { buildSpec } from "../src/lib/spec.js";
import { makeTaskId } from "../src/lib/tasks.js";

test("buildSpec includes required sections", () => {
  const spec = buildSpec("Fix session cleanup race condition", "20260306120000-fix-session");

  assert.match(spec, /## Goal/);
  assert.match(spec, /## Expected Behavior/);
  assert.match(spec, /## Constraints/);
  assert.match(spec, /## Success Criteria/);
  assert.match(spec, /## Optional Notes/);
});

test("makeTaskId produces a timestamped slug", () => {
  const taskId = makeTaskId("Add retry handling to webhook delivery failures");

  assert.match(taskId, /^\d{14}-add-retry-handling-to-webhook-d/);
});
