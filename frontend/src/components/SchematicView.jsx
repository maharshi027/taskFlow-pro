import { useMemo, useState } from "react";

const NODE_W = 200;
const NODE_H = 72;
const COL_GAP = 90;
const ROW_GAP = 28;

function layoutLayers(board) {
  const prereqsOf = new Map();
  for (const task of board.tasks) prereqsOf.set(task.id, []);
  for (const dependency of board.dependencies) {
    prereqsOf.get(dependency.task_id)?.push(dependency.prerequisite_id);
  }
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

export default function SchematicView({
  board,
  criticalPath,
  onClose,
  onOpenTask,
  isModal = false,
}) {
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [highlightCriticalOnly, setHighlightCriticalOnly] = useState(false);

  const { positions, width, height, layersCount } = useMemo(() => {
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
          x: layer * (NODE_W + COL_GAP) + 36,
          y: row * (NODE_H + ROW_GAP) + 40,
        }),
      );
    }
    return {
      positions,
      width: Math.max((maxLayer + 1) * (NODE_W + COL_GAP) + 60, 900),
      height: Math.max(maxRows * (NODE_H + ROW_GAP) + 80, 480),
      layersCount: maxLayer + 1,
    };
  }, [board]);

  const criticalIds = useMemo(() => new Set(criticalPath), [criticalPath]);
  const criticalEdges = useMemo(() => {
    const set = new Set();
    for (let i = 0; i < criticalPath.length - 1; i++) {
      // criticalPath is ordered start -> end, so task depends on prerequisite
      // dependency: task_id = criticalPath[i+1], prerequisite_id = criticalPath[i]
      set.add(`${criticalPath[i + 1]}:${criticalPath[i]}`);
    }
    return set;
  }, [criticalPath]);

  // Connected nodes map for hover highlights
  const { incomingEdges, outgoingEdges, incomingNodes, outgoingNodes } = useMemo(() => {
    const incomingEdges = new Map();
    const outgoingEdges = new Map();
    const incomingNodes = new Map();
    const outgoingNodes = new Map();

    for (const t of board.tasks) {
      incomingEdges.set(t.id, new Set());
      outgoingEdges.set(t.id, new Set());
      incomingNodes.set(t.id, new Set());
      outgoingNodes.set(t.id, new Set());
    }

    for (const dep of board.dependencies) {
      // dep.prerequisite_id -> dep.task_id
      const edgeKey = `${dep.task_id}:${dep.prerequisite_id}`;
      outgoingEdges.get(dep.prerequisite_id)?.add(edgeKey);
      incomingEdges.get(dep.task_id)?.add(edgeKey);
      outgoingNodes.get(dep.prerequisite_id)?.add(dep.task_id);
      incomingNodes.get(dep.task_id)?.add(dep.prerequisite_id);
    }

    return { incomingEdges, outgoingEdges, incomingNodes, outgoingNodes };
  }, [board]);

  const activeInNodes = hoveredNodeId ? incomingNodes.get(hoveredNodeId) ?? new Set() : new Set();
  const activeOutNodes = hoveredNodeId ? outgoingNodes.get(hoveredNodeId) ?? new Set() : new Set();
  const activeInEdges = hoveredNodeId ? incomingEdges.get(hoveredNodeId) ?? new Set() : new Set();
  const activeOutEdges = hoveredNodeId ? outgoingEdges.get(hoveredNodeId) ?? new Set() : new Set();

  const content = (
    <div className={`schematic-container ${isModal ? "schematic-container--modal" : ""}`}>
      {/* Header / Controls */}
      <div className="schematic-toolbar">
        <div className="schematic-toolbar__info">
          <h3 className="schematic-title">Interactive DAG Dependency Graph</h3>
          <span className="schematic-subtitle mono">
            {board.tasks.length} nodes · {board.dependencies.length} edges · {layersCount} sequential execution tiers
          </span>
        </div>

        <div className="schematic-toolbar__controls">
          <button
            className={`btn btn--small ${highlightCriticalOnly ? "btn--solid" : "btn--ghost"}`}
            onClick={() => setHighlightCriticalOnly((prev) => !prev)}
          >
            ⚡ Highlight Critical Path ({criticalPath.length})
          </button>
          {isModal && onClose && (
            <button className="btn btn--ghost btn--small" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>

      {/* Legend & Instructions */}
      <div className="schematic-legend-bar">
        <div className="schematic-legend-items">
          <span className="legend-chip">
            <span className="legend-line legend-line--critical"></span> Critical Path (Longest chain)
          </span>
          <span className="legend-chip">
            <span className="legend-line legend-line--regular"></span> Dependency (Prerequisite → Next)
          </span>
          <span className="legend-chip legend-chip--hover">
            <span className="legend-dot legend-dot--prereq"></span> Prerequisite (Upstream)
          </span>
          <span className="legend-chip legend-chip--hover">
            <span className="legend-dot legend-dot--dependent"></span> Dependent (Downstream)
          </span>
        </div>
        <div className="schematic-tip mono">
          💡 Hover a card to trace its upstream & downstream paths. Click card to edit.
        </div>
      </div>

      {/* Interactive SVG Canvas */}
      <div className="schematic-viewport">
        {board.tasks.length === 0 ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "360px",
              color: "var(--text-secondary)",
              textAlign: "center",
              padding: "48px 24px",
            }}
          >
            <div style={{ fontSize: "2.5rem", marginBottom: "12px" }}>🕸️</div>
            <h4 style={{ color: "var(--text-primary)", margin: "0 0 6px 0", fontSize: "16px" }}>
              Dependency graph is empty
            </h4>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", maxWidth: "420px", margin: 0 }}>
              Create tasks and link prerequisites to visualize your DAG execution graph, converging paths, and critical path here.
            </p>
          </div>
        ) : (
          <svg width={width} height={height} className="schematic-svg">
          <defs>
            {/* Standard arrowhead */}
            <marker
              id="arrow-regular"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="rgba(148, 163, 184, 0.6)" />
            </marker>

            {/* Critical path arrowhead */}
            <marker
              id="arrow-critical"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="var(--status-critical)" />
            </marker>

            {/* Inbound hover arrowhead (Cyan) */}
            <marker
              id="arrow-inbound"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#38BDF8" />
            </marker>

            {/* Outbound hover arrowhead (Purple) */}
            <marker
              id="arrow-outbound"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 9 5 L 0 9 z" fill="#C084FC" />
            </marker>

            {/* Glow filter for critical path */}
            <filter id="critical-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="rgba(251, 191, 36, 0.6)" />
            </filter>
          </defs>

          {/* Dependency Edge Connections */}
          <g className="schematic-edges-layer">
            {board.dependencies.map((dependency) => {
              const from = positions.get(dependency.prerequisite_id);
              const to = positions.get(dependency.task_id);
              if (!from || !to) return null;

              const startX = from.x + NODE_W;
              const startY = from.y + NODE_H / 2;
              const endX = to.x;
              const endY = to.y + NODE_H / 2;

              // Smooth Cubic Bezier Curve
              const dx = endX - startX;
              const cp1X = startX + Math.max(dx * 0.45, 30);
              const cp1Y = startY;
              const cp2X = endX - Math.max(dx * 0.45, 30);
              const cp2Y = endY;

              const edgeKey = `${dependency.task_id}:${dependency.prerequisite_id}`;
              const isCritical = criticalEdges.has(edgeKey);
              const isInboundHover = activeInEdges.has(edgeKey);
              const isOutboundHover = activeOutEdges.has(edgeKey);

              let stroke = "rgba(148, 163, 184, 0.35)";
              let strokeWidth = 1.8;
              let markerEnd = "url(#arrow-regular)";
              let opacity = 1;

              if (isInboundHover) {
                stroke = "#38BDF8";
                strokeWidth = 2.8;
                markerEnd = "url(#arrow-inbound)";
              } else if (isOutboundHover) {
                stroke = "#C084FC";
                strokeWidth = 2.8;
                markerEnd = "url(#arrow-outbound)";
              } else if (isCritical) {
                stroke = "var(--status-critical)";
                strokeWidth = 2.6;
                markerEnd = "url(#arrow-critical)";
              } else if (hoveredNodeId || highlightCriticalOnly) {
                opacity = 0.15;
              }

              return (
                <path
                  key={dependency.id}
                  d={`M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isCritical ? "none" : undefined}
                  markerEnd={markerEnd}
                  opacity={opacity}
                  style={{
                    transition: "stroke 0.2s ease, opacity 0.2s ease, stroke-width 0.2s ease",
                  }}
                />
              );
            })}
          </g>

          {/* Node Cards */}
          <g className="schematic-nodes-layer">
            {board.tasks.map((task) => {
              const position = positions.get(task.id);
              if (!position) return null;

              const isHovered = hoveredNodeId === task.id;
              const isPrereq = activeInNodes.has(task.id);
              const isDependent = activeOutNodes.has(task.id);
              const isCritical = criticalIds.has(task.id);

              let nodeOpacity = 1;
              if (hoveredNodeId && !isHovered && !isPrereq && !isDependent) {
                nodeOpacity = 0.25;
              } else if (highlightCriticalOnly && !isCritical) {
                nodeOpacity = 0.25;
              }

              const statusColor =
                task.status === "done"
                  ? "var(--status-done)"
                  : task.status === "blocked"
                  ? "var(--status-blocked)"
                  : "var(--status-ready)";

              let strokeColor = "var(--border-subtle)";
              let strokeWidth = 1.2;
              let filter = undefined;

              if (isHovered) {
                strokeColor = "#FFFFFF";
                strokeWidth = 2.2;
              } else if (isPrereq) {
                strokeColor = "#38BDF8";
                strokeWidth = 2;
              } else if (isDependent) {
                strokeColor = "#C084FC";
                strokeWidth = 2;
              } else if (isCritical) {
                strokeColor = "var(--status-critical)";
                strokeWidth = 1.8;
                filter = "url(#critical-glow)";
              }

              return (
                <g
                  key={task.id}
                  transform={`translate(${position.x}, ${position.y})`}
                  className="schematic-node-group"
                  onMouseEnter={() => setHoveredNodeId(task.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onClick={() => onOpenTask && onOpenTask(task)}
                  opacity={nodeOpacity}
                  style={{
                    cursor: "pointer",
                    transition: "opacity 0.2s ease, transform 0.2s ease",
                  }}
                >
                  {/* Card Background */}
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    fill="var(--bg-card)"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    rx={8}
                    filter={filter}
                  />

                  {/* Left Status Bar */}
                  <rect
                    width={5}
                    height={NODE_H}
                    fill={statusColor}
                    rx={3}
                  />

                  {/* Status Indicator Tag */}
                  <rect
                    x={14}
                    y={10}
                    width={task.status === "blocked" ? 54 : task.status === "ready" ? 48 : 44}
                    height={16}
                    rx={4}
                    fill={
                      task.status === "done"
                        ? "var(--status-done-bg)"
                        : task.status === "blocked"
                        ? "var(--status-blocked-bg)"
                        : "var(--status-ready-bg)"
                    }
                  />
                  <text
                    x={18}
                    y={22}
                    fill={statusColor}
                    fontSize={10}
                    fontWeight={600}
                    fontFamily="var(--font-mono)"
                  >
                    {task.status.toUpperCase()}
                  </text>

                  {/* Task ID Pill */}
                  <text
                    x={NODE_W - 12}
                    y={22}
                    textAnchor="end"
                    fill="var(--text-muted)"
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                  >
                    #{task.id.slice(0, 8)}
                  </text>

                  {/* Task Title */}
                  <text
                    x={14}
                    y={42}
                    fill="var(--text-primary)"
                    fontSize={12.5}
                    fontWeight={600}
                    fontFamily="var(--font-main)"
                  >
                    {task.title.length > 22
                      ? `${task.title.slice(0, 21)}…`
                      : task.title}
                  </text>

                  {/* Schedule Footer */}
                  <text
                    x={14}
                    y={59}
                    fill="var(--text-secondary)"
                    fontSize={10.5}
                    fontFamily="var(--font-mono)"
                  >
                    Day {task.start_date} → {task.end_date}
                  </text>
                  <text
                    x={NODE_W - 12}
                    y={59}
                    textAnchor="end"
                    fill="var(--text-muted)"
                    fontSize={10.5}
                    fontFamily="var(--font-mono)"
                  >
                    {task.duration_days}d
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        )}
      </div>
    </div>
  );

  if (!isModal) {
    return content;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--full"
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </div>
    </div>
  );
}
