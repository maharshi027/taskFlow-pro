import { useState } from "react";
import { api, ApiError } from "../api.js";

export default function TaskModal({
  board,
  task,
  onClose,
  onBoardUpdate,
  onError,
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [plannedStart, setPlannedStart] = useState(task?.planned_start ?? 0);
  const [durationDays, setDurationDays] = useState(task?.duration_days ?? 1);
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const isNew = task === null;
  const titleById = new Map(board.tasks.map((item) => [item.id, item]));
  const myDeps = task
    ? board.dependencies.filter((dependency) => dependency.task_id === task.id)
    : [];
  const dependents = task
    ? board.dependencies.filter(
        (dependency) => dependency.prerequisite_id === task.id,
      )
    : [];
  const availablePrereqs = task
    ? board.tasks.filter(
        (item) =>
          item.id !== task.id &&
          !myDeps.some((dependency) => dependency.prerequisite_id === item.id),
      )
    : [];

  async function handleSave() {
    if (!title.trim()) {
      onError("Give the task a title before saving.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description,
        planned_start: plannedStart,
        duration_days: durationDays,
      };
      const updated = isNew
        ? await api.createTask(payload)
        : await api.updateTask(task.id, payload);
      onBoardUpdate(updated);
      onClose();
    } catch (error) {
      onError(
        error instanceof ApiError ? error.message : "Couldn't save the task.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    if (dependents.length > 0) {
      onError(
        `Can't delete: ${dependents.length} task(s) still depend on this one. Remove those dependencies first.`,
      );
      return;
    }
    setSaving(true);
    try {
      onBoardUpdate(await api.deleteTask(task.id));
      onClose();
    } catch (error) {
      onError(
        error instanceof ApiError ? error.message : "Couldn't delete the task.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDependency(prereqId) {
    if (!task) return;
    try {
      onBoardUpdate(await api.createDependency(task.id, prereqId));
      setPickerOpen(false);
    } catch (error) {
      onError(
        error instanceof ApiError ? error.message : "Couldn't add dependency.",
      );
    }
  }

  async function handleRemoveDependency(prereqId) {
    if (!task) return;
    try {
      onBoardUpdate(await api.deleteDependency(task.id, prereqId));
    } catch (error) {
      onError(
        error instanceof ApiError
          ? error.message
          : "Couldn't remove dependency.",
      );
    }
  }

  async function handleSuggest() {
    if (!task) return;
    setLoadingSuggestions(true);
    try {
      const results = await api.suggestDependencies(task.id);
      setSuggestions(
        results.filter((suggestion) => suggestion.state === "pending"),
      );
      if (results.length === 0)
        onError("No confident suggestions found for this task.");
    } catch (error) {
      onError(
        error instanceof ApiError
          ? error.message
          : "AI suggestions are unavailable right now.",
      );
    } finally {
      setLoadingSuggestions(false);
    }
  }

  async function handleDecide(suggestionId, accept) {
    try {
      onBoardUpdate(await api.decideSuggestion(suggestionId, accept));
      setSuggestions((current) =>
        current.filter((suggestion) => suggestion.id !== suggestionId),
      );
    } catch (error) {
      onError(
        error instanceof ApiError
          ? error.message
          : "Couldn't record that decision.",
      );
      setSuggestions((current) =>
        current.filter((suggestion) => suggestion.id !== suggestionId),
      );
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <span className="mono modal__eyebrow">
            {isNew ? "new node" : `node #${task.id.slice(0, 6)}`}
          </span>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <label className="field">
          <span>Title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Build backend API"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="What this task involves - the AI suggester reads this."
          />
        </label>
        <div className="field-row">
          <label className="field">
            <span>Planned start (day)</span>
            <input
              type="number"
              min={0}
              value={plannedStart}
              onChange={(event) => setPlannedStart(Number(event.target.value))}
            />
          </label>
          <label className="field">
            <span>Duration (days)</span>
            <input
              type="number"
              min={1}
              value={durationDays}
              onChange={(event) => setDurationDays(Number(event.target.value))}
            />
          </label>
        </div>
        {task && (
          <div className="mono computed-dates">
            computed schedule: day {task.start_date} -&gt; {task.end_date}
          </div>
        )}
        {!isNew && (
          <div className="deps-section">
            <div className="deps-section__header">
              <h4>Prerequisites</h4>
              <button
                className="btn btn--ghost btn--small"
                onClick={() => setPickerOpen((value) => !value)}
              >
                + Add
              </button>
            </div>
            {myDeps.length === 0 && <p className="mono empty-note">none set</p>}
            <ul className="deps-list">
              {myDeps.map((dependency) => (
                <li key={dependency.id}>
                  <span>
                    {titleById.get(dependency.prerequisite_id)?.title ??
                      dependency.prerequisite_id}
                  </span>
                  <button
                    className="link-btn"
                    onClick={() =>
                      handleRemoveDependency(dependency.prerequisite_id)
                    }
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
            {pickerOpen && (
              <div className="picker">
                {availablePrereqs.length === 0 && (
                  <p className="mono empty-note">no other tasks available</p>
                )}
                {availablePrereqs.map((item) => (
                  <button
                    key={item.id}
                    className="picker__item"
                    onClick={() => handleAddDependency(item.id)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            )}
            <div className="ai-suggest">
              <button
                className="btn btn--ghost btn--small"
                onClick={handleSuggest}
                disabled={loadingSuggestions}
              >
                {loadingSuggestions ? "Analyzing..." : "Suggest dependencies"}
              </button>
              {suggestions.length > 0 && (
                <ul className="suggestion-list">
                  {suggestions.map((suggestion) => (
                    <li key={suggestion.id} className="suggestion-item">
                      <div className="suggestion-item__top">
                        <span>
                          {titleById.get(suggestion.prerequisite_id)?.title ??
                            suggestion.prerequisite_id}
                        </span>
                        <span className="mono suggestion-item__confidence">
                          {suggestion.confidence}%
                        </span>
                      </div>
                      <div className="confidence-gauge">
                        <div
                          className="confidence-gauge__fill"
                          style={{ width: `${suggestion.confidence}%` }}
                        />
                      </div>
                      <p className="suggestion-item__reason">
                        {suggestion.reason}
                      </p>
                      <div className="suggestion-item__actions">
                        <button
                          className="btn btn--tiny btn--solid"
                          onClick={() => handleDecide(suggestion.id, true)}
                        >
                          Accept
                        </button>
                        <button
                          className="btn btn--tiny btn--ghost"
                          onClick={() => handleDecide(suggestion.id, false)}
                        >
                          Reject
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
        <div className="modal__footer">
          {!isNew && (
            <button
              className="btn btn--ghost btn--danger"
              onClick={handleDelete}
              disabled={saving}
            >
              Delete task
            </button>
          )}
          <div className="modal__footer-right">
            <button
              className="btn btn--ghost"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              className="btn btn--solid"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : isNew ? "Create task" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
