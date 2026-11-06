import { describe, expect, it } from 'vitest';
import { parseCenterData } from '../src/lib/centerData';
import { isNewerCenterRevision, mergeCenterSnapshots } from '../src/lib/centerSync';
import { initialSettings } from '../src/mock/initialData';
import { normalizeCenterData } from '../src/modules/center/model';

const payload = () => parseCenterData({
  settings: initialSettings,
  programs: [], teachers: [], rooms: [], classes: [], timetableSlots: [], grades: [],
  receipts: [], backups: [], activityLogs: [], attendanceSessions: [], enrollments: [],
  scheduleChanges: [],
  students: [{
    id: 'student-1', code: 'S01', name: 'Tên cũ', dob: '2020-01-01', gender: 'Nam',
    school: '', gradeLevel: '', programId: '', classId: '', address: '', email: '',
    phone: '0901', parentName: '', parentPhone: '', enrollDate: '2026-01-01',
    status: 'active', feeStatus: 'unpaid',
  }],
}, initialSettings);

describe('center snapshot merge', () => {
  it('ignores an older server snapshot that finishes after a newer save', () => {
    expect(isNewerCenterRevision('2026-11-06T07:30:22.900Z', '2026-11-06T07:30:23.100Z')).toBe(false);
    expect(isNewerCenterRevision('2026-11-06T07:30:23.100Z', '2026-11-06T07:30:23.100Z')).toBe(false);
    expect(isNewerCenterRevision('2026-11-06T07:30:23.200Z', '2026-11-06T07:30:23.100Z')).toBe(true);
    expect(isNewerCenterRevision('2026-11-06T07:30:23.100200Z', '2026-11-06T07:30:23.100100Z')).toBe(true);
  });

  it('keeps non-overlapping edits made on two devices', () => {
    const base = payload();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.students[0].name = 'Tên sửa ở máy A';
    remote.students[0].phone = '0902';

    const merged = mergeCenterSnapshots(base, local, remote);

    expect(merged.conflicts).toEqual([]);
    expect(merged.value.students[0]).toMatchObject({ name: 'Tên sửa ở máy A', phone: '0902' });
  });

  it('reports only a field changed differently on both devices', () => {
    const base = payload();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.students[0].name = 'Tên máy A';
    remote.students[0].name = 'Tên máy B';

    const merged = mergeCenterSnapshots(base, local, remote);

    expect(merged.conflicts).toEqual(['students[id=student-1].name']);
    expect(mergeCenterSnapshots(base, local, remote, 'remote').value.students[0].name).toBe('Tên máy B');
    expect(mergeCenterSnapshots(base, local, remote, 'local').value.students[0].name).toBe('Tên máy A');
  });

  it('combines independent class membership changes without duplicates', () => {
    const base = payload();
    base.students[0].classId = 'class-1';
    base.students[0].additionalClassIds = ['class-2'];
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.students[0].additionalClassIds = ['class-2', 'class-3'];
    remote.students[0].additionalClassIds = ['class-2', 'class-4'];

    const merged = mergeCenterSnapshots(base, local, remote);

    expect(merged.conflicts).toEqual([]);
    expect(merged.value.students[0].additionalClassIds).toEqual(['class-2', 'class-4', 'class-3']);
  });

  it('keeps rooms created on two devices and repairs their duplicate display codes', () => {
    const base = payload();
    const local = structuredClone(base);
    const remote = structuredClone(base);
    local.rooms.push({ id: 'ROOM_local', code: 'P-01', name: 'Phòng máy A', capacity: 12, status: 'available' });
    remote.rooms.push({ id: 'ROOM_remote', code: 'P-01', name: 'Phòng máy B', capacity: 15, status: 'available' });

    const merged = mergeCenterSnapshots(base, local, remote);
    const normalized = normalizeCenterData(merged.value);

    expect(merged.conflicts).toEqual([]);
    expect(normalized.rooms.map((room) => room.name)).toEqual(['Phòng máy B', 'Phòng máy A']);
    expect(normalized.rooms.map((room) => room.code)).toEqual(['P-01', 'P-02']);
  });
});
