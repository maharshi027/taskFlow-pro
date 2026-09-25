import { useDraggable } from "@dnd-kit/core";

const STATUS_LABEL = { blocked: "blocked", ready: "ready", done: "done" };
const STATUS_VAR = {
  blocked: "var(--signal-red)",
  ready: "var(--signal-amber)",
  done: "var(--signal-teal)",
};

export default function TaskCard({
  task,
  prereqTitles,
  isCriticalPath,
  onOpen,
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: task.id, data: { task } });
  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 20 }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`node-card${isDragging ? " node-card--dragging" : ""}${isCriticalPath ? " node-card--critical" : ""}`}
      {...listeners}
      {...attributes}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter") onOpen();
      }}
    >
      <span
        className="node-card__corner node-card__corner--tl"
        aria-hidden="true"
      />
      <span
        className="node-card__corner node-card__corner--br"
        aria-hidden="true"
      />
      <div
        className="node-card__bar"
        style={{ background: STATUS_VAR[task.status] }}
      />
      <div className="node-card__body">
        <div className="node-card__top">
          <span
            className="node-card__status mono"
            style={{ color: STATUS_VAR[task.status] }}
          >
            {STATUS_LABEL[task.status]}
          </span>
          <span className="node-card__id mono">#{task.id.slice(0, 6)}</span>
        </div>
        <h3 className="node-card__title">{task.title}</h3>
        <div className="node-card__dates mono">
          day {task.start_date} -&gt; {task.end_date}
          <span className="node-card__duration"> · {task.duration_days}d</span>
        </div>
        {prereqTitles.length > 0 && (
          <ul className="node-card__deps">
            {prereqTitles.slice(0, 3).map((title, index) => (
              <li key={index} className="mono">
                -&gt; {title}
              </li>
            ))}
            {prereqTitles.length > 3 && (
              <li className="mono">-&gt; +{prereqTitles.length - 3} more</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
