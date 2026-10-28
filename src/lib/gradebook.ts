import type { CustomGradeColumn, Grade, GradeSemester } from '../types';

export const GRADE_SEMESTERS: GradeSemester[] = ['GKI', 'CKI', 'GKII', 'CKII'];

export const GRADE_SEMESTER_CONFIG: Record<
  GradeSemester,
  {
    name: GradeSemester;
    subLabel: string;
    gpaLabel: string;
    defaultUnits: { key: string; label: string }[];
  }
> = {
  GKI: {
    name: 'GKI',
    subLabel: 'Giữa Kỳ I',
    gpaLabel: 'ĐTBGKI',
    defaultUnits: [
      { key: 'unit1', label: 'UNIT 1' },
      { key: 'unit2', label: 'UNIT 2' },
      { key: 'unit3', label: 'UNIT 3' },
    ],
  },
  CKI: {
    name: 'CKI',
    subLabel: 'Cuối Kỳ I',
    gpaLabel: 'ĐTBCKI',
    defaultUnits: [
      { key: 'unit4', label: 'UNIT 4' },
      { key: 'unit5', label: 'UNIT 5' },
      { key: 'unit6', label: 'UNIT 6' },
    ],
  },
  GKII: {
    name: 'GKII',
    subLabel: 'Giữa Kỳ II',
    gpaLabel: 'ĐTBGKII',
    defaultUnits: [
      { key: 'unit7', label: 'UNIT 7' },
      { key: 'unit8', label: 'UNIT 8' },
      { key: 'unit9', label: 'UNIT 9' },
    ],
  },
  CKII: {
    name: 'CKII',
    subLabel: 'Cuối Kỳ II',
    gpaLabel: 'ĐTBCKII',
    defaultUnits: [
      { key: 'unit10', label: 'UNIT 10' },
      { key: 'unit11', label: 'UNIT 11' },
      { key: 'unit12', label: 'UNIT 12' },
    ],
  },
};

export const isGradeSemester = (value: unknown): value is GradeSemester =>
  typeof value === 'string' && GRADE_SEMESTERS.includes(value as GradeSemester);

export const gradeSemester = (grade: Pick<Grade, 'semester'>): GradeSemester =>
  isGradeSemester(grade.semester) ? grade.semester : 'GKI';

export const readingWritingScore = (
  grade: Pick<Grade, 'readingWriting' | 'reading' | 'writing'>,
) =>
  grade.readingWriting !== undefined
    ? grade.readingWriting
    : ((Number(grade.reading) || 0) + (Number(grade.writing) || 0)) / 2;

export const calculateSemesterAverage = (
  grade: Pick<Grade, 'listening' | 'speaking' | 'readingWriting' | 'reading' | 'writing'>,
) =>
  Math.round(
    ((Number(grade.listening) || 0) +
      (Number(grade.speaking) || 0) +
      readingWritingScore(grade)) /
      3 *
      10,
  ) / 10;

export const isValidScore = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10;

export const isValidCustomGradeColumn = (value: unknown): value is CustomGradeColumn => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const column = value as Partial<CustomGradeColumn>;
  return Boolean(
    typeof column.id === 'string' &&
      column.id.trim() &&
      typeof column.name === 'string' &&
      column.name.trim() &&
      column.name.length <= 40 &&
      isGradeSemester(column.semester) &&
      (column.programId === undefined || typeof column.programId === 'string') &&
      (column.classId === undefined || typeof column.classId === 'string') &&
      (column.createdAt === undefined || typeof column.createdAt === 'string'),
  );
};

export const normalizeCustomGradeColumns = (value: unknown): CustomGradeColumn[] => {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.filter((column): column is CustomGradeColumn => {
    if (!isValidCustomGradeColumn(column) || ids.has(column.id)) return false;
    ids.add(column.id);
    return true;
  });
};
