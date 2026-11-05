export class SyncConflictError extends Error {
  constructor(message = 'Dữ liệu đã được cập nhật ở phiên khác. Hãy chọn bản ưu tiên để hợp nhất thay đổi.') {
    super(message);
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
    blockConflict(error: string) {
      if (stopped) return;
      failed = true;
      conflict = true;
      onStatus('conflict', error);
    },
    reset() {
      if (stopped) return;
      pending = undefined;
      failed = false;
      conflict = false;
      onStatus('saved');
    },
    stop() { stopped = true; pending = undefined; },
  };
}
