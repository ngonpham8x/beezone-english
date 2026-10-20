import type { ClassRoom, CourseProgram, Room, Teacher, TimetableSlot } from '../types';
import { findScheduleConflict } from './schedule';

type Catalog = { programs: CourseProgram[]; teachers: Teacher[]; rooms: Room[]; classes: ClassRoom[]; timetableSlots: TimetableSlot[] };
const key = (value: string) => value.trim().toLocaleLowerCase('vi-VN');

/** Add missing class codes only; retain every existing class and its references. */
export function mergeAcademicCatalog(current: Catalog, source: Catalog, includeSchedule = false): Catalog {
  const result = Object.fromEntries(Object.entries(current).map(([name, values]) => [name, [...values]])) as Catalog;
  function resolve<T extends { id: string; name: string }>(records: T[], originals: T[], id: string, prefix: string): string {
    if (!id) return '';
    const original = originals.find(record => record.id === id);
    if (!original) throw new Error('Danh mục lớp có tham chiếu không hợp lệ.');
    const matches = records.filter(record => key(record.name) === key(original.name));
    if (matches.length > 1) throw new Error(`Có nhiều hồ sơ cùng tên “${original.name}”. Hãy đối chiếu trước khi nhập.`);
    if (matches[0]) return matches[0].id;
    const created = { ...original, id: `${prefix}_${crypto.randomUUID()}` };
    if ('code' in created && records.some(record => 'code' in record && key(String(record.code)) === key(String(created.code)))) created.code = `${created.code}-${crypto.randomUUID().slice(0, 8)}`;
    records.push(created);
    return created.id;
  }
  const seen = new Set<string>();
  for (const classroom of source.classes) {
    const code = key(classroom.code);
    if (!code || seen.has(code)) throw new Error('Danh mục lớp bị trùng hoặc thiếu mã lớp.');
    seen.add(code);
    if (result.classes.some(existing => key(existing.code) === code)) continue;
    const created = { ...classroom, id: `CLASS_${crypto.randomUUID()}`, studentIds: [],
      programId: resolve(result.programs, source.programs, classroom.programId, 'PROG'),
      teacherId: resolve(result.teachers, source.teachers, classroom.teacherId, 'TEA'),
      roomId: resolve(result.rooms, source.rooms, classroom.roomId, 'ROOM') };
    if (!includeSchedule) {
      created.days = [];
      created.scheduleTime = '';
      created.courseStatus = 'planned';
    }
    result.classes.push(created);
    for (const slot of includeSchedule ? source.timetableSlots.filter(slot => slot.classId === classroom.id) : []) {
      const candidate = { ...slot, id: `TT_${crypto.randomUUID()}`, classId: created.id, teacherId: created.teacherId, roomId: created.roomId };
      if (findScheduleConflict(result.timetableSlots, candidate)) throw new Error(`Lịch lớp ${classroom.name} trùng giờ giáo viên hoặc phòng học. Hãy đối chiếu lịch trước khi nhập.`);
      result.timetableSlots.push(candidate);
    }
  }
  return result;
}
