export type PatchOp =
  | { op: "replace"; path: string; value: unknown }
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string }
  | { op: "tombstone"; path: string; value?: { deletedAt?: string | "now"; reason?: string } }
  | {
      op: "link" | "unlink";
      path: string;
      value: { from: { kind: string; id: string }; to: { kind: string; id: string }; rel: string };
    };

type PathToken = string;

function cloneDeep<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function splitPath(path: string): PathToken[] {
  if (!path.startsWith("/")) {
    throw new Error(`Invalid path (must start with "/"): ${path}`);
  }
  return path.split("/").filter(Boolean);
}

function resolveParent(root: any, pathTokens: PathToken[], createMissing: boolean) {
  if (pathTokens.length === 0) {
    throw new Error("Path must not be empty");
  }

  let current = root;
  for (let i = 0; i < pathTokens.length - 1; i++) {
    const key = pathTokens[i];
    if (current[key] === undefined) {
      if (!createMissing) {
        throw new Error(`Path not found at ${pathTokens.slice(0, i + 1).join("/")}`);
      }
      current[key] = {};
    }
    current = current[key];
  }
  return { parent: current, key: pathTokens[pathTokens.length - 1] };
}

function setValue(parent: any, key: string, value: unknown) {
  if (Array.isArray(parent)) {
    if (key === "-") {
      parent.push(value);
      return;
    }
    const index = Number(key);
    if (!Number.isInteger(index)) {
      throw new Error(`Invalid array index: ${key}`);
    }
    parent[index] = value;
    return;
  }
  parent[key] = value;
}

function removeValue(parent: any, key: string) {
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!Number.isInteger(index)) {
      throw new Error(`Invalid array index: ${key}`);
    }
    parent.splice(index, 1);
    return;
  }
  delete parent[key];
}

function addToArray(target: any, value: unknown) {
  if (!Array.isArray(target)) {
    throw new Error("Link/unlink target is not an array");
  }
  if (!target.includes(value)) {
    target.push(value);
  }
}

function removeFromArray(target: any, value: unknown) {
  if (!Array.isArray(target)) {
    throw new Error("Link/unlink target is not an array");
  }
  const idx = target.indexOf(value);
  if (idx >= 0) {
    target.splice(idx, 1);
  }
}

export function applyPatchOps(snapshot: any, ops: PatchOp[]) {
  const next = cloneDeep(snapshot);
  const appliedOps: PatchOp[] = [];

  for (const op of ops) {
    const pathTokens = splitPath(op.path);
    const { parent, key } = resolveParent(next, pathTokens, op.op !== "remove");

    if (op.op === "replace" || op.op === "add") {
      setValue(parent, key, op.value);
      appliedOps.push(op);
      continue;
    }

    if (op.op === "remove") {
      removeValue(parent, key);
      appliedOps.push(op);
      continue;
    }

    if (op.op === "tombstone") {
      const target = parent[key];
      if (!target || typeof target !== "object") {
        throw new Error(`Tombstone target missing or invalid at ${op.path}`);
      }
      const deletedAt = op.value?.deletedAt === "now" || !op.value?.deletedAt
        ? new Date().toISOString()
        : op.value?.deletedAt;
      target.deletedAt = deletedAt;
      if (op.value?.reason) {
        target.deletedReason = op.value.reason;
      }
      appliedOps.push(op);
      continue;
    }

    if (op.op === "link") {
      const target = parent[key];
      addToArray(target, op.value.to.id);
      appliedOps.push(op);
      continue;
    }

    if (op.op === "unlink") {
      const target = parent[key];
      removeFromArray(target, op.value.to.id);
      appliedOps.push(op);
      continue;
    }

    throw new Error(`Unsupported op: ${(op as any).op}`);
  }

  return { snapshot: next, appliedOps };
}
