import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import BoardColumn from "./BoardColumn.jsx";

const COLUMNS = [
  { key: "backlog", label: "Backlog" },
  { key: "in_progress", label: "In Progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

export default function Board({
  board,
  criticalPathIds,
  onOpenTask,
  onMoveTask,
  filterQuery = "",
  filterStatus = "all",
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Precompute lookups for fast rendering and dependency resolution
  const { prereqsMap, dependentsMap } = useMemo(() => {
    const taskById = new Map(board.tasks.map((task) => [task.id, task]));
    const prereqsMap = new Map();
    const dependentsMap = new Map();

    for (const task of board.tasks) {
      prereqsMap.set(task.id, []);
      dependentsMap.set(task.id, []);
    }

    for (const dep of board.dependencies) {
      // dep.task_id depends on dep.prerequisite_id
      const prereqTask = taskById.get(dep.prerequisite_id);
      if (prereqTask) {
        if (!prereqsMap.has(dep.task_id)) prereqsMap.set(dep.task_id, []);
        prereqsMap.get(dep.task_id).push(prereqTask);
      }

      if (!dependentsMap.has(dep.prerequisite_id)) dependentsMap.set(dep.prerequisite_id, []);
      dependentsMap.get(dep.prerequisite_id).push(dep.task_id);
    }

    return { taskById, prereqsMap, dependentsMap };
  }, [board]);

  // Apply search query and status filter
  const filteredTasks = useMemo(() => {
    let list = board.tasks;

    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)),
      );
    }

    if (filterStatus === "critical") {
      list = list.filter((t) => criticalPathIds.has(t.id));
    } else if (filterStatus !== "all") {
      list = list.filter((t) => t.status === filterStatus);
    }

    return list;
  }, [board.tasks, filterQuery, filterStatus, criticalPathIds]);

  function handleDragEnd({ active, over }) {
    if (!over) return;
    const task = active.data.current?.task;
    if (!task) return;
    const targetColumn = over.id;
    if (targetColumn === task.column) return;

    // Calculate position at end of destination column
    const targetCount = board.tasks.filter(
      (item) => item.column === targetColumn,
    ).length;

    onMoveTask(task.id, targetColumn, targetCount);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="board-grid">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((task) => task.column === col.key);
          return (
            <BoardColumn
              key={col.key}
              column={col.key}
              label={col.label}
              tasks={colTasks}
              prereqsFor={(task) => prereqsMap.get(task.id) || []}
              dependentsCountFor={(task) => (dependentsMap.get(task.id) || []).length}
              criticalPathIds={criticalPathIds}
              onOpenTask={onOpenTask}
            />
          );
        })}
      </div>
    </DndContext>
  );
}
