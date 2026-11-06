export function nextReceiptCode(receipts: { code: string }[], year = new Date().getFullYear()): string {
  const prefix = `PT-${year}-`;
  const maximum = receipts.reduce((max, receipt) => {
    if (!receipt.code.startsWith(prefix)) return max;
    const suffix = receipt.code.slice(prefix.length);
    return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
  }, 0);
  return `${prefix}${String(maximum + 1).padStart(4, '0')}`;
}

/** Keep old HS-001 codes readable and never reuse a number after a deletion. */
export function nextStudentCode(students: { code: string }[]): string {
  const maximum = students.reduce((max, student) => {
    const match = student.code.trim().match(/^HS-?(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `HS${String(maximum + 1).padStart(3, '0')}`;
}

/** Generate a readable code scoped to the student's primary class. */
export function nextClassStudentCode(classCode: string, students: { code: string }[]): string {
  const prefix = `${classCode.trim()}-`;
  const maximum = students.reduce((max, student) => {
    const code = student.code.trim();
    if (!code.startsWith(prefix)) return max;
    const suffix = code.slice(prefix.length);
    return /^\d+$/.test(suffix) ? Math.max(max, Number(suffix)) : max;
  }, 0);
  return `${prefix}${String(maximum + 1).padStart(2, '0')}`;
}

const roomCodePattern = /^(?:P|PH|ROOM|LAB|VIP)-?\d{1,4}$/i;

const normalizedRoomCode = (value: string | undefined) => {
  const code = (value || '').trim().toUpperCase();
  return roomCodePattern.test(code) ? code : '';
};

/** Generate an internal ID that remains unique when several devices create records together. */
export function newEntityId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

/** Clean display code for a room without using it as the internal record ID. */
export function formatRoomCode(room: { id: string; code?: string }, index?: number): string {
  const code = normalizedRoomCode(room?.code);
  if (code) return code;
  const legacyId = normalizedRoomCode(room?.id);
  if (legacyId) return legacyId;
  const idx = typeof index === 'number' ? index + 1 : 1;
  return `P-${String(idx).padStart(2, '0')}`;
}

/** Generates the next readable room code while the internal ID remains a UUID. */
export function nextRoomCode(rooms: { id: string; code?: string }[]): string {
  const used = new Set(rooms.map((room, index) => formatRoomCode(room, index).toUpperCase()));
  let num = 1;
  while (used.has(`P-${String(num).padStart(2, '0')}`)) num += 1;
  return `P-${String(num).padStart(2, '0')}`;
}

export function newRoomIdentity(rooms: { id: string; code?: string }[]) {
  return { id: newEntityId('ROOM'), code: nextRoomCode(rooms) };
}

/**
 * Keep legacy room IDs intact, but repair duplicate display codes after a
 * multi-device merge. The first record keeps its code; later records receive
 * the next free code deterministically.
 */
export function reconcileRoomCodes<T extends { id: string; code?: string }>(rooms: T[]): T[] {
  const used = new Set<string>();
  let changed = false;
  let nextNumber = 1;
  const allocate = () => {
    while (used.has(`P-${String(nextNumber).padStart(2, '0')}`)) nextNumber += 1;
    const code = `P-${String(nextNumber).padStart(2, '0')}`;
    nextNumber += 1;
    return code;
  };

  const result = rooms.map((room) => {
    const explicitCode = normalizedRoomCode(room.code);
    const legacyCode = normalizedRoomCode(room.id);
    const preferred = explicitCode || legacyCode;
    if (preferred && !used.has(preferred)) {
      used.add(preferred);
      if (explicitCode && room.code === explicitCode) return room;
      if (!explicitCode && !room.code) return room;
      changed = true;
      return { ...room, code: preferred };
    }
    const code = allocate();
    used.add(code);
    if (room.code === code) return room;
    changed = true;
    return { ...room, code };
  });
  return changed ? result : rooms;
}

/** Clean display code for a teacher (e.g. GV-01, GV-02 or existing clean ID like TEA-001, GV-001) */
export function formatTeacherCode(teacher: { id: string }, index?: number): string {
  const id = (teacher?.id || '').trim();
  if (/^(?:TEA|GV)-?\d{1,4}$/i.test(id)) {
    return id.toUpperCase();
  }
  const idx = typeof index === 'number' ? index + 1 : 1;
  return `GV-${String(idx).padStart(2, '0')}`;
}

/** Generates clean next teacher identifier (e.g. GV-01, GV-02) */
export function nextTeacherId(teachers: { id: string }[]): string {
  const existingIds = new Set(teachers.map(t => t.id.trim().toUpperCase()));
  let num = teachers.length + 1;
  while (existingIds.has(`GV-${String(num).padStart(2, '0')}`)) {
    num++;
  }
  return `GV-${String(num).padStart(2, '0')}`;
}
