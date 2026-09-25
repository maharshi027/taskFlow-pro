import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;
export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/taskflow",
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : undefined,
});

export async function query(text, values) {
  return pool.query(text, values);
}

export async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function initializeDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
      description TEXT NOT NULL DEFAULT '',
      column_name TEXT NOT NULL CHECK (column_name IN ('backlog', 'in_progress', 'review', 'done')),
      position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
      planned_start INTEGER NOT NULL DEFAULT 0 CHECK (planned_start >= 0),
      duration_days INTEGER NOT NULL DEFAULT 1 CHECK (duration_days BETWEEN 1 AND 365),
      start_date INTEGER NOT NULL DEFAULT 0,
      end_date INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS dependencies (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      prerequisite_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (task_id, prerequisite_id),
      CHECK (task_id <> prerequisite_id)
    );
    CREATE TABLE IF NOT EXISTS ai_suggestions (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      prerequisite_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      confidence INTEGER NOT NULL CHECK (confidence BETWEEN 0 AND 100),
      reason TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'accepted', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (task_id, prerequisite_id)
    );
  `);
}
