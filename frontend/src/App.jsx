import { useEffect, useState, useCallback } from "react";
import "./theme.css";
import "./app.css";
import { api, ApiError } from "./api.js";
import TitleBlock from "./components/TitleBlock.jsx";
import Board from "./components/Board.jsx";
import TaskModal from "./components/TaskModal.jsx";
import SchematicView from "./components/SchematicView.jsx";
import Toast from "./components/Toast.jsx";

export default function App() {
  const [board, setBoard] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [modalTask, setModalTask] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [schematicOpen, setSchematicOpen] = useState(false);
  const [criticalPath, setCriticalPath] = useState([]);
  const [toast, setToast] = useState(null);

  const showError = useCallback((message) => {
    setToast(message);
    window.setTimeout(
      () => setToast((current) => (current === message ? null : current)),
      5000,
    );
  }, []);

  const refresh = useCallback(async () => {
    try {
      const nextBoard = await api.getBoard();
      setBoard(nextBoard);
      setLoadError(null);
      if (nextBoard.tasks.length > 0) {
        const critical = await api.getCriticalPath();
        setCriticalPath(critical.path);
      }
    } catch (error) {
      setLoadError(
        error instanceof ApiError ? error.message : "Couldn't load the board.",
      );
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function handleMoveTask(taskId, column, position) {
    if (!board) return;
    const previous = board;
    setBoard({
      ...board,
      tasks: board.tasks.map((task) =>
        task.id === taskId ? { ...task, column, position } : task,
      ),
    });
    try {
      const updated = await api.moveTask(taskId, column, position);
      setBoard(updated);
      const critical = await api.getCriticalPath();
      setCriticalPath(critical.path);
    } catch (error) {
      setBoard(previous);
      showError(
        error instanceof ApiError ? error.message : "Couldn't move that task.",
      );
    }
  }

  function handleBoardUpdate(updated) {
    setBoard(updated);
    api
      .getCriticalPath()
      .then((critical) => setCriticalPath(critical.path))
      .catch(() => undefined);
  }

  if (loadError && !board) {
    return (
      <div className="load-error">
        <div className="load-error__panel">
          <p className="mono">connection error</p>
          <h2>{loadError}</h2>
          <p>
            Start the backend with <code className="mono">npm run dev</code> in{" "}
            <code className="mono">backend/</code>, then reload this page.
          </p>
          <button className="btn btn--solid" onClick={refresh}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="load-error">
        <p className="mono">loading board...</p>
      </div>
    );
  }

  const criticalPathIds = new Set(criticalPath);
  return (
    <div className="app-shell">
      <TitleBlock
        tasks={board.tasks}
        onNewTask={() => {
          setModalTask(null);
          setModalOpen(true);
        }}
        onOpenSchematic={() => setSchematicOpen(true)}
      />
      <main>
        <Board
          board={board}
          criticalPathIds={criticalPathIds}
          onOpenTask={(task) => {
            setModalTask(task);
            setModalOpen(true);
          }}
          onMoveTask={handleMoveTask}
        />
      </main>
      {modalOpen && (
        <TaskModal
          board={board}
          task={modalTask}
          onClose={() => setModalOpen(false)}
          onBoardUpdate={handleBoardUpdate}
          onError={showError}
        />
      )}
      {schematicOpen && (
        <SchematicView
          board={board}
          criticalPath={criticalPath}
          onClose={() => setSchematicOpen(false)}
        />
      )}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}
    </div>
  );
}
