import type { ClassRoom, CustomGradeColumn, CustomGradeColumnKind, Grade, GradeSemester } from '../types';

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
    : grade.reading !== undefined || grade.writing !== undefined
    ? ((Number(grade.reading) || 0) + (Number(grade.writing) || 0)) / 2
    : undefined;

export const calculateSemesterAverage = (
  grade: Pick<Grade, 'listening' | 'speaking' | 'readingWriting' | 'reading' | 'writing' | 'unitScores'>,
  includedUnitIds: Iterable<string> = [],
) => {
  const scores: number[] = [];
  if (isValidScore(grade.listening)) scores.push(Number(grade.listening));
  if (isValidScore(grade.speaking)) scores.push(Number(grade.speaking));
  const rw = readingWritingScore(grade);
  if (isValidScore(rw)) scores.push(Number(rw));
  const allowedIds = new Set(includedUnitIds);
  for (const [unitId, value] of Object.entries(grade.unitScores || {})) {
    if (allowedIds.has(unitId) && isValidScore(value)) scores.push(value);
  }
  if (scores.length === 0) return 0;
  return Math.round((scores.reduce((sum, value) => sum + value, 0) / scores.length) * 10) / 10;
};

export interface GradeYearSummary {
  semesterAverages: Partial<Record<GradeSemester, number>>;
  completedSemesters: number;
  average: number | null;
  complete: boolean;
  ability: string;
  trend: string;
}

export function calculateGradeYearSummary(grades: Grade[]): GradeYearSummary {
  const semesterAverages: Partial<Record<GradeSemester, number>> = {};
  for (const semester of GRADE_SEMESTERS) {
    const grade = grades.find((item) => gradeSemester(item) === semester);
    if (grade) semesterAverages[semester] = grade.average;
  }
  const values = GRADE_SEMESTERS
    .map((semester) => semesterAverages[semester])
    .filter((value): value is number => value !== undefined);
  const average = values.length
    ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
    : null;
  const ability = average === null
    ? 'Chưa có dữ liệu'
    : average >= 9
      ? 'Xuất sắc'
      : average >= 8
        ? 'Giỏi'
        : average >= 6.5
          ? 'Khá'
          : average >= 5
            ? 'Đạt'
            : 'Cần hỗ trợ';
  const first = values[0];
  const last = values[values.length - 1];
  const trend = values.length < 2
    ? 'Chưa đủ dữ liệu so sánh'
    : last - first >= 0.5
      ? 'Tiến bộ rõ'
      : first - last >= 0.5
        ? 'Có dấu hiệu giảm'
        : 'Duy trì ổn định';
  return {
    semesterAverages,
    completedSemesters: values.length,
    average,
    complete: values.length === GRADE_SEMESTERS.length,
    ability,
    trend,
  };
}

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
      (column.programId === undefined || typeof column.programId === 'string' && Boolean(column.programId.trim())) &&
      (column.classId === undefined || typeof column.classId === 'string' && Boolean(column.classId.trim())) &&
      (column.kind === undefined || column.kind === 'unit' || column.kind === 'assessment') &&
      (column.createdAt === undefined || typeof column.createdAt === 'string') &&
      (column.archivedAt === undefined || typeof column.archivedAt === 'string' && Boolean(column.archivedAt.trim())),
  );
};

export const customGradeColumnKind = (column: Pick<CustomGradeColumn, 'kind'>): CustomGradeColumnKind =>
  column.kind === 'assessment' ? 'assessment' : 'unit';

export const isActiveCustomGradeColumn = (column: Pick<CustomGradeColumn, 'archivedAt'>) =>
  !column.archivedAt;

export const customGradeColumnsForClass = (
  columns: CustomGradeColumn[],
  semester: GradeSemester,
  classroom?: Pick<ClassRoom, 'id' | 'programId'>,
) => columns.filter((column) =>
  isActiveCustomGradeColumn(column) &&
  column.semester === semester &&
  (!column.programId && !column.classId ||
    Boolean(classroom) && (column.programId === classroom?.programId || column.classId === classroom?.id)),
);

export const gradeColumnIdsForClass = (
  columns: CustomGradeColumn[],
  semester: GradeSemester,
  classroom?: Pick<ClassRoom, 'id' | 'programId'>,
) => [
  ...GRADE_SEMESTER_CONFIG[semester].defaultUnits.map((unit) => unit.key),
  ...customGradeColumnsForClass(columns, semester, classroom).map((column) => column.id),
];

export const normalizeCustomGradeColumns = (value: unknown): CustomGradeColumn[] => {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.filter((column): column is CustomGradeColumn => {
    if (!isValidCustomGradeColumn(column) || ids.has(column.id)) return false;
    ids.add(column.id);
    return true;
  });
};
