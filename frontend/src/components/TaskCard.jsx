import { useDraggable } from "@dnd-kit/core";

export default function TaskCard({
  task,
  prereqDetails = [],
  dependentsCount = 0,
  isCriticalPath = false,
  onOpen,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id, data: { task } });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 99,
      }
    : undefined;

  const isBlocked = task.status === "blocked";
  const isReady = task.status === "ready";
  const isDone = task.status === "done";

  // Check how many prerequisites are still pending (blocking)
  const pendingPrereqs = prereqDetails.filter((p) => p.column !== "done");

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`task-card ${isDragging ? "task-card--dragging" : ""} ${
        isCriticalPath ? "task-card--critical" : ""
      } task-card--${task.status}`}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {/* Top Status & ID Bar */}
      <div className="task-card__header">
        <div className="task-card__badges">
          {/* Main Derived Status Badge */}
          {isBlocked && (
            <span className="badge badge--blocked" title="Cannot be worked on until all prerequisites are Done">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Blocked
            </span>
          )}

          {isReady && (
            <span className="badge badge--ready" title="Prerequisites completed - ready to start">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              Ready
            </span>
          )}

          {isDone && (
            <span className="badge badge--done" title="Completed - unblocks downstream tasks">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Done
            </span>
          )}

          {/* Critical Path Badge */}
          {isCriticalPath && (
            <span className="badge badge--critical" title="On the Critical Path (longest duration chain)">
              ⚡ Critical
            </span>
          )}
        </div>

        <span className="task-card__id mono" title={`ID: ${task.id}`}>
          #{task.id.slice(0, 8)}
        </span>
      </div>

      {/* Task Title */}
      <h3 className="task-card__title">{task.title}</h3>

      {/* Description Snippet if present */}
      {task.description && (
        <p className="task-card__description">
          {task.description.length > 75
            ? `${task.description.slice(0, 72)}…`
            : task.description}
        </p>
      )}

      {/* Schedule Info (Start -> End & Duration) */}
      <div className="task-card__schedule">
        <span className="schedule-pill mono">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          Day {task.start_date} → {task.end_date}
        </span>
        <span className="duration-pill mono">{task.duration_days}d</span>
      </div>

      {/* Prerequisites & Blocking Explanation */}
      {prereqDetails.length > 0 && (
        <div className="task-card__deps-section">
          <div className="task-card__deps-header">
            <span className="deps-label">Prerequisites:</span>
            <span className={`deps-ratio mono ${pendingPrereqs.length > 0 ? "deps-ratio--pending" : "deps-ratio--ok"}`}>
              {prereqDetails.length - pendingPrereqs.length}/{prereqDetails.length} done
            </span>
          </div>

          <div className="task-card__dep-chips">
            {prereqDetails.slice(0, 3).map((prereq) => {
              const isPrereqDone = prereq.column === "done";
              return (
                <div
                  key={prereq.id}
                  className={`dep-chip ${isPrereqDone ? "dep-chip--done" : "dep-chip--blocking"}`}
                  title={`${prereq.title} (${isPrereqDone ? "Done - Satisfied" : "Pending - BLOCKING"})`}
                >
                  <span className="dep-chip__icon">
                    {isPrereqDone ? "✓" : "🔒"}
                  </span>
                  <span className="dep-chip__title">{prereq.title}</span>
                </div>
              );
            })}
            {prereqDetails.length > 3 && (
              <span className="dep-chip dep-chip--more mono">
                +{prereqDetails.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Downstream Dependents indicator (Impact) */}
      {dependentsCount > 0 && (
        <div className="task-card__impact-footer">
          <span className="impact-text mono" title={`${dependentsCount} downstream tasks depend on this one`}>
            ↳ Blocks {dependentsCount} downstream task{dependentsCount > 1 ? "s" : ""}
          </span>
        </div>
      )}
    </div>
  );
}
