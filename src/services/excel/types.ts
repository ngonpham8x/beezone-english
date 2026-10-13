import type {
  AttendanceSession,
  ClassRoom,
  CourseProgram,
  Grade,
  Room,
  Student,
  Teacher,
  TimetableSlot,
  TuitionReceipt,
} from '../../types';
export interface ExcelExportData {
  attendanceSessions?: AttendanceSession[];
  centerName: string;
  programs: CourseProgram[];
  students: Student[];
  classes: ClassRoom[];
  teachers: Teacher[];
  rooms: Room[];
  receipts: TuitionReceipt[];
  grades: Grade[];
}

export interface ImportedStudentRow extends Partial<Student> {
  classCode?: string;
}

export interface ImportValidationResult {
  validRows: ImportedStudentRow[];
  errors: { row: number; field: string; message: string }[];
}

export interface CenterWorkbookData {
  attendanceSessions?: AttendanceSession[];
  programs: CourseProgram[];
  teachers: Teacher[];
  rooms: Room[];
  classes: ClassRoom[];
  students: Student[];
  timetableSlots: TimetableSlot[];
  grades: Grade[];
  receipts: TuitionReceipt[];
}

export interface CenterWorkbookImportResult {
  data?: CenterWorkbookData;
  errors: { row: number; field: string; message: string }[];
}

export interface MasterDirectPaymentInput {
  paidAmount: number;
  debtAmount: number;
  paymentKind: TuitionReceipt['paymentKind'];
  billingPeriod: string;
  paymentDate: string;
  paymentMethod: TuitionReceipt['paymentMethod'];
}

export type ImportError = CenterWorkbookImportResult['errors'][number];
export type ImportStageResult<T> =
  | { data: T; errors?: never }
  | { data?: never; errors: ImportError[] };
