import test from "node:test";
import assert from "node:assert/strict";
import { prBody, prTitle } from "../src/lib/workflow.js";

test("prTitle includes task id and intent", () => {
  const task = {
    id: "20260306121212-test",
    intent: "Fix failing healthcheck",
  };

  assert.equal(prTitle(task), "[20260306121212-test] Fix failing healthcheck");
});

test("prBody includes summary and spec path", () => {
  const task = {
    id: "20260306121212-test",
    intent: "Fix failing healthcheck",
    latestRunSummary: "Updated the healthcheck handler and ran npm test.",
  };

  const body = prBody(task);

  assert.match(body, /Fix failing healthcheck/);
  assert.match(body, /tasks\/task_20260306121212-test\/spec\.md/);
  assert.match(body, /Updated the healthcheck handler and ran npm test\./);
});
