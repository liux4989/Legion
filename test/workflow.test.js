import test from "node:test";
import assert from "node:assert/strict";
import { prBody, prTitle } from "../src/lib/workflow.js";

test("prTitle includes task id and intent", () => {
  const task = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    intent: "Fix failing healthcheck",
  };

  assert.equal(prTitle(task), "[550e8400-e29b-41d4-a716-446655440000] Fix failing healthcheck");
});

test("prBody includes summary and spec path", () => {
  const task = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    intent: "Fix failing healthcheck",
    latestRunSummary: "Updated the healthcheck handler and ran npm test.",
  };

  const body = prBody(task);

  assert.match(body, /Fix failing healthcheck/);
  assert.match(body, /tasks\/task_550e8400-e29b-41d4-a716-446655440000\/spec\.md/);
  assert.match(body, /Updated the healthcheck handler and ran npm test\./);
});
