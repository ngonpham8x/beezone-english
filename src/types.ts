/** `staff` is retained only so cached sessions and pre-migration profiles remain readable. */
export type UserRole = 'owner' | 'admin' | 'trainer' | 'teacher' | 'staff';
export type AccountRole = Exclude<UserRole, 'staff'>;

export interface StaffPermissions {
  student: { view: boolean; add: boolean; edit: boolean; delete: boolean; export: boolean };
  teacher: { view: boolean; add?: boolean; edit: boolean; delete: boolean };
  tuition: { view: boolean; collect: boolean; delete: boolean; showDebt: boolean };
  grade: { view: boolean; edit: boolean };
  excel: { import: boolean; export: boolean };
  report: { view: boolean; revenue: boolean };
  // Missing on older profiles: academic management must be explicitly granted.
  academic?: { programs: boolean; classes: boolean; rooms: boolean } & Partial<Record<`${'programs' | 'classes' | 'rooms'}${'Add' | 'Edit' | 'Delete'}`, boolean>>;
  assignedClassIds?: string[];
  teacherId?: string;
}

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: UserRole;
  active: boolean;
  isPrivate?: boolean;
  permissions: StaffPermissions;
}

export type StudentStatus = 'active' | 'reserved' | 'dropped' | 'lead' | 'trial' | 'registered';
// 'active': Đang học
// 'reserved': Bảo lưu
// 'dropped': Nghỉ học
// 'lead': Tiềm năng / Tư vấn
// 'trial': Học thử
// 'registered': Đã đăng ký (chờ xếp lớp)
export type FeeStatus = 'paid' | 'unpaid' | 'debt' | 'partial';
export type TuitionPaymentKind = 'course' | 'monthly' | 'session';
export type SessionAbsencePolicy = 'attended' | 'unexcused' | 'all';

export interface Student {
  id: string;
  code: string; // e.g., HS001
  name: string;
  avatar?: string;
  dob: string;
  gender: 'Nam' | 'Nữ' | 'Chưa xác định';
  school: string;
  gradeLevel: string; // Khối 1..12
  programId: string;
  additionalProgramIds?: string[];
  classId: string;
  /** Optional extra memberships; classId remains the primary class for legacy backups. */
  additionalClassIds?: string[];
  address: string;
  email: string;
  phone: string;
  parentName: string;
  parentPhone: string;
  enrollDate: string;
  notes?: string;
  status: StudentStatus;
  feeStatus: FeeStatus;
}

export interface CourseProgram {
  id: string;
  code: string;
  name: string;
  category: 'Cấp 1' | 'Cấp 2' | 'Cấp 3' | 'Cambridge' | 'IELTS' | 'TOEIC' | 'TOEFL' | 'Family and Friends' | 'Kỹ Năng & Thể Chất' | 'Khác' | string;
  tuitionFee: number;
  description?: string;
}

export interface Teacher {
  id: string;
  name: string;
  avatar?: string;
  phone: string;
  email: string;
  address: string;
  specialty: string;
  assignedClassIds: string[];
  scheduleNotes?: string;
  notes?: string;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  status: 'available' | 'maintenance';
  notes?: string;
}

export interface ClassRoom {
  id: string;
  code: string;
  name: string;
  programId: string;
  additionalProgramIds?: string[];
  teacherId: string;
  roomId: string;
  scheduleTime: string; // e.g., "18:00 - 19:30"
  days: string[]; // e.g., ["Thứ 2", "Thứ 4", "Thứ 6"]
  capacity: number;
  studentIds: string[];
  startDate?: string;
  endDate?: string;
  totalSessions?: number;
  courseStatus?: 'planned' | 'active' | 'paused' | 'completed';
  completedDate?: string;
  billingMode?: TuitionPaymentKind;
  sessionRate?: number;
  sessionBillingStartDate?: string;
  sessionAbsencePolicy?: SessionAbsencePolicy;
  notes?: string;
  note?: string;
}

export interface ClassEnrollment {
  id: string;
  studentId: string;
  classId: string;
  status: 'active' | 'reserved' | 'completed' | 'transferred' | 'dropped';
  startDate?: string;
  endDate?: string;
}

/** A dated exception leaves the recurring weekly timetable intact. */
export interface ScheduleChange {
  id: string;
  classId: string;
  kind: 'cancel' | 'move' | 'extra' | 'teacher_off';
  date: string;
  sourceDate?: string;
  sourceSlotId?: string;
  startTime: string;
  endTime: string;
  teacherId: string;
  roomId: string;
  reason: string;
  substituteTeacherId?: string;
}

export interface TimetableSlot {
  id: string;
  classId: string;
  teacherId: string;
  roomId: string;
  dayOfWeek: string; // 'Thứ 2' | 'Thứ 3' | ... | 'Chủ Nhật'
  startTime: string; // "17:30"
  endTime: string;   // "19:00"
  note?: string;
}

export type GradeSemester = 'GKI' | 'CKI' | 'GKII' | 'CKII';

export type CustomGradeColumnKind = 'unit' | 'assessment';

export interface CustomGradeColumn {
  id: string;
  name: string;
  semester: GradeSemester;
  /** Curriculum scope. New columns use this so every class on the same program stays aligned. */
  programId?: string;
  /** Legacy scope retained so browser-only columns from older builds remain readable. */
  classId?: string;
  /** Missing on legacy columns; those columns are interpreted as UNIT columns. */
  kind?: CustomGradeColumnKind;
  createdAt?: string;
  /** Soft deletion keeps historic scores restorable while removing the column from entry and averages. */
  archivedAt?: string;
}

export interface Grade {
  id: string;
  studentId: string;
  classId: string;
  semester?: GradeSemester;
  listening: number;
  speaking: number;
  readingWriting?: number;
  reading: number;
  writing: number;
  midterm: number;
  finalExam: number;
  attendance: number;
  unitScores?: Record<string, number>;
  average: number;
  comment?: string;
}

export interface TuitionInstallment {
  id: string;
  code?: string;
  invoiceNo?: string;
  bookNo?: string;
  invoiceBook?: string;
  date: string; // YYYY-MM-DD
  amount: number;
  paymentMethod?: 'Tiền mặt' | 'Chuyển khoản' | 'Thẻ' | 'Chưa xác định';
  collectorName?: string;
  notes?: string;
}

export interface TuitionReceipt {
  id: string;
  code: string; // e.g. PT-2026-001
  invoiceNo?: string;
  bookNo?: string;
  invoiceBook?: string;
  studentId: string;
  classId: string;
  courseFee: number;
  // The course price and the monthly price are retained independently so a
  // receipt can clearly state what the family is paying for.
  monthlyFee?: number;
  paymentKind?: TuitionPaymentKind;
  billingPeriod?: string; // YYYY-MM, used for monthly tuition reports
  dueDate?: string;
  discount: number;
  paidAmount: number;
  debtAmount: number;
  status?: FeeStatus;
  paymentDate: string;
  collectorName: string;
  paymentMethod: 'Tiền mặt' | 'Chuyển khoản' | 'Thẻ' | 'Chưa xác định';
  notes?: string;
  installments?: TuitionInstallment[];
  sessionFee?: number;
  sessionLines?: SessionChargeLine[];
}

export interface SessionChargeLine {
  attendanceSessionId: string;
  date: string;
  unitPrice: number;
}

export interface SessionBillingSnapshot {
  unitPrice: number;
  absencePolicy: SessionAbsencePolicy;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  userEmail: string;
  userName: string;
  action: 'ĐĂNG NHẬP' | 'THÊM' | 'SỬA' | 'XÓA' | 'EXPORT' | 'IMPORT' | 'BACKUP' | 'RESTORE' | 'ĐỒNG BỘ';
  module: string;
  details: string;
}

export type AccountAuditAction =
  | 'ACCOUNT_PROVISIONED'
  | 'ACCOUNT_UPDATED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED';

export interface AccountAuditLog {
  id: string;
  occurredAt: string;
  action: AccountAuditAction;
  actorName: string;
  targetName: string;
  targetRole: UserRole | null;
  details: string;
}

export interface SystemBackup {
  id: string;
  filename: string;
  timestamp: string;
  sizeKb: number;
  type: 'Thủ công' | 'Tự động Hằng Ngày' | 'Tự động Hằng Tuần';
  status: 'Thành công' | 'Thất bại';
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  sheetName: string;
  autoSync: boolean;
  syncInterval: 'realtime' | 'daily' | 'weekly';
  lastSync?: string;
  connected: boolean;
}

export interface CenterSettings {
  name: string;
  slogan: string;
  address: string;
  phone: string;
  email: string;
  secondaryEmail?: string;
  adminReportEmail: string;
  autoEmailReport: boolean;
  autoBackup: boolean;
  sheetsConfig: GoogleSheetsConfig;
  gradeColumns?: CustomGradeColumn[];
}

// Quản lý Điểm danh & Buổi học
export type AttendanceStatus = 'present' | 'absent' | 'excused' | 'late';
export type LearningAttitude = 'excellent' | 'good' | 'normal' | 'needs_focus' | 'needs_support';

export interface AttendanceStudentEntry {
  studentId: string;
  status: AttendanceStatus;
  /** Nhận xét diễn biến học tập trên lớp; giữ tên `note` để tương thích dữ liệu cũ. */
  note?: string;
  homeworkCompleted?: boolean;
  /** Dặn dò hoặc bài tập về nhà riêng gửi phụ huynh học viên. */
  homeworkAssignment?: string;
  /** Đánh giá nhanh của giáo viên cho buổi học, từ 1 đến 5 sao. */
  rating?: number;
  learningAttitude?: LearningAttitude;
  /** Điểm riêng của buổi học, từ 0 đến 10. */
  sessionScore?: number;
}

export interface AttendanceSession {
  id: string;
  classId: string;
  date: string; // YYYY-MM-DD
  lessonTopic: string;
  teacherId?: string;
  entries: AttendanceStudentEntry[];
  generalNotes?: string;
  billing?: SessionBillingSnapshot;
}

// The complete center dataset saved in an offline JSON backup. Keeping this
// contract separate from the UI makes the restore path explicit and avoids
// silently omitting related records such as rooms or timetable slots.
export interface CenterBackupData {
  sessionBillingVersion?: 1;
  settings: CenterSettings;
  programs: CourseProgram[];
  teachers: Teacher[];
  rooms: Room[];
  classes: ClassRoom[];
  students: Student[];
  timetableSlots: TimetableSlot[];
  grades: Grade[];
  receipts: TuitionReceipt[];
  backups: SystemBackup[];
  activityLogs: ActivityLog[];
  attendanceSessions?: AttendanceSession[];
  enrollments?: ClassEnrollment[];
  scheduleChanges?: ScheduleChange[];
}

