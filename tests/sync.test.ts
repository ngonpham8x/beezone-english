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
  queue.enqueue(2); offline = false; queue.retry();
  await vi.waitFor(() => expect(status).toHaveBeenLastCalledWith('saved'));
  expect(writes).toEqual([2]);
});
it('never retries or overwrites a conflicting remote revision', async () => {
  const write = vi.fn(async () => { throw new SyncConflictError(); }); const status = vi.fn();
  const queue = createSyncQueue<number>(write, status); queue.enqueue(1);
  await vi.waitFor(() => expect(status.mock.lastCall?.[0]).toBe('conflict'));
  queue.enqueue(2); queue.retry(); expect(write).toHaveBeenCalledTimes(1);
});
it('drops pending writes and callbacks when a session is disposed', async () => {
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  const write = vi.fn(async () => wait); const status = vi.fn();
  const queue = createSyncQueue<number>(write, status); queue.enqueue(1); queue.enqueue(2); queue.stop(); release();
  await wait; await Promise.resolve();
  expect(write).toHaveBeenCalledTimes(1); expect(status).toHaveBeenCalledTimes(1);
});
