export default function TitleBlock({
  tasks,
  criticalPathDuration = 0,
  activeView,
  onViewChange,
  filterQuery,
  onFilterQueryChange,
  filterStatus,
  onFilterStatusChange,
  onNewTask,
  onResetSeed,
  isResetting = false,
}) {
  const total = tasks.length;
  const blocked = tasks.filter((t) => t.status === "blocked").length;
  const ready = tasks.filter((t) => t.status === "ready").length;
  const done = tasks.filter((t) => t.status === "done").length;
  const inProgress = tasks.filter((t) => t.column === "in_progress").length;
  const percentDone = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <header className="navbar">
      {/* Top Main Bar */}
      <div className="navbar__top">
        {/* Brand & Identity */}
        <div className="navbar__brand">
          <div className="brand-logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="28" height="28">
              <defs>
                <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#6366F1" />
                  <stop offset="100%" stopColor="#38BDF8" />
                </linearGradient>
              </defs>
              <circle cx="8" cy="8" r="4.5" fill="url(#logo-grad)" />
              <circle cx="24" cy="8" r="4.5" fill="url(#logo-grad)" />
              <circle cx="16" cy="24" r="5" fill="#F59E0B" />
              <line x1="8" y1="8" x2="16" y2="24" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
              <line x1="24" y1="8" x2="16" y2="24" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
            </svg>
          </div>
          <div>
            <div className="brand-title-wrap">
              <h1 className="brand-title">TaskFlow Pro</h1>
              <span className="brand-pill mono">DAG Engine</span>
            </div>
            <p className="brand-subtitle">
              Dependency-Aware Workflow · Topological Scheduler · Cycle Protection
            </p>
          </div>
        </div>

        {/* Live Metrics Stats */}
        <div className="navbar__metrics">
          <div className="metric-chip metric-chip--ready" title="Ready to start (all prerequisites done)">
            <span className="metric-dot"></span>
            <span className="metric-label">Ready:</span>
            <span className="metric-value mono">{ready}</span>
          </div>

          <div className="metric-chip metric-chip--blocked" title="Blocked by unfinished prerequisites">
            <span className="metric-dot"></span>
            <span className="metric-label">Blocked:</span>
            <span className="metric-value mono">{blocked}</span>
          </div>

          <div className="metric-chip metric-chip--progress" title="Currently in progress">
            <span className="metric-dot"></span>
            <span className="metric-label">In Progress:</span>
            <span className="metric-value mono">{inProgress}</span>
          </div>

          <div className="metric-chip metric-chip--done" title="Completed tasks">
            <div className="metric-progress-wrap">
              <div className="metric-progress-text">
                <span className="metric-label">Done:</span>
                <span className="metric-value mono">{done}/{total} ({percentDone}%)</span>
              </div>
              <div className="mini-progress-bar">
                <div
                  className="mini-progress-fill"
                  style={{ width: `${percentDone}%` }}
                />
              </div>
            </div>
          </div>

          {criticalPathDuration > 0 && (
            <div className="metric-chip metric-chip--critical" title="Longest dependency chain duration">
              <span className="metric-label">⚡ Critical:</span>
              <span className="metric-value mono">{criticalPathDuration}d</span>
            </div>
          )}
        </div>

        {/* Right CTA Actions */}
        <div className="navbar__actions">
          <button
            className="btn btn--ghost btn--small btn--reset"
            onClick={onResetSeed}
            disabled={isResetting}
            title="Reset board to the default 9-task diamond workflow benchmark"
          >
            {isResetting ? "Resetting..." : "🔄 Reset Demo"}
          </button>

          <button
            className="btn btn--primary"
            onClick={onNewTask}
            id="btn-new-task"
          >
            <span className="btn-plus">+</span> New Task
          </button>
        </div>
      </div>

      {/* Sub Bar: Views, Search & Filters */}
      <div className="navbar__controls">
        {/* View Switcher Tabs */}
        <nav className="view-tabs" aria-label="Board Views">
          <button
            className={`view-tab ${activeView === "board" ? "view-tab--active" : ""}`}
            onClick={() => onViewChange("board")}
          >
            <span className="view-tab__icon">📋</span>
            <span>Kanban Board</span>
          </button>

          <button
            className={`view-tab ${activeView === "schematic" ? "view-tab--active" : ""}`}
            onClick={() => onViewChange("schematic")}
          >
            <span className="view-tab__icon">🕸️</span>
            <span>DAG Graph</span>
          </button>

          <button
            className={`view-tab ${activeView === "timeline" ? "view-tab--active" : ""}`}
            onClick={() => onViewChange("timeline")}
          >
            <span className="view-tab__icon">📊</span>
            <span>Gantt Timeline</span>
          </button>
        </nav>

        {/* Search & Filter tools */}
        <div className="filter-group">
          {/* Quick Search */}
          <div className="search-box">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search tasks, descriptions, IDs..."
              value={filterQuery}
              onChange={(e) => onFilterQueryChange(e.target.value)}
              className="search-input"
            />
            {filterQuery && (
              <button
                className="search-clear"
                onClick={() => onFilterQueryChange("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="status-filter">
            <select
              value={filterStatus}
              onChange={(e) => onFilterStatusChange(e.target.value)}
              className="filter-select mono"
            >
              <option value="all">Filter: All Statuses</option>
              <option value="ready">🟡 Ready Only</option>
              <option value="blocked">🔴 Blocked Only</option>
              <option value="done">🟢 Done Only</option>
              <option value="critical">⚡ Critical Path</option>
            </select>
          </div>
        </div>
      </div>
    </header>
  );
}
