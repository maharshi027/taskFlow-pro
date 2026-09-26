import { useEffect, useState, useCallback, useMemo } from "react";
import "./theme.css";
import "./app.css";
import { api, ApiError } from "./api.js";
import TitleBlock from "./components/TitleBlock.jsx";
import Board from "./components/Board.jsx";
import TaskModal from "./components/TaskModal.jsx";
import SchematicView from "./components/SchematicView.jsx";
import TimelineView from "./components/TimelineView.jsx";
import Toast from "./components/Toast.jsx";

export default function App() {
  const [board, setBoard] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [modalTask, setModalTask] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeView, setActiveView] = useState("board"); // "board" | "schematic" | "timeline"
  const [criticalPath, setCriticalPath] = useState([]);
  const [criticalDuration, setCriticalDuration] = useState(0);
  const [toast, setToast] = useState(null);
  const [filterQuery, setFilterQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isResetting, setIsResetting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // null | 'clear' | 'reset'

  const showToast = useCallback((message, type = "error") => {
    setToast({ message, type });
    window.setTimeout(() => {
      setToast((current) => (current && current.message === message ? null : current));
    }, 5500);
  }, []);

  const refreshCriticalPath = useCallback(async () => {
    try {
      const res = await api.getCriticalPath();
      setCriticalPath(res.path || []);
      setCriticalDuration(res.total_duration_days || 0);
    } catch {
      // critical path fetch failure shouldn't break the board
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const nextBoard = await api.getBoard();
      setBoard(nextBoard);
      setLoadError(null);
      if (nextBoard.tasks.length > 0) {
        await refreshCriticalPath();
      }
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : "Couldn't load the board.",
      );
    }
  }, [refreshCriticalPath]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleMoveTask(taskId, targetColumn, position) {
    if (!board) return;
    const task = board.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const previousBoard = board;
    const wasDone = task.column === "done";
    const isMovingAwayFromDone = wasDone && targetColumn !== "done";

    // Optimistic UI update
    setBoard({
      ...board,
      tasks: board.tasks.map((item) =>
        item.id === taskId ? { ...item, column: targetColumn, position } : item,
      ),
    });

    try {
      const updated = await api.moveTask(taskId, targetColumn, position);
      setBoard(updated);
      await refreshCriticalPath();

      if (isMovingAwayFromDone) {
        showToast(
          `🔄 Rollback Cascade: "${task.title}" was moved back from Done. Affected downstream tasks have been re-blocked automatically.`,
          "info",
        );
      }
    } catch (error) {
      // Revert optimistic update
      setBoard(previousBoard);
      const msg = error instanceof ApiError ? error.message : "Couldn't move that task.";
      showToast(msg, "warning");
    }
  }

  function handleBoardUpdate(updated) {
    setBoard(updated);
    refreshCriticalPath();
  }

  async function executeClearBoard() {
    setIsClearing(true);
    setConfirmAction(null);
    try {
      const res = await api.clearBoard();
      setBoard(res);
      setCriticalPath([]);
      setCriticalDuration(0);
      showToast(
        "✓ All tasks cleared! Fresh blank canvas ready for your production project.",
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Failed to clear board.",
        "error",
      );
    } finally {
      setIsClearing(false);
    }
  }

  async function executeResetSeed() {
    setIsResetting(true);
    setConfirmAction(null);
    try {
      const res = await api.resetSeed();
      setBoard(res);
      await refreshCriticalPath();
      showToast(
        "✓ Loaded 9 benchmark tasks & dependencies (Diamond DAG workflow).",
        "success",
      );
    } catch (err) {
      showToast(
        err instanceof ApiError ? err.message : "Failed to load demo board.",
        "error",
      );
    } finally {
      setIsResetting(false);
    }
  }

  const criticalPathIds = useMemo(() => new Set(criticalPath), [criticalPath]);

  if (loadError && !board) {
    return (
      <div className="load-error">
        <div className="load-error__panel">
          <span className="mono load-error__tag">CONNECTION ERROR</span>
          <h2>Cannot Connect to API</h2>
          <p>{loadError}</p>
          <p className="load-error__sub">
            Ensure the backend server is running on <code className="mono">http://localhost:8000</code>.
          </p>
          <button className="btn btn--primary" onClick={refresh}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="load-error">
        <div className="loading-spinner-wrap">
          <div className="loading-spinner" />
          <p className="mono">Initializing TaskFlow Pro DAG Engine...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* Top Navbar */}
      <TitleBlock
        tasks={board.tasks}
        criticalPathDuration={criticalDuration}
        activeView={activeView}
        onViewChange={setActiveView}
        filterQuery={filterQuery}
        onFilterQueryChange={setFilterQuery}
        filterStatus={filterStatus}
        onFilterStatusChange={setFilterStatus}
        onNewTask={() => {
          setModalTask(null);
          setModalOpen(true);
        }}
        onResetSeed={() => setConfirmAction("reset")}
        isResetting={isResetting}
        onClearBoard={() => setConfirmAction("clear")}
        isClearing={isClearing}
      />

      {/* Main View Area */}
      <main className="app-main">
        {activeView === "board" && (
          <Board
            board={board}
            criticalPathIds={criticalPathIds}
            onOpenTask={(task) => {
              setModalTask(task);
              setModalOpen(true);
            }}
            onMoveTask={handleMoveTask}
            filterQuery={filterQuery}
            filterStatus={filterStatus}
          />
        )}

        {activeView === "schematic" && (
          <SchematicView
            board={board}
            criticalPath={criticalPath}
            onOpenTask={(task) => {
              setModalTask(task);
              setModalOpen(true);
            }}
            isModal={false}
          />
        )}

        {activeView === "timeline" && (
          <TimelineView
            board={board}
            criticalPath={criticalPath}
            onOpenTask={(task) => {
              setModalTask(task);
              setModalOpen(true);
            }}
          />
        )}
      </main>

      {/* Task Creation / Edit Modal */}
      {modalOpen && (
        <TaskModal
          board={board}
          task={modalTask}
          onClose={() => setModalOpen(false)}
          onBoardUpdate={handleBoardUpdate}
          onError={(msg) => showToast(msg, "error")}
        />
      )}

      {/* In-App Confirmation Modal (Replaces browser window.confirm) */}
      {confirmAction && (
        <div className="modal-backdrop" onClick={() => setConfirmAction(null)}>
          <div className="modal modal--small" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <h3 className="modal__title">
                {confirmAction === "clear"
                  ? "🧹 Start Fresh Production Project?"
                  : "🔄 Load Demo Workflow Benchmark?"}
              </h3>
              <button
                className="modal__close"
                onClick={() => setConfirmAction(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="modal__body" style={{ padding: "20px 24px" }}>
              <p
                style={{
                  margin: 0,
                  fontSize: "13.5px",
                  color: "var(--text-secondary)",
                  lineHeight: 1.5,
                }}
              >
                {confirmAction === "clear"
                  ? "This will delete all temporary demo tasks, dependencies, and suggestions. Your board will be completely empty and ready for your real production project."
                  : "This will load the standard 9-task diamond dependency workflow benchmark (replacing current tasks)."}
              </p>
            </div>
            <div className="modal__footer">
              <button
                className="btn btn--ghost"
                onClick={() => setConfirmAction(null)}
                disabled={isClearing || isResetting}
              >
                Cancel
              </button>
              <button
                className={`btn ${confirmAction === "clear" ? "btn--danger" : "btn--solid"}`}
                onClick={confirmAction === "clear" ? executeClearBoard : executeResetSeed}
                disabled={isClearing || isResetting}
              >
                {confirmAction === "clear"
                  ? isClearing
                    ? "Clearing..."
                    : "Yes, Clear All Data"
                  : isResetting
                  ? "Loading..."
                  : "Yes, Load Demo Data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      {toast && <Toast toast={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
