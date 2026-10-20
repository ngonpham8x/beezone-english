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
