import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { z } from "zod";
import {
  initializeDatabase,
  pool,
  query,
  withTransaction,
} from "../config/db.js";
import {
  computeSchedule,
  computeStatuses,
  criticalPath,
  validateNewDependency,
  CycleError,
  SelfDependencyError,
  DuplicateEdgeError,
} from "./engine.js";

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT || 8000);
const VALID_COLUMNS = ["backlog", "in_progress", "review", "done"];
const id = () => crypto.randomUUID().replaceAll("-", "").slice(0, 12);

const configuredOrigin = process.env.FRONTEND_ORIGIN;
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (
        (configuredOrigin && origin === configuredOrigin) ||
        /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error("CORS policy violation: Origin not allowed"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "100kb" }));

const taskCreate = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  column: z.enum(VALID_COLUMNS).optional().default("backlog"),
  planned_start: z.number().int().min(0).optional().default(0),
  duration_days: z.number().int().min(1).max(365).optional().default(1),
});
const taskUpdate = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    planned_start: z.number().int().min(0).optional(),
    duration_days: z.number().int().min(1).max(365).optional(),
  })
  .strict();
const move = z.object({
  column: z.enum(VALID_COLUMNS),
  position: z.number().int().min(0).default(0),
});
const dependency = z.object({
  task_id: z.string().min(1),
  prerequisite_id: z.string().min(1),
});

function taskFromRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || "",
    column: row.column_name,
    position: row.position,
    planned_start: row.planned_start,
    duration_days: row.duration_days,
    start_date: row.start_date,
    end_date: row.end_date,
  };
}

async function loadRaw(executor = { query }) {
  const [tasksResult, dependenciesResult] = await Promise.all([
    executor.query(
      "SELECT * FROM tasks ORDER BY column_name, position, created_at, id",
    ),
    executor.query(
      "SELECT id, task_id, prerequisite_id FROM dependencies ORDER BY created_at, id",
    ),
  ]);
  return {
    tasks: tasksResult.rows.map(taskFromRow),
    dependencies: dependenciesResult.rows,
    edges: dependenciesResult.rows.map((row) => [
      row.task_id,
      row.prerequisite_id,
    ]),
  };
}

function boardFromRaw(raw) {
  if (!raw.tasks.length) return { tasks: [], dependencies: [] };
  const scheduled = computeSchedule(raw.tasks, raw.edges);
  const scheduledTasks = raw.tasks.map((task) => ({
    ...task,
    ...scheduled.get(task.id),
  }));
  const statuses = computeStatuses(scheduledTasks, raw.edges);
  return {
    tasks: scheduledTasks.map((task) => ({
      ...task,
      status: statuses.get(task.id),
    })),
    dependencies: raw.dependencies,
  };
}

async function getBoard(executor = { query }) {
  return boardFromRaw(await loadRaw(executor));
}

async function persistSchedule(executor, board) {
  for (const task of board.tasks) {
    await executor.query(
      "UPDATE tasks SET start_date = $1, end_date = $2, updated_at = NOW() WHERE id = $3",
      [task.start_date, task.end_date, task.id],
    );
  }
}

function sendError(res, status, detail) {
  return res.status(status).json({ detail });
}

function parseBody(schema, req, res) {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    sendError(
      res,
      422,
      result.error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; "),
    );
    return null;
  }
  return result.data;
}

function graphErrorStatus(error) {
  return error instanceof SelfDependencyError ? 422 : 409;
}

app.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok" });
  } catch {
    sendError(res, 503, "Database unavailable.");
  }
});

app.get("/board", async (_req, res, next) => {
  try {
    res.json(await getBoard());
  } catch (error) {
    next(error);
  }
});

app.post("/board/reset-seed", async (_req, res, next) => {
  try {
    await withTransaction(async (client) => {
      await client.query("TRUNCATE ai_suggestions, dependencies, tasks CASCADE");
      const seedTasks = [
        ["schema", "Design PostgreSQL schema", "Define tables and constraints for tasks, dependencies, and AI suggestions.", "done", 0, 2],
        ["api", "Build Express API", "Implement REST endpoints with validation and PostgreSQL transactions.", "done", 0, 4],
        ["frontend_shell", "Scaffold React frontend", "Set up the Vite TypeScript application and board layout.", "done", 0, 2],
        ["dep_engine", "Implement dependency engine", "Add cycle detection, scheduling, status derivation, and critical path logic.", "done", 0, 3],
        ["dnd", "Connect drag-and-drop board", "Wire column movement to the API and enforce blocked-task rules.", "in_progress", 0, 3],
        ["ai_suggest", "Add AI dependency suggestions", "Offer validated prerequisite suggestions with a deterministic offline fallback.", "backlog", 0, 2],
        ["integration_tests", "Write integration tests", "Exercise CRUD, dependency validation, rollback cascades, and API responses.", "backlog", 0, 2],
        ["critical_path_ui", "Show critical path", "Highlight the longest dependency chain in the schematic view.", "backlog", 0, 1],
        ["deploy", "Deploy and document", "Add production environment notes, seed instructions, assumptions, and limitations.", "backlog", 0, 1],
      ];
      const colCounts = {};
      for (const [taskId, title, description, columnName, plannedStart, durationDays] of seedTasks) {
        const position = colCounts[columnName] || 0;
        colCounts[columnName] = position + 1;
        await client.query(
          `INSERT INTO tasks (id, title, description, column_name, position, planned_start, duration_days, start_date, end_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $6::integer + $7::integer)`,
          [taskId, title, description, columnName, position, plannedStart, durationDays],
        );
      }
      const seedEdges = [
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
      for (const [taskId, prerequisiteId] of seedEdges) {
        await client.query(
          "INSERT INTO dependencies (id, task_id, prerequisite_id) VALUES ($1, $2, $3)",
          [`${taskId}-${prerequisiteId}`, taskId, prerequisiteId],
        );
      }
      await persistSchedule(client, await getBoard(client));
    });
    res.json(await getBoard());
  } catch (error) {
    next(error);
  }
});

app.get("/critical-path", async (_req, res, next) => {
  try {
    const raw = await loadRaw();
    const [path, total] = criticalPath(raw.tasks, raw.edges);
    res.json({ path, total_duration_days: total });
  } catch (error) {
    next(error);
  }
});

app.post("/tasks", async (req, res, next) => {
  const payload = parseBody(taskCreate, req, res);
  if (!payload) return;
  try {
    const position = await query(
      "SELECT COUNT(*)::int AS count FROM tasks WHERE column_name = $1",
      [payload.column],
    );
    await query(
      `INSERT INTO tasks (id, title, description, column_name, position, planned_start, duration_days, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $6::integer + $7::integer)`,
      [
        id(),
        payload.title,
        payload.description,
        payload.column,
        position.rows[0].count,
        payload.planned_start,
        payload.duration_days,
      ],
    );
    res.json(await getBoard());
  } catch (error) {
    next(error);
  }
});

app.patch("/tasks/:taskId", async (req, res, next) => {
  const payload = parseBody(taskUpdate, req, res);
  if (!payload) return;
  try {
    const fields = Object.entries(payload);
    if (!fields.length) return res.json(await getBoard());
    const updates = fields.map(
      ([key], index) =>
        `${key === "planned_start" ? "planned_start" : key === "duration_days" ? "duration_days" : key} = $${index + 1}`,
    );
    const values = fields.map(([, value]) => value);
    values.push(req.params.taskId);
    const result = await query(
      `UPDATE tasks SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $${values.length}`,
      values,
    );
    if (!result.rowCount)
      return sendError(res, 404, `Task '${req.params.taskId}' not found.`);
    const board = await getBoard();
    await persistSchedule({ query }, board);
    res.json(await getBoard());
  } catch (error) {
    next(error);
  }
});

app.delete("/tasks/:taskId", async (req, res, next) => {
  try {
    const exists = await query("SELECT id FROM tasks WHERE id = $1", [
      req.params.taskId,
    ]);
    if (!exists.rowCount)
      return sendError(res, 404, `Task '${req.params.taskId}' not found.`);
    const dependents = await query(
      "SELECT COUNT(*)::int AS count FROM dependencies WHERE prerequisite_id = $1",
      [req.params.taskId],
    );
    if (dependents.rows[0].count)
      return sendError(
        res,
        409,
        `Cannot delete '${req.params.taskId}': ${dependents.rows[0].count} task(s) still depend on it. Remove those dependencies first.`,
      );
    await query("DELETE FROM tasks WHERE id = $1", [req.params.taskId]);
    res.json(await getBoard());
  } catch (error) {
    next(error);
  }
});

app.post("/tasks/:taskId/move", async (req, res, next) => {
  const payload = parseBody(move, req, res);
  if (!payload) return;
  try {
    const raw = await loadRaw();
    if (!raw.tasks.some((task) => task.id === req.params.taskId))
      return sendError(res, 404, `Task '${req.params.taskId}' not found.`);
    if (payload.column !== "backlog") {
      const simulated = raw.tasks.map((task) =>
        task.id === req.params.taskId
          ? { ...task, column: payload.column }
          : task,
      );
      if (
        computeStatuses(simulated, raw.edges).get(req.params.taskId) ===
        "blocked"
      ) {
        const targetTask = raw.tasks.find((t) => t.id === req.params.taskId);
        const prereqIds = raw.edges
          .filter(([t]) => t === req.params.taskId)
          .map(([, p]) => p);
        const taskMap = new Map(raw.tasks.map((t) => [t.id, t]));
        const unmet = prereqIds
          .map((pId) => taskMap.get(pId))
          .filter((t) => t && t.column !== "done")
          .map((t) => `"${t.title}"`);
        const unmetStr = unmet.length ? ` (${unmet.join(", ")})` : "";
        return sendError(
          res,
          409,
          `Cannot move "${targetTask?.title || req.params.taskId}" to ${payload.column}: Task is Blocked until its prerequisite${unmet.length > 1 ? "s" : ""}${unmetStr} are Done.`,
        );
      }
    }
    await withTransaction(async (client) => {
      await client.query(
        "UPDATE tasks SET column_name = $1, position = $2, updated_at = NOW() WHERE id = $3",
        [payload.column, payload.position, req.params.taskId],
      );
      await persistSchedule(client, await getBoard(client));
    });
    res.json(await getBoard());
  } catch (error) {
    next(error);
  }
});

app.post("/dependencies", async (req, res, next) => {
  const payload = parseBody(dependency, req, res);
  if (!payload) return;
  try {
    const raw = await loadRaw();
    const taskIds = raw.tasks.map((task) => task.id);
    if (
      !taskIds.includes(payload.task_id) ||
      !taskIds.includes(payload.prerequisite_id)
    )
      return sendError(res, 404, "task_id or prerequisite_id not found.");
    validateNewDependency(
      taskIds,
      raw.edges,
      payload.task_id,
      payload.prerequisite_id,
    );
    await withTransaction(async (client) => {
      await client.query(
        "INSERT INTO dependencies (id, task_id, prerequisite_id) VALUES ($1, $2, $3)",
        [id(), payload.task_id, payload.prerequisite_id],
      );
      await persistSchedule(client, await getBoard(client));
    });
    res.json(await getBoard());
  } catch (error) {
    if (
      error instanceof CycleError ||
      error instanceof SelfDependencyError ||
      error instanceof DuplicateEdgeError
    )
      return sendError(res, graphErrorStatus(error), error.message);
    if (error.code === "23505")
      return sendError(res, 409, "Dependency already exists.");
    next(error);
  }
});

app.delete("/dependencies/:taskId/:prerequisiteId", async (req, res, next) => {
  try {
    const result = await query(
      "DELETE FROM dependencies WHERE task_id = $1 AND prerequisite_id = $2",
      [req.params.taskId, req.params.prerequisiteId],
    );
    if (!result.rowCount) return sendError(res, 404, "Dependency not found.");
    const board = await getBoard();
    await persistSchedule({ query }, board);
    res.json(await getBoard());
  } catch (error) {
    next(error);
  }
});

const rateLog = [];
function checkRateLimit() {
  const now = Date.now();
  while (rateLog[0] && now - rateLog[0] > 60_000) rateLog.shift();
  if (rateLog.length >= 10) return false;
  rateLog.push(now);
  return true;
}
const STOP_WORDS = new Set([
  "the", "and", "a", "an", "for", "in", "on", "to", "of", "with",
  "is", "it", "this", "that", "tasks", "task", "by", "from", "at"
]);
function words(value) {
  const matches = (value || "").toLowerCase().match(/[a-z]{2,}/g) || [];
  return new Set(matches.filter((w) => !STOP_WORDS.has(w)));
}
function fallbackSuggestions(target, candidates) {
  const targetWords = words(`${target.title} ${target.description}`);
  return candidates
    .map((candidate) => {
      const overlap = [
        ...words(`${candidate.title} ${candidate.description}`),
      ].filter((word) => targetWords.has(word)).length;
      return { candidate, overlap };
    })
    .filter((item) => item.overlap)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, 5)
    .map(({ candidate, overlap }) => ({
      prerequisite_id: candidate.id,
      confidence: Math.min(40 + overlap * 10, 70),
      reason: `Keyword overlap with '${candidate.title}' (offline fallback, no AI key configured).`,
    }));
}
async function aiSuggestions(target, candidates) {
  const geminiApiKey = process.env.GEMINI_API_KEY?.trim();
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY?.trim();

  if (geminiApiKey) {
    try {
      const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": geminiApiKey,
            "content-type": "application/json",
          },
          signal: AbortSignal.timeout(
            Number(process.env.AI_TIMEOUT_MS || 8000),
          ),
          body: JSON.stringify({
            systemInstruction: {
              parts: [
                {
                  text: "Suggest prerequisite tasks. Return strict JSON only: an array of {prerequisite_id, confidence, reason}. Use only candidate ids and return [] when unsure.",
                },
              ],
            },
            contents: [
              {
                role: "user",
                parts: [
                  {
                    text: JSON.stringify({ target, candidates }),
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0,
              responseMimeType: "application/json",
            },
          }),
        },
      );
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Gemini request failed (${response.status}): ${errorText}`,
        );
      }
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const text = rawText.trim().replace(/^```json\s*|\s*```$/g, "");
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      const summary =
        err.message.length > 120 ? `${err.message.slice(0, 120)}...` : err.message;
      console.warn("Gemini AI unavailable, using keyword fallback:", summary);
      return fallbackSuggestions(target, candidates);
    }
  }

  if (anthropicApiKey) {
    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(Number(process.env.AI_TIMEOUT_MS || 8000)),
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6",
          max_tokens: 1000,
          temperature: 0,
          system:
            "Suggest prerequisite tasks. Return strict JSON only: an array of {prerequisite_id, confidence, reason}. Use only candidate ids and return [] when unsure.",
          messages: [
            { role: "user", content: JSON.stringify({ target, candidates }) },
          ],
        }),
      });
      if (!response.ok) throw new Error("Anthropic AI request failed");
      const data = await response.json();
      const text = (data.content || [])
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("")
        .replace(/^```json\s*|\s*```$/g, "");
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error("Anthropic AI suggestion error:", err.message);
      return fallbackSuggestions(target, candidates);
    }
  }

  return fallbackSuggestions(target, candidates);
}

app.post("/ai/suggest-dependencies", async (req, res, next) => {
  if (!checkRateLimit())
    return sendError(
      res,
      429,
      "AI endpoint rate limited: max 10 requests per 60s.",
    );
  try {
    const taskId = z
      .object({ task_id: z.string().min(1) })
      .parse(req.body).task_id;
    const raw = await loadRaw();
    const target = raw.tasks.find((task) => task.id === taskId);
    if (!target) return sendError(res, 404, `Task '${taskId}' not found.`);
    const candidates = raw.tasks
      .filter((task) => task.id !== taskId)
      .map(({ id, title, description }) => ({ id, title, description }));
    const rejected = new Set(
      (
        await query(
          "SELECT prerequisite_id FROM ai_suggestions WHERE task_id = $1 AND state = 'rejected'",
          [taskId],
        )
      ).rows.map((row) => row.prerequisite_id),
    );
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const suggestions = await aiSuggestions(target, candidates);
    const valid = [];
    for (const suggestion of suggestions) {
      const prerequisiteId = suggestion.prerequisite_id;
      if (
        !candidateIds.has(prerequisiteId) ||
        rejected.has(prerequisiteId) ||
        raw.edges.some(
          ([task, prerequisite]) =>
            task === taskId && prerequisite === prerequisiteId,
        )
      )
        continue;
      try {
        validateNewDependency(
          raw.tasks.map((task) => task.id),
          raw.edges,
          taskId,
          prerequisiteId,
        );
      } catch {
        continue;
      }
      valid.push({
        prerequisite_id: prerequisiteId,
        confidence: Math.max(
          0,
          Math.min(100, Number(suggestion.confidence) || 50),
        ),
        reason: String(suggestion.reason || "").slice(0, 300),
      });
    }
    const output = [];
    for (const suggestion of valid.slice(0, 5)) {
      const result = await query(
        `INSERT INTO ai_suggestions (id, task_id, prerequisite_id, confidence, reason, state) VALUES ($1, $2, $3, $4, $5, 'pending') ON CONFLICT (task_id, prerequisite_id) DO UPDATE SET confidence = EXCLUDED.confidence, reason = EXCLUDED.reason, state = 'pending' RETURNING *`,
        [
          id(),
          taskId,
          suggestion.prerequisite_id,
          suggestion.confidence,
          suggestion.reason,
        ],
      );
      output.push(result.rows[0]);
    }
    res.json(output);
  } catch (error) {
    if (error instanceof z.ZodError)
      return sendError(res, 422, "task_id is required.");
    next(error);
  }
});

app.post("/ai/suggestions/:suggestionId/decide", async (req, res, next) => {
  try {
    const accept = z.object({ accept: z.boolean() }).parse(req.body).accept;
    const result = await query("SELECT * FROM ai_suggestions WHERE id = $1", [
      req.params.suggestionId,
    ]);
    const suggestion = result.rows[0];
    if (!suggestion) return sendError(res, 404, "Suggestion not found.");
    if (accept) {
      const raw = await loadRaw();
      try {
        validateNewDependency(
          raw.tasks.map((task) => task.id),
          raw.edges,
          suggestion.task_id,
          suggestion.prerequisite_id,
        );
      } catch (error) {
        await query(
          "UPDATE ai_suggestions SET state = 'rejected' WHERE id = $1",
          [suggestion.id],
        );
        return sendError(res, graphErrorStatus(error), error.message);
      }
      await withTransaction(async (client) => {
        await client.query(
          "INSERT INTO dependencies (id, task_id, prerequisite_id) VALUES ($1, $2, $3)",
          [id(), suggestion.task_id, suggestion.prerequisite_id],
        );
        await client.query(
          "UPDATE ai_suggestions SET state = 'accepted' WHERE id = $1",
          [suggestion.id],
        );
        await persistSchedule(client, await getBoard(client));
      });
    } else
      await query(
        "UPDATE ai_suggestions SET state = 'rejected' WHERE id = $1",
        [suggestion.id],
      );
    res.json(await getBoard());
  } catch (error) {
    if (error instanceof z.ZodError)
      return sendError(res, 422, "accept must be boolean.");
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  if (
    error.type === "entity.parse.failed" ||
    (error instanceof SyntaxError && error.status === 400 && "body" in error)
  ) {
    return sendError(res, 400, "Invalid JSON payload in request body.");
  }
  console.error(error);
  if (error.code === "23505")
    return sendError(res, 409, "A record with those values already exists.");
  sendError(res, 500, "Internal server error.");
});

await initializeDatabase();
app.listen(PORT, () =>
  console.log(`TaskFlow Pro API listening on http://localhost:${PORT}`),
);
