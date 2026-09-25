export default function TitleBlock({ tasks, onNewTask, onOpenSchematic }) {
  const blocked = tasks.filter((task) => task.status === "blocked").length;
  const ready = tasks.filter((task) => task.status === "ready").length;
  const done = tasks.filter((task) => task.status === "done").length;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <header className="title-block">
      <div className="title-block__id">
        <span className="title-block__mark" aria-hidden="true">
          <svg viewBox="0 0 32 32" width="26" height="26">
            <circle
              cx="16"
              cy="16"
              r="13"
              fill="none"
              stroke="var(--signal-amber)"
              strokeWidth="2"
            />
            <path
              d="M9 16 L14 21 L23 11"
              fill="none"
              stroke="var(--signal-amber)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <h1>TaskFlow Pro</h1>
          <p className="mono title-block__subtitle">
            dependency-aware build schedule
          </p>
        </div>
      </div>
      <dl className="title-block__meta mono">
        <div>
          <dt>rev.</dt>
          <dd>{today}</dd>
        </div>
        <div>
          <dt>ready</dt>
          <dd style={{ color: "var(--signal-amber)" }}>{ready}</dd>
        </div>
        <div>
          <dt>blocked</dt>
          <dd style={{ color: "var(--signal-red)" }}>{blocked}</dd>
        </div>
        <div>
          <dt>done</dt>
          <dd style={{ color: "var(--signal-teal)" }}>
            {done}/{tasks.length}
          </dd>
        </div>
      </dl>
      <div className="title-block__actions">
        <button className="btn btn--ghost" onClick={onOpenSchematic}>
          Schematic view
        </button>
        <button className="btn btn--solid" onClick={onNewTask}>
          + New task
        </button>
      </div>
    </header>
  );
}
