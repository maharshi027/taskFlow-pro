import { useState, useMemo } from "react";
import { api, ApiError } from "../api.js";

export default function TaskModal({
  board,
  task,
  onClose,
  onBoardUpdate,
  onError,
}) {
  const isNew = task === null;
  const [activeTab, setActiveTab] = useState("details");

  // Form fields
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [column, setColumn] = useState(task?.column ?? "backlog");
  const [plannedStart, setPlannedStart] = useState(task?.planned_start ?? 0);
  const [durationDays, setDurationDays] = useState(task?.duration_days ?? 1);
  const [saving, setSaving] = useState(false);

  // AI Suggestions
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [aiMessage, setAiMessage] = useState(null);

  // Prerequisite Picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");

  const titleById = useMemo(
    () => new Map(board.tasks.map((item) => [item.id, item])),
    [board.tasks],
  );

  // Upstream dependencies (Prerequisites of this task)
  const myDeps = useMemo(() => {
    if (!task) return [];
    return board.dependencies
      .filter((dep) => dep.task_id === task.id)
      .map((dep) => ({
        depId: dep.id,
        prereqId: dep.prerequisite_id,
        prereqTask: titleById.get(dep.prerequisite_id),
      }));
  }, [board.dependencies, task, titleById]);

  // Downstream dependencies (Tasks that depend on this task)
  const dependents = useMemo(() => {
    if (!task) return [];
    return board.dependencies
      .filter((dep) => dep.prerequisite_id === task.id)
      .map((dep) => ({
        depId: dep.id,
        taskId: dep.task_id,
        dependentTask: titleById.get(dep.task_id),
      }));
  }, [board.dependencies, task, titleById]);

  // Available prerequisites for picker (excluding self and already existing)
  const availablePrereqs = useMemo(() => {
    if (!task) return [];
    const currentPrereqIds = new Set(myDeps.map((d) => d.prereqId));
    let candidates = board.tasks.filter(
      (item) => item.id !== task.id && !currentPrereqIds.has(item.id),
    );
    if (pickerSearch.trim()) {
      const q = pickerSearch.toLowerCase().trim();
      candidates = candidates.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q),
      );
    }
    return candidates;
  }, [board.tasks, task, myDeps, pickerSearch]);

  // Pre-flight check to see if adding candidateId as prerequisite would create a cycle
  function wouldCauseCycle(candidateId) {
    if (!task) return false;
    if (candidateId === task.id) return true;
    const visited = new Set();
    const stack = [task.id];
    while (stack.length) {
      const curr = stack.pop();
      if (curr === candidateId) return true;
      if (visited.has(curr)) continue;
      visited.add(curr);
      for (const dep of board.dependencies) {
        if (dep.prerequisite_id === curr && !visited.has(dep.task_id)) {
          stack.push(dep.task_id);
        }
      }
    }
    return false;
  }

  // Computed schedule preview
  const computedPreview = useMemo(() => {
    if (!task) return null;
    const prereqEnds = myDeps
      .map((d) => d.prereqTask?.end_date)
      .filter((v) => v !== undefined);
    const earliestFromPrereqs = prereqEnds.length > 0 ? Math.max(...prereqEnds) + 1 : 0;
    const estimatedStart = Math.max(plannedStart, earliestFromPrereqs);
    const estimatedEnd = estimatedStart + Math.max(durationDays, 1);
    return { estimatedStart, estimatedEnd, earliestFromPrereqs };
  }, [task, myDeps, plannedStart, durationDays]);

  async function handleSave() {
    if (!title.trim()) {
      onError("Task title cannot be empty.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        planned_start: Number(plannedStart) || 0,
        duration_days: Math.max(1, Number(durationDays) || 1),
      };
      if (isNew) {
        payload.column = column;
      }
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
        `Cannot delete "${task.title}": ${dependents.length} downstream task(s) depend on it. Remove those dependencies first.`,
      );
      return;
    }
    if (
      !window.confirm(
        `Are you sure you want to delete "${task.title}"? This cannot be undone.`,
      )
    ) {
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
      setPickerSearch("");
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
        error instanceof ApiError ? error.message : "Couldn't remove dependency.",
      );
    }
  }

  async function handleSuggest() {
    if (!task) return;
    setLoadingSuggestions(true);
    setAiMessage(null);
    try {
      const results = await api.suggestDependencies(task.id);
      const pending = results.filter((s) => s.state === "pending");
      setSuggestions(pending);
      if (pending.length === 0) {
        setAiMessage("No candidate prerequisites found for this task.");
      }
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
        current.filter((s) => s.id !== suggestionId),
      );
    } catch (error) {
      onError(
        error instanceof ApiError
          ? error.message
          : "Couldn't record decision.",
      );
      setSuggestions((current) =>
        current.filter((s) => s.id !== suggestionId),
      );
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal--enhanced" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="modal__header">
          <div className="modal__header-title-group">
            <span className="mono modal__eyebrow">
              {isNew ? "✨ NEW TASK" : `TASK #${task.id.slice(0, 8)}`}
            </span>
            <h2 className="modal__title">
              {isNew ? "Create Workflow Task" : task.title}
            </h2>
          </div>
          <button className="modal__close" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="modal-tabs">
          <button
            className={`modal-tab ${activeTab === "details" ? "modal-tab--active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            📋 Task Details
          </button>
          {!isNew && (
            <button
              className={`modal-tab ${activeTab === "deps" ? "modal-tab--active" : ""}`}
              onClick={() => setActiveTab("deps")}
            >
              🔗 Dependencies ({myDeps.length} Upstream / {dependents.length} Downstream)
            </button>
          )}
          {!isNew && (
            <button
              className={`modal-tab ${activeTab === "ai" ? "modal-tab--active" : ""}`}
              onClick={() => setActiveTab("ai")}
            >
              ✨ AI Assistant {suggestions.length > 0 && `(${suggestions.length})`}
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="modal__body">
          {/* TAB 1: DETAILS */}
          {activeTab === "details" && (
            <div className="tab-pane">
              <label className="field">
                <span className="field__label">Task Title <span className="req">*</span></span>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Build backend API endpoints"
                  autoFocus
                  className="field__input"
                />
              </label>

              <label className="field">
                <span className="field__label">Description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="Describe scope, requirements, deliverables — this context is used by the AI dependency suggester."
                  className="field__textarea"
                />
              </label>

              {isNew && (
                <label className="field">
                  <span className="field__label">Initial Column</span>
                  <select
                    value={column}
                    onChange={(e) => setColumn(e.target.value)}
                    className="field__select mono"
                  >
                    <option value="backlog">Backlog</option>
                    <option value="in_progress">In Progress</option>
                    <option value="review">Review</option>
                    <option value="done">Done</option>
                  </select>
                </label>
              )}

              <div className="field-row">
                <label className="field">
                  <span className="field__label">Planned Start (Day)</span>
                  <input
                    type="number"
                    min={0}
                    value={plannedStart}
                    onChange={(e) => setPlannedStart(Number(e.target.value))}
                    className="field__input mono"
                  />
                  <span className="field__hint">Earliest preferred start day</span>
                </label>

                <label className="field">
                  <span className="field__label">Duration (Days)</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={durationDays}
                    onChange={(e) => setDurationDays(Number(e.target.value))}
                    className="field__input mono"
                  />
                  <span className="field__hint">Calendar working days</span>
                </label>
              </div>

              {/* Live Schedule Calculation Box */}
              {computedPreview && (
                <div className="schedule-preview-box">
                  <div className="schedule-preview-header">
                    <span className="schedule-preview-icon">📅</span>
                    <span className="schedule-preview-title">DAG Computed Schedule</span>
                  </div>
                  <div className="schedule-preview-content">
                    <div className="schedule-stat">
                      <span className="schedule-stat__label">Start Date:</span>
                      <span className="schedule-stat__val mono">Day {computedPreview.estimatedStart}</span>
                    </div>
                    <div className="schedule-stat">
                      <span className="schedule-stat__label">End Date:</span>
                      <span className="schedule-stat__val mono">Day {computedPreview.estimatedEnd}</span>
                    </div>
                    <div className="schedule-stat">
                      <span className="schedule-stat__label">Total Duration:</span>
                      <span className="schedule-stat__val mono">{durationDays}d</span>
                    </div>
                  </div>
                  <p className="schedule-preview-note">
                    {computedPreview.earliestFromPrereqs > plannedStart ? (
                      <>
                        ⚠️ Constrained by prerequisites: latest prerequisite finishes on Day{" "}
                        {computedPreview.earliestFromPrereqs - 1}, pushing start to Day{" "}
                        {computedPreview.estimatedStart}.
                      </>
                    ) : (
                      <>
                        ✓ Start date is determined by planned start (Day {plannedStart}). All prerequisites complete prior.
                      </>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DEPENDENCIES */}
          {activeTab === "deps" && (
            <div className="tab-pane">
              {/* Upstream Prerequisites Section */}
              <div className="deps-block">
                <div className="deps-block__header">
                  <div>
                    <h4 className="deps-block__title">Prerequisites (Upstream)</h4>
                    <p className="deps-block__sub">
                      Tasks that MUST be completed before this task can become Ready.
                    </p>
                  </div>
                  <button
                    className="btn btn--small btn--primary"
                    onClick={() => setPickerOpen((prev) => !prev)}
                  >
                    {pickerOpen ? "Close Picker" : "+ Add Prerequisite"}
                  </button>
                </div>

                {/* Add Prerequisite Picker Drawer */}
                {pickerOpen && (
                  <div className="prereq-picker-card">
                    <div className="picker-search-bar">
                      <input
                        type="text"
                        placeholder="Search candidate tasks..."
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        className="field__input picker-input"
                        autoFocus
                      />
                    </div>
                    <div className="picker-list">
                      {availablePrereqs.length === 0 ? (
                        <p className="picker-empty mono">No available tasks to add as prerequisite.</p>
                      ) : (
                        availablePrereqs.map((cand) => {
                          const causesCycle = wouldCauseCycle(cand.id);
                          return (
                            <div key={cand.id} className="picker-row">
                              <div className="picker-row__info">
                                <span className="picker-row__title">{cand.title}</span>
                                <span className="picker-row__meta mono">
                                  #{cand.id.slice(0, 8)} · Day {cand.start_date}→{cand.end_date} · {cand.column}
                                </span>
                              </div>
                              {causesCycle ? (
                                <span
                                  className="badge badge--blocked badge--tiny"
                                  title="Adding this task as a prerequisite would create an invalid circular dependency loop!"
                                >
                                  ⚠️ Cycle Loop
                                </span>
                              ) : (
                                <button
                                  className="btn btn--tiny btn--solid"
                                  onClick={() => handleAddDependency(cand.id)}
                                >
                                  Add Edge
                                </button>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* Current Prerequisites List */}
                <div className="deps-item-list">
                  {myDeps.length === 0 ? (
                    <div className="empty-deps-note">
                      <span>No prerequisites defined. This task is independent and immediately Ready to start.</span>
                    </div>
                  ) : (
                    myDeps.map(({ depId, prereqId, prereqTask }) => {
                      const isSatisfied = prereqTask?.column === "done";
                      return (
                        <div key={depId} className="dep-item-row">
                          <div className="dep-item-status">
                            {isSatisfied ? (
                              <span className="badge badge--done badge--tiny">✓ DONE</span>
                            ) : (
                              <span className="badge badge--blocked badge--tiny">🔒 BLOCKING</span>
                            )}
                          </div>
                          <div className="dep-item-details">
                            <span className="dep-item-title">
                              {prereqTask?.title || prereqId}
                            </span>
                            <span className="dep-item-sub mono">
                              #{prereqId.slice(0, 8)} · Schedule: Day {prereqTask?.start_date}→{prereqTask?.end_date} · {prereqTask?.column || "unknown"}
                            </span>
                          </div>
                          <button
                            className="btn btn--tiny btn--danger"
                            onClick={() => handleRemoveDependency(prereqId)}
                            title="Remove this prerequisite"
                          >
                            Remove
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Downstream Dependents Section */}
              <div className="deps-block" style={{ marginTop: 24 }}>
                <div className="deps-block__header">
                  <div>
                    <h4 className="deps-block__title">Downstream Dependents</h4>
                    <p className="deps-block__sub">
                      Tasks that are WAITING for this task to finish before they can proceed.
                    </p>
                  </div>
                </div>

                <div className="deps-item-list">
                  {dependents.length === 0 ? (
                    <div className="empty-deps-note">
                      <span>No downstream tasks depend on this one. Changing dates or moving this task won't impact other tasks.</span>
                    </div>
                  ) : (
                    dependents.map(({ depId, taskId, dependentTask }) => (
                      <div key={depId} className="dep-item-row dep-item-row--dependent">
                        <div className="dep-item-status">
                          <span className="badge badge--ready badge--tiny">↳ WAITING</span>
                        </div>
                        <div className="dep-item-details">
                          <span className="dep-item-title">
                            {dependentTask?.title || taskId}
                          </span>
                          <span className="dep-item-sub mono">
                            #{taskId.slice(0, 8)} · Schedule: Day {dependentTask?.start_date}→{dependentTask?.end_date} · Status: {dependentTask?.status || "unknown"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AI SUGGESTIONS */}
          {activeTab === "ai" && (
            <div className="tab-pane">
              <div className="ai-banner">
                <div className="ai-banner__icon">✨</div>
                <div>
                  <h4 className="ai-banner__title">AI Dependency Analyzer</h4>
                  <p className="ai-banner__desc">
                    Analyzes title and description against candidate tasks using Gemini / Anthropic (with keyword fallback).
                    Every suggestion is pre-checked by the DAG engine to guarantee no cycles or duplicate edges are created.
                  </p>
                </div>
              </div>

              <div className="ai-action-bar">
                <button
                  className="btn btn--solid"
                  onClick={handleSuggest}
                  disabled={loadingSuggestions}
                >
                  {loadingSuggestions ? (
                    <>
                      <span className="spinner-icon">⏳</span> Analyzing Graph & Semantics...
                    </>
                  ) : (
                    "✨ Suggest Dependencies"
                  )}
                </button>
              </div>

              {aiMessage && (
                <div className="ai-empty-message mono">{aiMessage}</div>
              )}

              {suggestions.length > 0 && (
                <div className="suggestions-deck">
                  {suggestions.map((sug) => {
                    const prereqTask = titleById.get(sug.prerequisite_id);
                    return (
                      <div key={sug.id} className="suggestion-card">
                        <div className="suggestion-card__header">
                          <div className="suggestion-card__target">
                            <span className="suggestion-card__badge">Suggested Prerequisite:</span>
                            <span className="suggestion-card__name">
                              {prereqTask?.title || sug.prerequisite_id}
                            </span>
                          </div>
                          <div className="suggestion-card__score mono">
                            <span className="confidence-pill">{sug.confidence}% Match</span>
                          </div>
                        </div>

                        {/* Confidence Bar */}
                        <div className="confidence-track">
                          <div
                            className="confidence-fill"
                            style={{ width: `${sug.confidence}%` }}
                          />
                        </div>

                        <p className="suggestion-card__reason">
                          💡 <strong>Reason:</strong> {sug.reason}
                        </p>

                        <div className="suggestion-card__footer">
                          <span className="cycle-badge mono">✓ Cycle-Safe Verified</span>
                          <div className="suggestion-card__btns">
                            <button
                              className="btn btn--small btn--primary"
                              onClick={() => handleDecide(sug.id, true)}
                            >
                              Accept Edge
                            </button>
                            <button
                              className="btn btn--small btn--ghost"
                              onClick={() => handleDecide(sug.id, false)}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal__footer">
          {!isNew ? (
            <button
              className="btn btn--ghost btn--danger"
              onClick={handleDelete}
              disabled={saving}
              title={
                dependents.length > 0
                  ? "Cannot delete task while downstream tasks depend on it"
                  : "Delete this task"
              }
            >
              🗑️ Delete Task
            </button>
          ) : (
            <div />
          )}

          <div className="modal__footer-actions">
            <button className="btn btn--ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              className="btn btn--primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : isNew ? "Create Task" : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
