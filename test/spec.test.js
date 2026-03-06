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

test("makeTaskId produces a uuid", () => {
  const taskId = makeTaskId("Add retry handling to webhook delivery failures");

  assert.match(taskId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
