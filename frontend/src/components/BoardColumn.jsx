import { useDroppable } from "@dnd-kit/core";
import TaskCard from "./TaskCard.jsx";

const COLUMN_META = {
  backlog: {
    icon: "📋",
    subtitle: "Pending start or prerequisites",
    accent: "var(--text-muted)",
  },
  in_progress: {
    icon: "⚡",
    subtitle: "Actively being worked on",
    accent: "var(--status-progress)",
  },
  review: {
    icon: "👀",
    subtitle: "Verification & code review",
    accent: "var(--status-review)",
  },
  done: {
    icon: "✓",
    subtitle: "Satisfies dependent tasks",
    accent: "var(--status-done)",
  },
};

export default function BoardColumn({
  column,
  label,
  tasks,
  prereqsFor,
  dependentsCountFor,
  criticalPathIds,
  onOpenTask,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  const meta = COLUMN_META[column] || {
    icon: "📌",
    subtitle: "",
    accent: "var(--accent-primary)",
  };

  const sortedTasks = tasks.slice().sort((a, b) => a.position - b.position);

  return (
    <section className={`board-column ${isOver ? "board-column--over" : ""} board-column--${column}`}>
      <header className="board-column__header">
        <div className="board-column__title-group">
          <div className="board-column__icon-name">
            <span className="board-column__icon">{meta.icon}</span>
            <h2 className="board-column__heading">{label}</h2>
          </div>
          <span className="board-column__badge mono">{tasks.length}</span>
        </div>
        <p className="board-column__subtitle">{meta.subtitle}</p>
      </header>

      <div ref={setNodeRef} className="board-column__dropzone">
        {sortedTasks.length === 0 ? (
          <div className="board-column__empty">
            <div className="empty-drop-box">
              <span className="empty-drop-icon">⇣</span>
              <span className="empty-drop-text">Drop tasks here</span>
            </div>
          </div>
        ) : (
          sortedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              prereqDetails={prereqsFor(task)}
              dependentsCount={dependentsCountFor(task)}
              isCriticalPath={criticalPathIds.has(task.id)}
              onOpen={() => onOpenTask(task)}
            />
          ))
        )}
      </div>
    </section>
  );
}
