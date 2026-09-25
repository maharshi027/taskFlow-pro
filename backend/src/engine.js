export class CycleError extends Error {
  constructor(path) {
    super(`Adding this dependency would create a cycle: ${path.join(" -> ")}`);
    this.name = "CycleError";
    this.path = path;
  }
}

export class SelfDependencyError extends Error {}
export class DuplicateEdgeError extends Error {}

export function graphFromEdges(taskIds, edges) {
  const successors = new Map(taskIds.map((id) => [id, new Set()]));
  const predecessors = new Map(taskIds.map((id) => [id, new Set()]));
  for (const [taskId, prerequisiteId] of edges) {
    if (!successors.has(prerequisiteId))
      successors.set(prerequisiteId, new Set());
    if (!predecessors.has(taskId)) predecessors.set(taskId, new Set());
    successors.get(prerequisiteId).add(taskId);
    predecessors.get(taskId).add(prerequisiteId);
  }
  return { successors, predecessors };
}

export function reachable(graph, start, target) {
  if (start === target) return [start];
  const visited = new Set();
  const stack = [[start, [start]]];
  while (stack.length) {
    const [node, path] = stack.pop();
    if (visited.has(node)) continue;
    visited.add(node);
    for (const next of graph.successors.get(node) ?? []) {
      if (next === target) return [...path, next];
      if (!visited.has(next)) stack.push([next, [...path, next]]);
    }
  }
  return null;
}

export function validateNewDependency(taskIds, edges, taskId, prerequisiteId) {
  if (taskId === prerequisiteId) {
    throw new SelfDependencyError(`Task ${taskId} cannot depend on itself.`);
  }
  if (
    edges.some(
      ([task, prerequisite]) =>
        task === taskId && prerequisite === prerequisiteId,
    )
  ) {
    throw new DuplicateEdgeError(
      `Dependency ${prerequisiteId} -> ${taskId} already exists.`,
    );
  }
  const path = reachable(
    graphFromEdges(taskIds, edges),
    taskId,
    prerequisiteId,
  );
  if (path) throw new CycleError([...path, taskId]);
}

export function topologicalOrder(taskIds, edges) {
  const graph = graphFromEdges(taskIds, edges);
  const degree = Object.fromEntries(
    taskIds.map((id) => [id, graph.predecessors.get(id)?.size ?? 0]),
  );
  const queue = taskIds.filter((id) => degree[id] === 0).sort();
  const order = [];
  while (queue.length) {
    const node = queue.shift();
    order.push(node);
    for (const next of [...(graph.successors.get(node) ?? [])].sort()) {
      degree[next] -= 1;
      if (degree[next] === 0) queue.push(next);
    }
    queue.sort();
  }
  if (order.length !== taskIds.length)
    throw new CycleError(taskIds.filter((id) => !order.includes(id)));
  return order;
}

export function computeSchedule(tasks, edges) {
  const byId = new Map(tasks.map((task) => [task.id, { ...task }]));
  const graph = graphFromEdges([...byId.keys()], edges);
  for (const taskId of topologicalOrder([...byId.keys()], edges)) {
    const task = byId.get(taskId);
    const ends = [...(graph.predecessors.get(taskId) ?? [])]
      .map((id) => byId.get(id)?.end_date)
      .filter((value) => value !== undefined);
    const planned = task.planned_start || 0;
    const earliest = ends.length ? Math.max(...ends) + 1 : planned;
    task.start_date = Math.max(planned, earliest);
    task.end_date = task.start_date + Math.max(task.duration_days ?? 1, 0);
  }
  return byId;
}

export function computeStatuses(tasks, edges) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const graph = graphFromEdges([...byId.keys()], edges);
  const statuses = new Map();
  for (const taskId of topologicalOrder([...byId.keys()], edges)) {
    const blocked = [...(graph.predecessors.get(taskId) ?? [])].some(
      (id) => statuses.get(id) !== "done",
    );
    statuses.set(
      taskId,
      blocked
        ? "blocked"
        : byId.get(taskId).column === "done"
          ? "done"
          : "ready",
    );
  }
  return statuses;
}

export function descendants(taskId, taskIds, edges) {
  const graph = graphFromEdges(taskIds, edges);
  const seen = new Set();
  const stack = [...(graph.successors.get(taskId) ?? [])];
  while (stack.length) {
    const node = stack.pop();
    if (seen.has(node)) continue;
    seen.add(node);
    stack.push(...(graph.successors.get(node) ?? []));
  }
  return seen;
}

export function criticalPath(tasks, edges) {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const graph = graphFromEdges([...byId.keys()], edges);
  const lengths = new Map();
  const previous = new Map();
  for (const taskId of topologicalOrder([...byId.keys()], edges)) {
    const predecessors = [...(graph.predecessors.get(taskId) ?? [])];
    const duration = byId.get(taskId).duration_days || 1;
    if (!predecessors.length) lengths.set(taskId, duration);
    else {
      const best = predecessors.reduce((left, right) =>
        (lengths.get(right) ?? 0) > (lengths.get(left) ?? 0) ? right : left,
      );
      lengths.set(taskId, (lengths.get(best) ?? 0) + duration);
      previous.set(taskId, best);
    }
  }
  if (!lengths.size) return [[], 0];
  let end = [...lengths.entries()].reduce((best, entry) =>
    entry[1] > best[1] ? entry : best,
  )[0];
  const path = [end];
  while (previous.has(end)) {
    end = previous.get(end);
    path.push(end);
  }
  path.reverse();
  return [path, lengths.get(path.at(-1)) ?? 0];
}
