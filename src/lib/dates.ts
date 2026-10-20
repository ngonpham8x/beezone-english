/** Calendar dates in the centre's time zone, independent of the browser's UTC clock. */
export function centerDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function localCalendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Parses manual input string (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DDMMYYYY) to ISO YYYY-MM-DD */
export function parseDateInput(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // If D/M/YYYY or DD/MM/YYYY with /, -, .
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // If 8 consecutive digits (YYYYMMDD or DDMMYYYY)
  if (/^\d{8}$/.test(trimmed)) {
    const first4 = Number(trimmed.slice(0, 4));
    if (first4 >= 1900 && first4 <= 2100) {
      return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
    } else {
      return `${trimmed.slice(4, 8)}-${trimmed.slice(2, 4)}-${trimmed.slice(0, 2)}`;
    }
  }

  return trimmed;
}

/** Formats ISO YYYY-MM-DD to Vietnamese display DD/MM/YYYY */
export function formatDateForDisplay(value: string): string {
  if (!value) return '';
  const trimmed = value.trim();
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymdMatch) {
    return `${ymdMatch[3]}/${ymdMatch[2]}/${ymdMatch[1]}`;
  }
  return trimmed;
}
