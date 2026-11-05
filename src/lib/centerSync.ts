import type { CenterDataPayload } from './centerData';

export type CenterSyncPreference = 'manual' | 'local' | 'remote';

export interface CenterSyncMergeResult {
  value: CenterDataPayload;
  conflicts: string[];
}

const MISSING = Symbol('missing');
type MergeValue = unknown | typeof MISSING;

const isRecord = (value: MergeValue): value is Record<string, unknown> =>
  value !== MISSING && value !== null && typeof value === 'object' && !Array.isArray(value);

const objectKeys = (value: Record<string, unknown>) =>
  Object.keys(value).filter((key) => value[key] !== undefined);

function sameValue(left: MergeValue, right: MergeValue): boolean {
  if (left === MISSING || right === MISSING) return left === right;
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) &&
      left.length === right.length && left.every((item, index) => sameValue(item, right[index]));
  }
  if (isRecord(left) || isRecord(right)) {
    if (!isRecord(left) || !isRecord(right)) return false;
    const leftKeys = objectKeys(left).sort();
    const rightKeys = objectKeys(right).sort();
    return leftKeys.length === rightKeys.length &&
      leftKeys.every((key, index) => key === rightKeys[index] && sameValue(left[key], right[key]));
  }
  return false;
}

function cloneValue(value: MergeValue): MergeValue {
  if (value === MISSING || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => cloneValue(item));
  if (isRecord(value)) {
    return Object.fromEntries(
      objectKeys(value).map((key) => [key, cloneValue(value[key])]),
    );
  }
  return value;
}

const primitiveArray = (value: unknown[]): boolean =>
  value.every((item) => item === null || ['string', 'number', 'boolean'].includes(typeof item));

const primitiveKey = (value: unknown) => `${typeof value}:${String(value)}`;

function mergePrimitiveArray(base: unknown[], local: unknown[], remote: unknown[]): unknown[] {
  const baseKeys = new Set(base.map(primitiveKey));
  const localKeys = new Set(local.map(primitiveKey));
  const remoteKeys = new Set(remote.map(primitiveKey));
  const values = new Map<string, unknown>();
  [...base, ...remote, ...local].forEach((value) => values.set(primitiveKey(value), value));
  const included = new Set<string>();
  for (const key of values.keys()) {
    const inBase = baseKeys.has(key);
    const inLocal = localKeys.has(key);
    const inRemote = remoteKeys.has(key);
    const keep = inLocal === inRemote
      ? inLocal
      : inLocal === inBase
        ? inRemote
        : inLocal;
    if (keep) included.add(key);
  }
  return [...remote, ...local]
    .filter((value, index, all) => all.findIndex((item) => primitiveKey(item) === primitiveKey(value)) === index)
    .filter((value) => included.has(primitiveKey(value)));
}

function stableArrayKey(groups: Record<string, unknown>[][]): string | null {
  for (const candidate of ['id', 'studentId', 'attendanceSessionId']) {
    if (groups.every((records) => {
      const values = records.map((record) => record[candidate]);
      return values.every((value) => typeof value === 'string' && value.length > 0) &&
        new Set(values).size === values.length;
    })) return candidate;
  }
  return null;
}

function chooseConflict(
  local: MergeValue,
  remote: MergeValue,
  path: string,
  preference: CenterSyncPreference,
  conflicts: string[],
): MergeValue {
  if (preference === 'manual') conflicts.push(path || 'Dữ liệu trung tâm');
  return cloneValue(preference === 'remote' ? remote : local);
}

function mergeValue(
  base: MergeValue,
  local: MergeValue,
  remote: MergeValue,
  path: string,
  preference: CenterSyncPreference,
  conflicts: string[],
): MergeValue {
  if (sameValue(local, remote)) return cloneValue(local);
  if (sameValue(local, base)) return cloneValue(remote);
  if (sameValue(remote, base)) return cloneValue(local);

  if (local === MISSING || remote === MISSING) {
    return chooseConflict(local, remote, path, preference, conflicts);
  }

  if (Array.isArray(local) && Array.isArray(remote)) {
    const baseArray = Array.isArray(base) ? base : [];
    if (primitiveArray(baseArray) && primitiveArray(local) && primitiveArray(remote) &&
      new Set(baseArray.map(primitiveKey)).size === baseArray.length &&
      new Set(local.map(primitiveKey)).size === local.length &&
      new Set(remote.map(primitiveKey)).size === remote.length) {
      return mergePrimitiveArray(baseArray, local, remote);
    }

    const allRecords = [...baseArray, ...local, ...remote];
    if (allRecords.every(isRecord)) {
      const keyField = stableArrayKey([
        baseArray as Record<string, unknown>[],
        local as Record<string, unknown>[],
        remote as Record<string, unknown>[],
      ]);
      if (keyField) {
        const byKey = (items: unknown[]) => new Map(
          (items as Record<string, unknown>[]).map((item) => [item[keyField] as string, item]),
        );
        const baseMap = byKey(baseArray);
        const localMap = byKey(local);
        const remoteMap = byKey(remote);
        const orderedKeys = [...new Set([
          ...remote.map((item) => (item as Record<string, unknown>)[keyField] as string),
          ...local.map((item) => (item as Record<string, unknown>)[keyField] as string),
          ...baseArray.map((item) => (item as Record<string, unknown>)[keyField] as string),
        ])];
        const result: unknown[] = [];
        for (const key of orderedKeys) {
          const merged = mergeValue(
            baseMap.get(key) ?? MISSING,
            localMap.get(key) ?? MISSING,
            remoteMap.get(key) ?? MISSING,
            `${path}[${keyField}=${key}]`,
            preference,
            conflicts,
          );
          if (merged !== MISSING) result.push(merged);
        }
        return result;
      }
    }
    return chooseConflict(local, remote, path, preference, conflicts);
  }

  if (isRecord(local) && isRecord(remote) && (base === MISSING || isRecord(base))) {
    const baseRecord = isRecord(base) ? base : {};
    const keys = new Set([
      ...objectKeys(baseRecord),
      ...objectKeys(local),
      ...objectKeys(remote),
    ]);
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const merged = mergeValue(
        baseRecord[key] === undefined ? MISSING : baseRecord[key],
        local[key] === undefined ? MISSING : local[key],
        remote[key] === undefined ? MISSING : remote[key],
        path ? `${path}.${key}` : key,
        preference,
        conflicts,
      );
      if (merged !== MISSING) result[key] = merged;
    }
    return result;
  }

  return chooseConflict(local, remote, path, preference, conflicts);
}

export const centerSnapshotsEqual = (left: CenterDataPayload, right: CenterDataPayload) =>
  sameValue(left, right);

/**
 * Three-way merge: non-overlapping edits are retained from both devices. Only
 * edits to the same value become conflicts; the caller decides those explicitly.
 */
export function mergeCenterSnapshots(
  base: CenterDataPayload,
  local: CenterDataPayload,
  remote: CenterDataPayload,
  preference: CenterSyncPreference = 'manual',
): CenterSyncMergeResult {
  const conflicts: string[] = [];
  const value = mergeValue(base, local, remote, '', preference, conflicts);
  return { value: value as CenterDataPayload, conflicts: [...new Set(conflicts)] };
}
