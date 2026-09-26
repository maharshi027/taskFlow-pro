export default function Toast({ toast, onDismiss }) {
  if (!toast) return null;

  // toast can be string or object { message, type }
  const message = typeof toast === "string" ? toast : toast.message;
  const type = (typeof toast === "object" && toast.type) || "error";

  const icons = {
    error: "⛔",
    warning: "⚠️",
    success: "✓",
    info: "ℹ️",
  };

  return (
    <div className={`toast toast--${type}`} role="alert">
      <span className="toast__icon">{icons[type] || "•"}</span>
      <div className="toast__content">
        <p className="toast__message">{message}</p>
      </div>
      <button
        className="toast__close"
        onClick={onDismiss}
        aria-label="Dismiss alert"
      >
        ✕
      </button>
    </div>
  );
}
