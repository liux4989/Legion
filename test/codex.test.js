import test from "node:test";
import assert from "node:assert/strict";
import { __testOnly } from "../src/lib/codex.js";

test("parseStreamingJsonLines collects complete JSONL events across chunk boundaries", () => {
  const seen = [];
  const state = { buffer: "", events: [] };

  __testOnly.parseStreamingJsonLines('{"type":"thread.started","thread_id":"abc"}\n{"type"', state, (event) => {
    seen.push(event);
  });
  __testOnly.parseStreamingJsonLines(':"turn.started"}\n', state, (event) => {
    seen.push(event);
  });
  __testOnly.flushStreamingJsonLines(state, (event) => {
    seen.push(event);
  });

  assert.deepEqual(state.events, [
    { type: "thread.started", thread_id: "abc" },
    { type: "turn.started" },
  ]);
  assert.deepEqual(seen, state.events);
  assert.equal(state.buffer, "");
});
