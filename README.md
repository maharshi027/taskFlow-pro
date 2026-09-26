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

The API runs at `http://localhost:6000`. The server creates its tables on startup. The seed command creates **9 realistic tasks** and **9 dependency relationships**, including converging dependency paths.

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

| Method | Path                                    | Purpose                                                        |
| ------ | --------------------------------------- | -------------------------------------------------------------- |
| GET    | `/health`                               | Database-backed health check                                   |
| GET    | `/board`                                | Full board with computed dates and statuses                    |
| POST   | `/board/reset-seed`                     | Reset board to 9 benchmark tasks & DAG edges                   |
| POST   | `/board/clear`                          | Wipe all tasks & dependencies for a clean production board     |
| GET    | `/critical-path`                        | Longest dependency chain & duration                            |
| POST   | `/tasks`                                | Create a task                                                  |
| PATCH  | `/tasks/:id`                            | Update task details (title, dates, duration, description)      |
| DELETE | `/tasks/:id`                            | Delete task (`?cascade=true` to unlink downstream tasks)       |
| POST   | `/tasks/:id/move`                       | Move a task between columns (with automatic rollback reblock)  |
| POST   | `/dependencies`                         | Add a cycle-safe dependency                                    |
| DELETE | `/dependencies/:taskId/:prerequisiteId` | Remove a dependency                                            |
| POST   | `/ai/suggest-dependencies`              | Get validated suggestions (Gemini or offline keyword fallback) |
| POST   | `/ai/suggestions/:id/decide`            | Accept or reject a suggestion                                  |

All write endpoints return the full `{ tasks, dependencies }` board shape expected by the frontend.

## Frontend Views

The application provides three interactive views accessible from the top navigation bar:

- **Kanban Board**: Drag-and-drop workflow across Backlog, In Progress, Review, and Done with live status badges (`Ready`, `Blocked`, `Done`), prerequisite breakdowns (`✓ Complete`, `🔒 Blocking`), downstream impact indicators, and real-time search and status filtering.
- **DAG Dependency Graph**: Interactive directed acyclic graph visualizer showing sequential execution tiers, smooth Bezier curves, arrowheads, glowing Critical Path edges, and hover path-tracing to clearly inspect upstream prerequisites and downstream dependents.
- **Gantt Timeline**: Chronological day-by-day Gantt view that visually demonstrates schedule propagation, converging paths (DAG max scheduling), and critical path duration.

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
│   ├── config/
│   │   └── db.js                 # PostgreSQL pool, schema initialization, and transaction runner
│   ├── src/
│   │   ├── engine.js             # Pure DAG algorithms (topological scheduling, cycle detection, critical path)
│   │   ├── seed.js               # 9-task diamond workflow benchmark seeder
│   │   └── server.js             # Express 5 API, validation schemas, AI integration, and routes
│   ├── test-engine.mjs           # Node test runner suite (diamond scheduling, cycle rejection, rollback)
│   ├── nodemon.json              # Development reload configuration
│   ├── package.json              # Backend dependencies and scripts (dev, start, seed, test)
│   └── .env.example              # Sample backend environment variables template
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Board.jsx         # Kanban drag-and-drop board with search/status filters
│   │   │   ├── BoardColumn.jsx   # Droppable status columns with drop indicators & empty state
│   │   │   ├── SchematicView.jsx # Interactive SVG DAG dependency graph with hover path-tracing
│   │   │   ├── TaskCard.jsx      # Draggable card with status pills, prerequisite chips & critical badges
│   │   │   ├── TaskModal.jsx     # Task edit/create modal with cascade-delete prompt & dependency manager
│   │   │   ├── TimelineView.jsx  # Day-by-day Gantt timeline showing converging paths & critical path
│   │   │   ├── TitleBlock.jsx    # Navigation header with live KPI metrics, view switcher & action CTAs
│   │   │   └── Toast.jsx         # Non-blocking top-right notification toasts
│   │   ├── api.js                # Frontend REST API client
│   │   ├── App.jsx               # Root application state, view routing, and confirmation modals
│   │   ├── app.css               # Comprehensive design system, dark theme tokens, and animations
│   │   ├── theme.css             # Supplementary theme variables and utility classes
│   │   └── main.jsx              # React DOM entry point
│   ├── index.html                # HTML entry point with modern typography
│   ├── package.json              # Frontend dependencies (@dnd-kit, vite, react)
│   ├── vite.config.js            # Vite build and dev server configuration
│   └── .env.example              # Frontend environment variables template
├── .gitignore                    # Git ignore rules for node_modules, build artifacts, and env files
└── README.md                     # Architecture, API specifications, and setup instructions
```

## GitHub and deployment

The repository includes `render.yaml` for a separated Render deployment. It creates a Node web service from `backend/`, a static site from `frontend/`, and a PostgreSQL database. If configuring services manually, use these settings:

- Backend root directory: `backend`
- Backend build command: `npm ci`
- Backend start command: `npm start`
- Backend health check path: `/health`
- Frontend root directory: `frontend`
- Frontend build command: `npm ci && npm run build`
- Frontend publish directory: `dist`

Set `DATABASE_URL` from the Render PostgreSQL service, `FRONTEND_ORIGIN` to the deployed frontend URL, and `VITE_API_URL` to the deployed backend URL. Run `npm run seed` once from the backend service shell against the production database before sharing the frontend URL. Do not use `yarn` or `npm install` as the backend start command.
