import assert from "node:assert/strict";
import test from "node:test";
import {
  computeSchedule,
  computeStatuses,
  validateNewDependency,
} from "./src/engine.js";

const tasks = [
  { id: "a", column: "done", planned_start: 0, duration_days: 2 },
  { id: "b", column: "in_progress", planned_start: 0, duration_days: 1 },
  { id: "c", column: "backlog", planned_start: 0, duration_days: 1 },
  { id: "d", column: "backlog", planned_start: 0, duration_days: 1 },
];
const edges = [
  ["b", "a"],
  ["c", "a"],
  ["d", "b"],
  ["d", "c"],
];

test("schedules a diamond from the maximum prerequisite end", () => {
  const scheduled = computeSchedule(tasks, edges);
  assert.equal(scheduled.get("d").start_date, 5);
});

test("derives rollback blocking through descendants", () => {
  const statuses = computeStatuses(
    tasks.map((task) => ({
      ...task,
      column: task.id === "a" ? "in_progress" : task.column,
    })),
    edges,
  );
  assert.equal(statuses.get("d"), "blocked");
});

test("rejects a dependency that closes a cycle", () => {
  assert.throws(
    () => validateNewDependency(["a", "b"], [["b", "a"]], "a", "b"),
    /cycle/i,
  );
});
