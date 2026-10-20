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

/** Clean display code for a room (e.g. P-01, P-02 or existing clean ID like ROOM-101, P101) */
export function formatRoomCode(room: { id: string }, index?: number): string {
  const id = (room?.id || '').trim();
  if (/^(?:P|PH|ROOM|LAB|VIP)-?\d{1,4}$/i.test(id)) {
    return id.toUpperCase();
  }
  const idx = typeof index === 'number' ? index + 1 : 1;
  return `P-${String(idx).padStart(2, '0')}`;
}

/** Generates clean next room identifier (e.g. P-01, P-02) */
export function nextRoomId(rooms: { id: string }[]): string {
  const existingIds = new Set(rooms.map(r => r.id.trim().toUpperCase()));
  let num = rooms.length + 1;
  while (existingIds.has(`P-${String(num).padStart(2, '0')}`)) {
    num++;
  }
  return `P-${String(num).padStart(2, '0')}`;
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
