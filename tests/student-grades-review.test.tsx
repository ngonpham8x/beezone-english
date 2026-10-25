// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { StudentProfileDialog } from '../src/modules/students/StudentProfileDialog';
import { ShareReviewDialog } from '../src/modules/attendance/ShareReviewDialog';
import { canShareSessionReview } from '../src/modules/attendance/access';
import * as initial from '../src/mock/initialData';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import type { AttendanceSession, ClassRoom, Grade, Student, UserAccount } from '../src/types';

describe('Teacher comments & grades in StudentProfileDialog', () => {
  const dummyStudent: Student = {
    ...initial.initialStudents[0],
    id: 'st-01',
    code: 'TS001',
    name: 'Nguyễn Hoàng Gia Linh',
  };

  const dummyClass: ClassRoom = {
    ...initial.initialClasses[0],
    id: 'cls-01',
    name: 'Kiddy 3A',
  };

  const dummyGrades: Grade[] = [
    {
      id: 'grd-01',
      studentId: 'st-01',
      classId: 'cls-01',
      listening: 9,
      speaking: 8.5,
      reading: 9,
      writing: 8,
      midterm: 8.5,
      finalExam: 9,
      attendance: 10,
      average: 8.7,
      comment: 'Bé nắm vững từ vựng, phát âm chuẩn và phản xạ tiếng Anh rất tự tin trên lớp.',
    },
  ];

  const dummySessions: AttendanceSession[] = [
    {
      id: 'ses-01',
      classId: 'cls-01',
      date: '2026-10-25',
      lessonTopic: 'Unit 5: Wild Animals & Habitats',
      entries: [
        {
          studentId: 'st-01',
          status: 'present',
          homeworkCompleted: true,
          note: 'Hăng hái phát biểu, phát âm tốt [Liên hệ PH | 2026-10-25 10:00:00 | Zalo | Cô Lan] Đã trao đổi',
          rating: 5,
          learningAttitude: 'excellent',
          sessionScore: 9,
          homeworkAssignment: 'Làm bài tập trang 42 sách Workbook',
        },
      ],
    },
  ];

  it('renders student grades and teacher comment on academic performance', () => {
    render(
      <StudentProfileDialog
        student={dummyStudent}
        classes={[dummyClass]}
        programs={[]}
        teachers={[]}
        rooms={[]}
        timetableSlots={[]}
        receipts={[]}
        enrollments={[]}
        grades={dummyGrades}
        attendanceSessions={dummySessions}
        onClose={vi.fn()}
      />,
    );

    // Bảng Điểm & Đánh Giá Năng Lực Học Viên
    expect(screen.getByText(/Bảng Điểm & Đánh Giá Năng Lực Học Viên/i)).toBeTruthy();
    expect(screen.getByText('8.7')).toBeTruthy();
    expect(screen.getAllByText(/Xuất sắc/i).length).toBeGreaterThan(0);

    // Teacher comment
    expect(
      screen.getByText(/Bé nắm vững từ vựng, phát âm chuẩn và phản xạ tiếng Anh rất tự tin trên lớp./i),
    ).toBeTruthy();

    // Recent session reviews from attendance
    expect(screen.getByText(/Unit 5: Wild Animals & Habitats/i)).toBeTruthy();
    expect(screen.getByText(/Hăng hái phát biểu, phát âm tốt/i)).toBeTruthy();
    expect(screen.getByText(/Làm bài tập trang 42 sách Workbook/i)).toBeTruthy();
  });
});

describe('ShareReviewDialog & permissions', () => {
  const dummyStudent: Student = {
    ...initial.initialStudents[0],
    id: 'st-02',
    code: 'TS002',
    name: 'Lê Trần Ái Vy',
    parentPhone: '0974497030',
  };

  const dummyClass: ClassRoom = {
    ...initial.initialClasses[0],
    id: 'cls-01',
    name: 'Kiddy 3D',
    teacherId: 'tc-01',
  };

  it('allows owner, admin, trainer and assigned teacher to share review', () => {
    const owner: UserAccount = {
      ...DEV_OWNER_ACCOUNT,
      id: 'acc-1',
      name: 'Chủ Trung Tâm',
      role: 'owner',
    };
    const admin: UserAccount = {
      ...DEV_OWNER_ACCOUNT,
      id: 'acc-2',
      name: 'Hành Chính',
      role: 'admin',
      permissions: { student: { view: true, add: true, edit: true, delete: true, export: true }, teacher: { view: true, add: true, edit: true, delete: true } } as any,
    };
    const trainer: UserAccount = {
      ...DEV_OWNER_ACCOUNT,
      id: 'acc-3',
      name: 'Đào Tạo',
      role: 'trainer',
      permissions: { student: { view: true, add: true, edit: true, delete: true, export: true }, teacher: { view: true, add: true, edit: true, delete: true } } as any,
    };
    const assignedTeacher: UserAccount = {
      ...DEV_OWNER_ACCOUNT,
      id: 'acc-4',
      name: 'Trần Ngọc Thảo Linh',
      role: 'teacher',
      permissions: { student: { view: true, add: false, edit: true, delete: false, export: false }, teacher: { view: true, add: false, edit: false, delete: false }, teacherId: 'tc-01' } as any,
    };
    const otherTeacher: UserAccount = {
      ...DEV_OWNER_ACCOUNT,
      id: 'acc-5',
      name: 'Nguyễn Văn B',
      role: 'teacher',
      permissions: { student: { view: true, add: false, edit: false, delete: false, export: false }, teacher: { view: true, add: false, edit: false, delete: false }, teacherId: 'tc-99' } as any,
    };

    expect(canShareSessionReview(owner, dummyClass, true)).toBe(true);
    expect(canShareSessionReview(admin, dummyClass)).toBe(true);
    expect(canShareSessionReview(trainer, dummyClass)).toBe(true);
    expect(canShareSessionReview(assignedTeacher, dummyClass)).toBe(true);
    expect(canShareSessionReview(otherTeacher, dummyClass)).toBe(false);
  });

  it('renders ShareReviewDialog with Zalo and SMS buttons', () => {
    render(
      <ShareReviewDialog
        student={dummyStudent}
        className="Kiddy 3D"
        sessionDate="2026-10-25"
        centerName="Trung tâm Ngoại ngữ BeeZone"
        lessonTopic="Lesson 12: Superheroes"
        entry={{
          studentId: 'st-02',
          status: 'present',
          homeworkCompleted: true,
          rating: 5,
          learningAttitude: 'excellent',
          sessionScore: 10,
          note: 'Bé phát âm rất chuẩn và thuộc hết từ mới',
          homeworkAssignment: 'Viết 5 câu miêu tả nhân vật yêu thích',
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText('Chia sẻ nhận xét buổi học')).toBeTruthy();
    expect(screen.getAllByText(/Lê Trần Ái Vy/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Mở Zalo gửi phụ huynh/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Gửi SMS/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sao chép/i })).toBeTruthy();
  });
});
