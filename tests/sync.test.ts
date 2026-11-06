import { expect, it, vi } from 'vitest';
import { createSyncQueue, SyncConflictError } from '../src/lib/syncQueue';

it('serializes writes and coalesces rapid edits to the latest snapshot', async () => {
  let resolveFirst!: () => void;
  const first = new Promise<void>(resolve => { resolveFirst = resolve; });
  const writes: number[] = [];
  const status = vi.fn();
  const queue = createSyncQueue<number>(async value => { writes.push(value); if (value === 1) await first; }, status);
  queue.enqueue(1); queue.enqueue(2); queue.enqueue(3);
  expect(writes).toEqual([1]);
  resolveFirst();
  await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith('saved'));
  expect(writes).toEqual([1, 3]);
});
it('retains edits after a network failure and retries the latest snapshot', async () => {
  let offline = true;
  const writes: number[] = []; const status = vi.fn();
  const queue = createSyncQueue<number>(async value => { if (offline) throw new Error('Offline'); writes.push(value); }, status);
  queue.enqueue(1);
  await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith('error', 'Offline'));
  offline = false; queue.enqueue(2); queue.retry();
  await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith('saved'));
  expect(writes).toEqual([2]);
});
it('uses a fresh edit to resume an ordinary failed save without bypassing conflicts', async () => {
  let offline = true;
  const attempts: number[] = [];
  const status = vi.fn();
  const queue = createSyncQueue<number>(async value => {
    attempts.push(value);
    if (offline) throw new Error('Offline');
  }, status);
  queue.enqueue(1);
  await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith('error', 'Offline'));

  offline = false;
  queue.enqueue(2);

  await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith('saved'));
  expect(attempts).toEqual([1, 2]);
});
it('never retries or overwrites a conflicting remote revision', async () => {
  const write = vi.fn(async () => { throw new SyncConflictError(); }); const status = vi.fn();
  const queue = createSyncQueue<number>(write, status); queue.enqueue(1);
  await vi.waitFor(() => expect(status.mock.lastCall?.[0]).toBe('conflict'));
  queue.enqueue(2); queue.retry(); expect(write).toHaveBeenCalledTimes(1);
});

it('blocks queued writes during a realtime conflict and resumes only after reset', async () => {
  const writes: number[] = [];
  const status = vi.fn();
  const queue = createSyncQueue<number>(async value => { writes.push(value); }, status);
  queue.blockConflict('conflict');
  queue.enqueue(1);
  await Promise.resolve();
  expect(writes).toEqual([]);
  expect(status).toHaveBeenLastCalledWith('conflict', 'conflict');
  queue.reset();
  queue.enqueue(2);
  await vi.waitFor(() => expect(writes).toEqual([2]));
});
it('drops pending writes and callbacks when a session is disposed', async () => {
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  const write = vi.fn(async () => wait); const status = vi.fn();
  const queue = createSyncQueue<number>(write, status); queue.enqueue(1); queue.enqueue(2); queue.stop(); release();
  await wait; await Promise.resolve();
  expect(write).toHaveBeenCalledTimes(1); expect(status).toHaveBeenCalledTimes(1);
});
