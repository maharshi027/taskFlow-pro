import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import BoardColumn from "./BoardColumn.jsx";

const COLUMNS = [
  { key: "backlog", label: "Backlog" },
  { key: "in_progress", label: "In progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

export default function Board({
  board,
  criticalPathIds,
  onOpenTask,
  onMoveTask,
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );
  const titleById = new Map(board.tasks.map((task) => [task.id, task.title]));
  const depsByTask = new Map();
  for (const dependency of board.dependencies) {
    const titles = depsByTask.get(dependency.task_id) ?? [];
    const title = titleById.get(dependency.prerequisite_id);
    if (title) titles.push(title);
    depsByTask.set(dependency.task_id, titles);
  }

  function handleDragEnd({ active, over }) {
    if (!over) return;
    const task = active.data.current?.task;
    if (!task) return;
    const targetColumn = over.id;
    if (targetColumn === task.column) return;
    const targetCount = board.tasks.filter(
      (item) => item.column === targetColumn,
    ).length;
    onMoveTask(task.id, targetColumn, targetCount);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="board-grid">
        {COLUMNS.map((column) => (
          <BoardColumn
            key={column.key}
            column={column.key}
            label={column.label}
            tasks={board.tasks.filter((task) => task.column === column.key)}
            depTitlesFor={(task) => depsByTask.get(task.id) ?? []}
            criticalPathIds={criticalPathIds}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
    </DndContext>
  );
}
