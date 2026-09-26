import { useMemo, useState } from "react";

export default function TimelineView({
  board,
  criticalPath,
  onOpenTask,
}) {
  const [hoveredId, setHoveredId] = useState(null);

  const { sortedTasks, maxDay, criticalSet, depsMap, revDepsMap } = useMemo(() => {
    const tasks = [...board.tasks].sort((a, b) => {
      if (a.start_date !== b.start_date) return a.start_date - b.start_date;
      return a.end_date - b.end_date;
    });

    let max = 0;
    for (const t of tasks) {
      if (t.end_date > max) max = t.end_date;
    }
    const maxDay = Math.max(max + 2, 10);
    const criticalSet = new Set(criticalPath);

    const depsMap = new Map();
    const revDepsMap = new Map();
    for (const dep of board.dependencies) {
      if (!depsMap.has(dep.task_id)) depsMap.set(dep.task_id, []);
      depsMap.get(dep.task_id).push(dep.prerequisite_id);

      if (!revDepsMap.has(dep.prerequisite_id)) revDepsMap.set(dep.prerequisite_id, []);
      revDepsMap.get(dep.prerequisite_id).push(dep.task_id);
    }

    return { sortedTasks: tasks, maxDay, criticalSet, depsMap, revDepsMap };
  }, [board, criticalPath]);

  const days = Array.from({ length: maxDay + 1 }, (_, i) => i);
  const titleById = new Map(board.tasks.map((t) => [t.id, t.title]));

  // Related IDs for highlight
  const activePrereqs = hoveredId ? new Set(depsMap.get(hoveredId) || []) : new Set();
  const activeDependents = hoveredId ? new Set(revDepsMap.get(hoveredId) || []) : new Set();

  return (
    <div className="timeline-container">
      <div className="timeline-header-bar">
        <div className="timeline-summary">
          <div className="timeline-stat">
            <span className="timeline-stat__label">Total Span</span>
            <span className="timeline-stat__val mono">{maxDay - 2} Days</span>
          </div>
          <div className="timeline-stat">
            <span className="timeline-stat__label">Critical Path</span>
            <span className="timeline-stat__val mono" style={{ color: "var(--status-critical)" }}>
              {criticalPath.length} Tasks
            </span>
          </div>
          <div className="timeline-stat">
            <span className="timeline-stat__label">Converging Paths</span>
            <span className="timeline-stat__val mono" style={{ color: "var(--status-progress)" }}>
              Resolved via DAG Max
            </span>
          </div>
        </div>
        <div className="timeline-legend">
          <span className="legend-chip legend-chip--done">
            <span className="legend-dot"></span> Done
          </span>
          <span className="legend-chip legend-chip--ready">
            <span className="legend-dot"></span> Ready
          </span>
          <span className="legend-chip legend-chip--blocked">
            <span className="legend-dot"></span> Blocked
          </span>
          <span className="legend-chip legend-chip--critical">
            <span className="legend-dot"></span> Critical Path
          </span>
        </div>
      </div>

      <div className="timeline-board-wrapper">
        <div className="timeline-board">
          {/* Day Columns Header */}
          <div className="timeline-grid-header">
            <div className="timeline-task-col-title">Task & Dependencies</div>
            <div className="timeline-days-track">
              {days.map((day) => (
                <div key={day} className="timeline-day-header mono">
                  Day {day}
                </div>
              ))}
            </div>
          </div>

          {/* Task Rows */}
          <div className="timeline-rows">
            {sortedTasks.length === 0 ? (
              <div
                style={{
                  padding: "60px 24px",
                  textAlign: "center",
                  color: "var(--text-secondary)",
                }}
              >
                <div style={{ fontSize: "2.2rem", marginBottom: "10px" }}>📅</div>
                <h4 style={{ color: "var(--text-primary)", margin: "0 0 6px 0", fontSize: "15px" }}>
                  Timeline is empty
                </h4>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: 0 }}>
                  Create tasks or load demo data to view scheduled timelines and critical path bars.
                </p>
              </div>
            ) : (
              sortedTasks.map((task) => {
              const isHovered = hoveredId === task.id;
              const isPrereqOfHovered = activePrereqs.has(task.id);
              const isDependentOfHovered = activeDependents.has(task.id);
              const isCritical = criticalSet.has(task.id);

              const prereqs = depsMap.get(task.id) || [];
              const prereqNames = prereqs.map((id) => titleById.get(id) || id);

              let rowClass = "timeline-row";
              if (isHovered) rowClass += " timeline-row--hovered";
              else if (isPrereqOfHovered) rowClass += " timeline-row--prereq";
              else if (isDependentOfHovered) rowClass += " timeline-row--dependent";
              else if (hoveredId && !isHovered) rowClass += " timeline-row--dimmed";

              const startDay = task.start_date;
              const endDay = task.end_date;
              const duration = task.duration_days;

              // Grid position percentages
              const leftPercent = (startDay / (maxDay + 1)) * 100;
              const widthPercent = Math.max((duration / (maxDay + 1)) * 100, 3.5);

              return (
                <div
                  key={task.id}
                  className={rowClass}
                  onMouseEnter={() => setHoveredId(task.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => onOpenTask(task)}
                >
                  {/* Left Label Column */}
                  <div className="timeline-task-cell">
                    <div className="timeline-task-info">
                      <div className="timeline-task-main">
                        <span className={`status-dot status-dot--${task.status}`} />
                        <span className="timeline-task-name">{task.title}</span>
                        {isCritical && (
                          <span className="badge badge--critical-tiny" title="On Critical Path">
                            ⚡
                          </span>
                        )}
                      </div>
                      <div className="timeline-task-sub mono">
                        <span>Day {startDay} → {endDay} ({duration}d)</span>
                        {prereqs.length > 0 && (
                          <span className="timeline-prereq-tag" title={`Depends on: ${prereqNames.join(", ")}`}>
                            ↳ {prereqs.length} prereq{prereqs.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Timeline Bar Track */}
                  <div className="timeline-track-cell">
                    {/* Background Day Grid Lines */}
                    <div className="timeline-grid-lines">
                      {days.map((day) => (
                        <div key={day} className="timeline-grid-line" />
                      ))}
                    </div>

                    {/* Bar */}
                    <div
                      className={`timeline-bar timeline-bar--${task.status} ${
                        isCritical ? "timeline-bar--critical" : ""
                      }`}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                      }}
                      title={`${task.title} (Day ${startDay} → Day ${endDay}, ${duration}d)`}
                    >
                      <div className="timeline-bar-content">
                        <span className="timeline-bar-label mono">
                          {duration}d
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
