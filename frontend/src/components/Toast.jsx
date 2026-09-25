export default function Toast({ message, onDismiss }) {
  return (
    <div className="toast" role="alert">
      <span className="toast__mark mono">!</span>
      <p>{message}</p>
      <button onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
