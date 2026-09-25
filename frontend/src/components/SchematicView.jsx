import { useMemo } from "react";

const NODE_W = 168;
const NODE_H = 56;
const COL_GAP = 96;
const ROW_GAP = 24;

function layoutLayers(board) {
  const prereqsOf = new Map();
  for (const task of board.tasks) prereqsOf.set(task.id, []);
  for (const dependency of board.dependencies)
    prereqsOf.get(dependency.task_id)?.push(dependency.prerequisite_id);
  const depth = new Map();
  function resolve(id, guard) {
    if (depth.has(id)) return depth.get(id);
    if (guard.has(id)) return 0;
    guard.add(id);
    const prereqs = prereqsOf.get(id) ?? [];
    const value =
      prereqs.length === 0
        ? 0
        : Math.max(...prereqs.map((prereq) => resolve(prereq, guard))) + 1;
    depth.set(id, value);
    return value;
  }
  for (const task of board.tasks) resolve(task.id, new Set());
  return depth;
}

export default function SchematicView({ board, criticalPath, onClose }) {
  const { positions, width, height } = useMemo(() => {
    const depth = layoutLayers(board);
    const byLayer = new Map();
    for (const task of board.tasks) {
      const layer = depth.get(task.id) ?? 0;
      byLayer.set(layer, [...(byLayer.get(layer) ?? []), task.id]);
    }
    const positions = new Map();
    let maxLayer = 0;
    let maxRows = 1;
    for (const [layer, ids] of byLayer.entries()) {
      maxLayer = Math.max(maxLayer, layer);
      maxRows = Math.max(maxRows, ids.length);
      ids.forEach((id, row) =>
        positions.set(id, {
          x: layer * (NODE_W + COL_GAP) + 24,
          y: row * (NODE_H + ROW_GAP) + 24,
        }),
      );
    }
    return {
      positions,
      width: (maxLayer + 1) * (NODE_W + COL_GAP) + 24,
      height: maxRows * (NODE_H + ROW_GAP) + 24,
    };
  }, [board]);

  const criticalIds = new Set(criticalPath);
  const criticalEdges = new Set(
    criticalPath
      .slice(0, -1)
      .map((id, index) => `${criticalPath[index + 1]}:${id}`),
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--wide"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal__header">
          <span className="mono modal__eyebrow">dependency schematic</span>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="schematic-legend mono">
          <span style={{ color: "var(--signal-amber)" }}>▬</span> critical path
          &nbsp;&nbsp; <span style={{ color: "var(--paper-faint)" }}>▬</span>{" "}
          dependency
        </p>
        <div className="schematic-scroll">
          <svg width={width} height={height} className="schematic-svg">
            {board.dependencies.map((dependency) => {
              const from = positions.get(dependency.prerequisite_id);
              const to = positions.get(dependency.task_id);
              if (!from || !to) return null;
              const startX = from.x + NODE_W;
              const startY = from.y + NODE_H / 2;
              const endX = to.x;
              const endY = to.y + NODE_H / 2;
              const midX = startX + (endX - startX) / 2;
              const isCritical = criticalEdges.has(
                `${dependency.task_id}:${dependency.prerequisite_id}`,
              );
              return (
                <path
                  key={dependency.id}
                  d={`M ${startX} ${startY} H ${midX} V ${endY} H ${endX}`}
                  fill="none"
                  stroke={isCritical ? "var(--signal-amber)" : "var(--line)"}
                  strokeWidth={isCritical ? 2.5 : 1.5}
                />
              );
            })}
            {board.tasks.map((task) => {
              const position = positions.get(task.id);
              if (!position) return null;
              const statusColor =
                task.status === "done"
                  ? "var(--signal-teal)"
                  : task.status === "blocked"
                    ? "var(--signal-red)"
                    : "var(--signal-amber)";
              return (
                <g
                  key={task.id}
                  transform={`translate(${position.x}, ${position.y})`}
                >
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    fill="var(--panel)"
                    stroke={
                      criticalIds.has(task.id)
                        ? "var(--signal-amber)"
                        : "var(--line)"
                    }
                    strokeWidth={criticalIds.has(task.id) ? 2 : 1}
                    rx={3}
                  />
                  <rect width={4} height={NODE_H} fill={statusColor} />
                  <text
                    x={12}
                    y={22}
                    fill="var(--paper)"
                    fontSize={12}
                    fontFamily="var(--font-display)"
                  >
                    {task.title.length > 20
                      ? `${task.title.slice(0, 19)}…`
                      : task.title}
                  </text>
                  <text
                    x={12}
                    y={40}
                    fill="var(--paper-faint)"
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                  >
                    d{task.start_date}-{task.end_date} · {task.status}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
