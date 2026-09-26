import { initializeDatabase, pool, query } from "../config/db.js";

await initializeDatabase();
await query("TRUNCATE ai_suggestions, dependencies, tasks CASCADE");

const tasks = [
  [
    "schema",
    "Design PostgreSQL schema",
    "Define tables and constraints for tasks, dependencies, and AI suggestions.",
    "done",
    0,
    2,
  ],
  [
    "api",
    "Build Express API",
    "Implement REST endpoints with validation and PostgreSQL transactions.",
    "done",
    0,
    4,
  ],
  [
    "frontend_shell",
    "Scaffold React frontend",
    "Set up the Vite TypeScript application and board layout.",
    "done",
    0,
    2,
  ],
  [
    "dep_engine",
    "Implement dependency engine",
    "Add cycle detection, scheduling, status derivation, and critical path logic.",
    "done",
    0,
    3,
  ],
  [
    "dnd",
    "Connect drag-and-drop board",
    "Wire column movement to the API and enforce blocked-task rules.",
    "in_progress",
    0,
    3,
  ],
  [
    "ai_suggest",
    "Add AI dependency suggestions",
    "Offer validated prerequisite suggestions with a deterministic offline fallback.",
    "backlog",
    0,
    2,
  ],
  [
    "integration_tests",
    "Write integration tests",
    "Exercise CRUD, dependency validation, rollback cascades, and API responses.",
    "backlog",
    0,
    2,
  ],
  [
    "critical_path_ui",
    "Show critical path",
    "Highlight the longest dependency chain in the schematic view.",
    "backlog",
    0,
    1,
  ],
  [
    "deploy",
    "Deploy and document",
    "Add production environment notes, seed instructions, assumptions, and limitations.",
    "backlog",
    0,
    1,
  ],
];
const colCounts = {};
for (const [
  taskId,
  title,
  description,
  columnName,
  plannedStart,
  durationDays,
] of tasks) {
  const position = colCounts[columnName] || 0;
  colCounts[columnName] = position + 1;
  await query(
    `INSERT INTO tasks (id, title, description, column_name, position, planned_start, duration_days, start_date, end_date)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $6::integer + $7::integer)`,
    [
      taskId,
      title,
      description,
      columnName,
      position,
      plannedStart,
      durationDays,
    ],
  );
}

const edges = [
  ["api", "schema"],
  ["dnd", "frontend_shell"],
  ["dnd", "dep_engine"],
  ["ai_suggest", "api"],
  ["integration_tests", "api"],
  ["integration_tests", "dnd"],
  ["critical_path_ui", "dep_engine"],
  ["deploy", "integration_tests"],
  ["deploy", "ai_suggest"],
];
for (const [taskId, prerequisiteId] of edges) {
  await query(
    "INSERT INTO dependencies (id, task_id, prerequisite_id) VALUES ($1, $2, $3)",
    [`${taskId}-${prerequisiteId}`, taskId, prerequisiteId],
  );
}
console.log(
  `Seeded ${tasks.length} tasks and ${edges.length} dependencies into PostgreSQL.`,
);
await pool.end();
