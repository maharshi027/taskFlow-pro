import { useDroppable } from "@dnd-kit/core";
import TaskCard from "./TaskCard.jsx";

export default function BoardColumn({
  column,
  label,
  tasks,
  depTitlesFor,
  criticalPathIds,
  onOpenTask,
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column });
  return (
    <section className={`board-column${isOver ? " board-column--over" : ""}`}>
      <header className="board-column__header">
        <h2>{label}</h2>
        <span className="mono board-column__count">{tasks.length}</span>
      </header>
      <div ref={setNodeRef} className="board-column__drop">
        {tasks.length === 0 && (
          <p className="board-column__empty mono">- empty -</p>
        )}
        {tasks
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              prereqTitles={depTitlesFor(task)}
              isCriticalPath={criticalPathIds.has(task.id)}
              onOpen={() => onOpenTask(task)}
            />
          ))}
      </div>
    </section>
  );
}
