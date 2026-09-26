const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, init) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch {
    throw new ApiError(
      "Can't reach the TaskFlow Pro API. Is the backend running on " +
        BASE_URL +
        "?",
      0,
    );
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      // The response was not JSON; use the HTTP status text.
    }
    throw new ApiError(detail, res.status);
  }
  return res.json();
}

export const api = {
  getBoard: () => request("/board"),
  resetSeed: () => request("/board/reset-seed", { method: "POST" }),
  clearBoard: () => request("/board/clear", { method: "POST" }),
  getCriticalPath: () => request("/critical-path"),
  createTask: (data) =>
    request("/tasks", { method: "POST", body: JSON.stringify(data) }),
  updateTask: (id, data) =>
    request(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteTask: (id, cascade = false) =>
    request(`/tasks/${id}${cascade ? "?cascade=true" : ""}`, {
      method: "DELETE",
    }),
  moveTask: (id, column, position) =>
    request(`/tasks/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ column, position }),
    }),
  createDependency: (task_id, prerequisite_id) =>
    request("/dependencies", {
      method: "POST",
      body: JSON.stringify({ task_id, prerequisite_id }),
    }),
  deleteDependency: (task_id, prerequisite_id) =>
    request(`/dependencies/${task_id}/${prerequisite_id}`, {
      method: "DELETE",
    }),
  suggestDependencies: (task_id) =>
    request("/ai/suggest-dependencies", {
      method: "POST",
      body: JSON.stringify({ task_id }),
    }),
  decideSuggestion: (suggestionId, accept) =>
    request(`/ai/suggestions/${suggestionId}/decide`, {
      method: "POST",
      body: JSON.stringify({ accept }),
    }),
};
