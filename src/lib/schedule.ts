import type { TimetableSlot } from '../types';
export function timeMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
export function findScheduleConflict(slots: TimetableSlot[], candidate: TimetableSlot): TimetableSlot | undefined {
  const start = timeMinutes(candidate.startTime), end = timeMinutes(candidate.endTime);
  if (start === null || end === null || start >= end) return candidate;
  return slots.find(slot => {
    if (slot.id === candidate.id || slot.dayOfWeek !== candidate.dayOfWeek) return false;
    const otherStart = timeMinutes(slot.startTime), otherEnd = timeMinutes(slot.endTime);
    if (otherStart === null || otherEnd === null || start >= otherEnd || end <= otherStart) return false;
    return Boolean((candidate.teacherId && slot.teacherId === candidate.teacherId) || (candidate.roomId && slot.roomId === candidate.roomId) || slot.classId === candidate.classId);
  });
}
