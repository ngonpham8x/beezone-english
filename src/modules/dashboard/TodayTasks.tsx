import React from 'react';
import { isStudentInClass } from '../../lib/studentClasses';
import { centerDate } from '../../lib/dates';
import { addDays, lessonsOn, tuitionDueStatus } from '../../lib/operations';
import { isTeachingRole } from '../../lib/accountScope';
import type {
  AttendanceSession,
  ClassRoom,
  ScheduleChange,
  Student,
  Teacher,
  TimetableSlot,
  TuitionReceipt,
  UserAccount,
} from '../../types';

export interface TaskDestination {
  tab: 'attendance' | 'tuition' | 'classes' | 'students' | 'admissions';
  classId?: string;
  date?: string;
  studentId?: string;
  receiptId?: string;
}
interface Props {
  classes: ClassRoom[];
  students: Student[];
  slots: TimetableSlot[];
  changes: ScheduleChange[];
  attendance: AttendanceSession[];
  receipts: TuitionReceipt[];
  teachers: Teacher[];
  user: UserAccount;
  onOpen: (destination: TaskDestination) => void;
}
export function TodayTasks({
  classes,
  students,
  slots,
  changes,
  attendance,
  receipts,
  teachers,
  user,
  onOpen,
}: Props) {
  const today = centerDate();
  const owner = user.role === 'owner';
  const teacherAccount = isTeachingRole(user.role);
  const studentView = owner || user.permissions.student.view;
  const teacher = teachers.find(
    (t) =>
      t.id === user.permissions.teacherId ||
      (t.email && t.email.toLowerCase() === user.email.toLowerCase()),
  );
  const scoped = Boolean(teacher || user.permissions.assignedClassIds?.length);
  const visible = classes.filter(
    (c) =>
      owner ||
      (studentView && !scoped) ||
      user.permissions.assignedClassIds?.includes(c.id) ||
      c.teacherId === teacher?.id,
  );
  const lessons = lessonsOn(today, visible, slots, changes);
  const due =
    !teacherAccount && (owner || (user.permissions.tuition.view && user.permissions.tuition.showDebt))
      ? receipts
          .filter((r) => ['overdue', 'soon'].includes(tuitionDueStatus(r, today)))
          .sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))
      : [];
  const ending = visible.filter(
    (c) =>
      c.courseStatus !== 'completed' &&
      c.endDate &&
      c.endDate >= today &&
      c.endDate <= addDays(today, 14),
  );
  const absences = studentView
    ? students.filter(
        (s) =>
          s.status === 'active' &&
          visible.some((c) => isStudentInClass(s, c.id) &&
          attendance
            .filter(
              (a) =>
                a.classId === c.id &&
                a.date <= today &&
                a.entries.some((e) => e.studentId === s.id),
            )
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 2)
            .filter((a) =>
              a.entries.some(
                (e) => e.studentId === s.id && ['absent', 'excused'].includes(e.status),
              ),
            ).length === 2),
      )
    : [];
  const tile = (title: string, body: React.ReactNode) => (
    <div className="min-w-0 rounded-lg border border-slate-200 p-3">
      <h4 className="mb-2 text-xs font-semibold text-slate-800">{title}</h4>
      <div className="max-h-52 space-y-2 overflow-y-auto text-xs">{body}</div>
    </div>
  );
  const empty = <p className="text-xs text-slate-500">Không có việc cần xử lý.</p>;
  return (
    <section
      aria-label="Việc cần làm hôm nay"
      className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Việc cần làm hôm nay</h2>
          <p className="text-xs text-slate-500">
            {today.split('-').reverse().join('/')} · Học phí nhắc trước 7 ngày, đợt học nhắc trước
            14 ngày.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!teacherAccount && (owner || user.permissions.student.add) && (
            <button
              onClick={() => onOpen({ tab: 'admissions' })}
              className="rounded-lg bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950"
            >
              Thêm học viên
            </button>
          )}
        </div>
      </div>
      <div className="today-tasks-grid mt-3 grid items-start gap-3">
        {tile(
          `Lớp hôm nay (${lessons.length})`,
          lessons.length
            ? lessons.map((l) => {
                const recorded = attendance.some(
                  (a) => a.classId === l.classId && a.date === today,
                );
                return (
                  <button
                    key={l.id}
                    onClick={() => onOpen({ tab: 'attendance', classId: l.classId, date: today })}
                    className={`block w-full rounded-lg p-2 text-left ${recorded ? 'bg-emerald-50' : 'bg-amber-50'}`}
                  >
                    <strong className="block">
                      {visible.find((c) => c.id === l.classId)?.name}
                    </strong>
                    <span className="text-xs">
                      {l.startTime}–{l.endTime} · {recorded ? 'Đã điểm danh' : 'Chưa điểm danh'}
                    </span>
                  </button>
                );
              })
            : empty,
        )}
        {!teacherAccount && (owner || (user.permissions.tuition.view && user.permissions.tuition.showDebt)) &&
          tile(
            `Học phí cần nhắc (${due.length})`,
            due.length
              ? due.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onOpen({ tab: 'tuition', receiptId: r.id })}
                    className="block w-full rounded-lg bg-rose-50 p-2 text-left"
                  >
                    <strong className="block">
                      {students.find((s) => s.id === r.studentId)?.name || r.code}
                    </strong>
                    <span className="text-xs">
                      {r.debtAmount.toLocaleString('vi-VN')} đ ·{' '}
                      {tuitionDueStatus(r, today) === 'overdue' ? 'Quá hạn' : 'Sắp đến hạn'}{' '}
                      {r.dueDate}
                    </span>
                  </button>
                ))
              : empty,
          )}
        {studentView &&
          tile(
            `Nghỉ 2 buổi liên tiếp (${absences.length})`,
            absences.length
              ? absences.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onOpen({ tab: 'students', studentId: s.id })}
                    className="block w-full rounded-lg bg-orange-50 p-2 text-left"
                  >
                    <strong>{s.name}</strong>
                    <span className="block text-xs">
                      {teacherAccount
                        ? 'Theo dõi tình hình nghỉ học trong lớp phụ trách'
                        : `Liên hệ phụ huynh · ${s.parentPhone || s.phone || 'Chưa có số điện thoại'}`}
                    </span>
                  </button>
                ))
              : empty,
          )}
        {studentView && !teacherAccount &&
          tile(
            `Đợt học sắp kết thúc (${ending.length})`,
            ending.length
              ? ending.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => onOpen({ tab: 'classes', classId: c.id })}
                    className="block w-full rounded-lg bg-sky-50 p-2 text-left"
                  >
                    <strong>{c.name}</strong>
                    <span className="block text-xs">Kết thúc {c.endDate} · Chuẩn bị học tiếp</span>
                  </button>
                ))
              : empty,
          )}
      </div>
    </section>
  );
}
