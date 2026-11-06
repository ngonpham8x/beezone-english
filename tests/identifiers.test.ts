import { describe, expect, it } from 'vitest';
import {
  formatRoomCode,
  newEntityId,
  newRoomIdentity,
  reconcileRoomCodes,
} from '../src/lib/identifiers';
import { reconcileTimetableSlots } from '../src/modules/center/model';

describe('multi-device identifiers', () => {
  it('uses unique internal IDs while keeping readable room codes', () => {
    const first = newRoomIdentity([]);
    const second = newRoomIdentity([{ ...first }]);

    expect(first.id).not.toBe(second.id);
    expect(first.id).toMatch(/^ROOM_[0-9a-f-]{36}$/i);
    expect(first.code).toBe('P-01');
    expect(second.code).toBe('P-02');
    expect(newEntityId('TT')).toMatch(/^TT_[0-9a-f-]{36}$/i);
  });

  it('repairs duplicate room codes after merging two devices', () => {
    const rooms = reconcileRoomCodes([
      { id: 'ROOM_a', code: 'P-01' },
      { id: 'ROOM_b', code: 'P-01' },
      { id: 'ROOM-101' },
    ]);

    expect(rooms.map((room, index) => formatRoomCode(room, index))).toEqual(['P-01', 'P-02', 'ROOM-101']);
  });

  it('collapses the same recurring lesson created concurrently with different IDs', () => {
    const shared = {
      classId: 'class-1', teacherId: 'teacher-1', roomId: 'room-1',
      dayOfWeek: 'Thứ 2', startTime: '18:00', endTime: '19:30',
    };
    const result = reconcileTimetableSlots([
      { id: 'TT_remote', ...shared },
      { id: 'TT_local', ...shared, note: 'Mang giáo trình' },
    ]);

    expect(result).toEqual([{ id: 'TT_remote', ...shared, note: 'Mang giáo trình' }]);
  });
});
