# TaskFlow Pro

TaskFlow Pro is a dependency-aware Kanban board. Tasks can depend on other tasks, cycles are rejected before persistence, dates are recomputed from prerequisites, and blocked status cascades through the dependency graph.

## Stack

- Frontend: React, TypeScript, Vite, dnd-kit
- Backend: Node.js, Express 5, Zod validation
- Database: PostgreSQL via `pg` with parameterized SQL and transactions
- Optional AI: Google Gemini API (or Anthropic API), with a deterministic keyword-overlap fallback

## Local setup

Requirements: Node.js 20+, npm, and PostgreSQL 14+.

### 1. Create the database

```sql
CREATE DATABASE taskflow;
```

### 2. Start the backend

```bash
cd backend
npm install
copy .env.example .env       # Windows PowerShell
# cp .env.example .env       # macOS/Linux
# Edit DATABASE_URL if your PostgreSQL credentials differ.
npm run seed
npm run dev
```

The API runs at `http://localhost:8000`. The server creates its tables on startup. The seed command creates **9 realistic tasks** and **9 dependency relationships**, including converging dependency paths.

### 3. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

### Tests

```bash
cd backend
npm test
```

The focused tests cover diamond scheduling, transitive blocking, and cycle rejection. A PostgreSQL instance is required for the API and seed commands.

## API

| Method | Path                                    | Purpose                                   |
| ------ | --------------------------------------- | ----------------------------------------- |
| GET    | `/health`                               | Database-backed health check              |
| GET    | `/board`                                | Full board with computed dates and status |
| GET    | `/critical-path`                        | Longest dependency chain                  |
| POST   | `/tasks`                                | Create a task                             |
| PATCH  | `/tasks/:id`                            | Update task details                       |
| DELETE | `/tasks/:id`                            | Delete a task without dependents          |
| POST   | `/tasks/:id/move`                       | Move a task between columns               |
| POST   | `/dependencies`                         | Add a cycle-safe dependency               |
| DELETE | `/dependencies/:taskId/:prerequisiteId` | Remove a dependency                       |
| POST   | `/ai/suggest-dependencies`              | Get validated suggestions                 |
| POST   | `/ai/suggestions/:id/decide`            | Accept or reject a suggestion             |

All write endpoints return the full `{ tasks, dependencies }` board shape expected by the frontend.

## AI-Tool Declaration

An AI coding assistant was used to help translate the original Python/FastAPI implementation into Node.js/Express, draft the JavaScript engine tests, and review the PostgreSQL schema and documentation. The resulting code was reviewed and validated locally. The optional runtime dependency-suggestion feature may call Google Gemini when `GEMINI_API_KEY` is configured (or Anthropic when `ANTHROPIC_API_KEY` is set); otherwise it uses the documented offline fallback. The runtime model never receives database credentials or write access.

## Key Assumptions

- This sprint supports one shared board and does not include authentication or per-user workspaces.
- Dependencies are finish-to-start only: a prerequisite must be Done before its dependent can proceed.
- Dates are integer day offsets, not calendar dates, and do not account for weekends or holidays.
- The frontend and backend are deployed separately when hosted; `FRONTEND_ORIGIN` controls CORS.

## Limitations

- There is no real-time synchronization or conflict-resolution layer for simultaneous edits.
- The in-memory AI rate limiter resets when the server restarts and is not suitable for multi-instance scaling.
- The offline AI fallback is keyword-based and less capable than an LLM.
- No authentication, authorization, audit history, file attachments, or notification system is included.
- A live deployment URL is not included in this repository; deployment requires a hosted PostgreSQL database and Node service configuration.

## Project structure

```text
taskflow-pro/
├── backend/
│   ├── src/server.js       # Express API and route handlers
│   ├── src/db.js           # PostgreSQL pool, schema, transactions
│   ├── src/engine.js       # Pure dependency graph algorithms
│   ├── src/seed.js         # 9-task demo dataset
│   ├── test-engine.mjs     # Node test runner tests
│   ├── package.json
│   └── .env.example
└── frontend/
    └── src/                # React board UI
```

## GitHub and deployment

Create a public repository, push this project, and configure these backend environment variables on the host: `DATABASE_URL`, `FRONTEND_ORIGIN`, and `PORT`. Run `npm run seed` once against the production database before sharing the frontend URL.
