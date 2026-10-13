export class SyncConflictError extends Error {
  constructor() {
    super('Dữ liệu đã được cập nhật ở phiên khác. Hãy sao lưu thay đổi hiện tại trước khi tải lại dữ liệu.');
    this.name = 'SyncConflictError';
  }
}

/** Only one write can run at a time; subsequent edits replace the pending snapshot. */
export function createSyncQueue<T>(
  write: (payload: T) => Promise<void>,
  onStatus: (status: 'saving' | 'saved' | 'error' | 'conflict', error?: string) => void,
) {
  let pending: T | undefined;
  let running = false;
  let stopped = false;
  let failed = false;
  let conflict = false;
  const drain = async () => {
    if (running || stopped || failed || pending === undefined) return;
    running = true;
    onStatus('saving');
    try {
      while (!stopped && pending !== undefined) {
        const snapshot = pending;
        pending = undefined;
        try {
          await write(snapshot);
        } catch (error) {
          pending ??= snapshot;
          failed = true;
          conflict = error instanceof SyncConflictError;
          if (!stopped) onStatus(conflict ? 'conflict' : 'error', error instanceof Error ? error.message : 'Không thể lưu dữ liệu.');
          return;
        }
      }
      if (!stopped) onStatus('saved');
    } finally {
      running = false;
    }
  };
  return {
    enqueue(payload: T) { if (!stopped) { pending = payload; void drain(); } },
    retry() { if (!conflict && !stopped) { failed = false; void drain(); } },
    stop() { stopped = true; pending = undefined; },
  };
}
