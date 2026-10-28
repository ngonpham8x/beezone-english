// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GradeManager } from '../src/modules/grades/GradeManager';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { StudentProfileDialog } from '../src/modules/students/StudentProfileDialog';
import { ShareReviewDialog } from '../src/modules/attendance/ShareReviewDialog';
import { canShareSessionReview } from '../src/modules/attendance/access';
import * as initial from '../src/mock/initialData';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import type { AttendanceSession, ClassRoom, Grade, Student, UserAccount } from '../src/types';

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

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

  it('edits the teacher comment directly from the student profile', () => {
    const onUpdateGrade = vi.fn(() => true);
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
        onUpdateGrade={onUpdateGrade}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Sửa nhận xét cho Kiddy 3A/i }));
    const editor = screen.getByRole('textbox', { name: 'Nội dung nhận xét lực học' });
    fireEvent.change(editor, { target: { value: '  Bé tiến bộ rõ rệt và cần luyện nói thêm.  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu nhận xét/i }));

    expect(onUpdateGrade).toHaveBeenCalledWith(expect.objectContaining({
      id: 'grd-01',
      comment: 'Bé tiến bộ rõ rệt và cần luyện nói thêm.',
    }));
    expect(screen.queryByRole('textbox', { name: 'Nội dung nhận xét lực học' })).toBeNull();
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
          status: 'excused',
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
    expect(screen.getByText('Nghỉ có phép')).toBeTruthy();
    expect(screen.getAllByText(/Lê Trần Ái Vy/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /Mở Zalo gửi phụ huynh/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Gửi SMS/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sao chép/i })).toBeTruthy();
  });

  it('allows teacher to enter and update comment on student academic performance in GradeManager', () => {
    const onUpdateGrade = vi.fn();
    render(
      <GradeManager
        students={[{ ...dummyStudent, classId: dummyClass.id }]}
        classes={[dummyClass]}
        grades={[]}
        programs={[]}
        teachers={[]}
        settings={{} as any}
        permissions={{ grade: { view: true, add: true, edit: true, delete: true, export: true } } as any}
        isOwner={true}
        currentUser={DEV_OWNER_ACCOUNT}
        onUpdateGrade={onUpdateGrade}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Thêm nhận xét/i }));
    const commentInput = screen.getByRole('textbox', { name: new RegExp(`Nhận xét lực học - ${dummyStudent.code}`, 'i') });
    expect(commentInput).toBeTruthy();

    fireEvent.change(commentInput, {
      target: { value: 'Bé nắm vững ngữ pháp, cần tự tin hơn khi nói.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Lưu nhận xét/i }));

    expect(onUpdateGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: dummyStudent.id,
        classId: dummyClass.id,
        comment: 'Bé nắm vững ngữ pháp, cần tự tin hơn khi nói.',
      }),
    );
  });

  it('switches between GKI, CKI, GKII, CKII semesters and displays corresponding unit columns and GPA label', () => {
    const onUpdateGrade = vi.fn();
    render(
      <GradeManager
        students={[{ ...dummyStudent, classId: dummyClass.id }]}
        classes={[dummyClass]}
        grades={[]}
        programs={[]}
        teachers={[]}
        settings={{} as any}
        permissions={{ grade: { view: true, add: true, edit: true, delete: true, export: true } } as any}
        isOwner={true}
        currentUser={DEV_OWNER_ACCOUNT}
        onUpdateGrade={onUpdateGrade}
      />,
    );

    // Initial semester is GKI: has UNIT 1, UNIT 2, UNIT 3, ĐTBGKI
    expect(screen.getByText('UNIT 1')).toBeTruthy();
    expect(screen.getByText('UNIT 2')).toBeTruthy();
    expect(screen.getByText('UNIT 3')).toBeTruthy();
    expect(screen.getByText('ĐTBGKI')).toBeTruthy();

    // Switch to CKI
    fireEvent.click(screen.getByRole('button', { name: 'Chọn học kỳ CKI' }));
    expect(screen.getByText('UNIT 4')).toBeTruthy();
    expect(screen.getByText('UNIT 5')).toBeTruthy();
    expect(screen.getByText('UNIT 6')).toBeTruthy();
    expect(screen.getByText('ĐTBCKI')).toBeTruthy();

    // Switch to GKII
    fireEvent.click(screen.getByRole('button', { name: 'Chọn học kỳ GKII' }));
    expect(screen.getByText('UNIT 7')).toBeTruthy();
    expect(screen.getByText('UNIT 8')).toBeTruthy();
    expect(screen.getByText('UNIT 9')).toBeTruthy();
    expect(screen.getByText('ĐTBGKII')).toBeTruthy();

    // Switch to CKII
    fireEvent.click(screen.getByRole('button', { name: 'Chọn học kỳ CKII' }));
    expect(screen.getByText('UNIT 10')).toBeTruthy();
    expect(screen.getByText('UNIT 11')).toBeTruthy();
    expect(screen.getByText('UNIT 12')).toBeTruthy();
    expect(screen.getByText('ĐTBCKII')).toBeTruthy();
  });

  it('calculates average GPA based on 3 exam columns: Listening, Speaking, Reading & Writing', () => {
    const onUpdateGrade = vi.fn();
    const initialGrade: Grade = {
      id: 'grade-gki', studentId: dummyStudent.id, classId: dummyClass.id, semester: 'GKI',
      listening: 0, speaking: 0, readingWriting: 0, reading: 0, writing: 0,
      midterm: 0, finalExam: 0, attendance: 0, average: 0, unitScores: {},
    };
    const Harness = () => {
      const [grades, setGrades] = React.useState<Grade[]>([initialGrade]);
      return <GradeManager
        students={[{ ...dummyStudent, classId: dummyClass.id }]}
        classes={[dummyClass]}
        grades={grades}
        programs={[]}
        teachers={[]}
        settings={{} as any}
        permissions={{ grade: { view: true, add: true, edit: true, delete: true, export: true } } as any}
        isOwner={true}
        currentUser={DEV_OWNER_ACCOUNT}
        onUpdateGrade={(updated) => {
          onUpdateGrade(updated);
          setGrades([updated]);
        }}
      />;
    };
    render(<Harness />);

    const listeningInput = screen.getByLabelText(new RegExp(`Nghe - ${dummyStudent.code}`, 'i'));
    const speakingInput = screen.getByLabelText(new RegExp(`Nói - ${dummyStudent.code}`, 'i'));
    const readingWritingInput = screen.getByLabelText(new RegExp(`Đọc và Viết - ${dummyStudent.code}`, 'i'));

    expect(listeningInput).toBeTruthy();
    expect(speakingInput).toBeTruthy();
    expect(readingWritingInput).toBeTruthy();

    fireEvent.change(listeningInput, { target: { value: '9' } });
    fireEvent.blur(listeningInput);
    fireEvent.change(speakingInput, { target: { value: '8' } });
    fireEvent.blur(speakingInput);
    fireEvent.change(readingWritingInput, { target: { value: '7' } });
    fireEvent.blur(readingWritingInput);
    expect(onUpdateGrade).toHaveBeenLastCalledWith(expect.objectContaining({
      listening: 9,
      speaking: 8,
      readingWriting: 7,
      average: 8,
      semester: 'GKI',
    }));
  });

  it('supports manual UNIT input, expandable comment editing and yearly summary without the custom-column button', () => {
    const onUpdateGrade = vi.fn();
    const Harness = () => {
      const [grades, setGrades] = React.useState<Grade[]>([]);
      return (
        <GradeManager
          students={[{ ...dummyStudent, classId: dummyClass.id }]}
          classes={[dummyClass]}
          grades={grades}
          programs={[]}
          teachers={[]}
          settings={{} as any}
          permissions={{ grade: { view: true, add: true, edit: true, delete: true, export: true } } as any}
          isOwner={true}
          currentUser={DEV_OWNER_ACCOUNT}
          onUpdateGrade={(updated) => {
            onUpdateGrade(updated);
            setGrades((current) => [...current.filter((grade) => grade.id !== updated.id), updated]);
          }}
        />
      );
    };
    render(<Harness />);

    expect(screen.queryByRole('button', { name: /Thêm cột điểm/i })).toBeNull();
    const unitInput = screen.getByLabelText(new RegExp(`UNIT 1 - ${dummyStudent.code}`, 'i'));
    fireEvent.change(unitInput, { target: { value: '8,5' } });
    fireEvent.blur(unitInput);
    expect(onUpdateGrade).toHaveBeenCalledWith(expect.objectContaining({ unitScores: { unit1: 8.5 } }));

    fireEvent.click(screen.getByRole('button', { name: /Thêm nhận xét/i }));
    const comment = screen.getByRole('textbox', { name: new RegExp(`Nhận xét lực học - ${dummyStudent.code}`, 'i') });
    fireEvent.change(comment, { target: { value: 'Bé tiến bộ rõ và chủ động hơn trong giờ học.' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu nhận xét/i }));
    expect(onUpdateGrade).toHaveBeenLastCalledWith(expect.objectContaining({ comment: 'Bé tiến bộ rõ và chủ động hơn trong giờ học.' }));
    expect(screen.getByRole('button', { name: /Xóa/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Xem tổng kết cuối năm/i }));
    expect(screen.getByText(/Tổng kết năng lực cuối năm/i)).toBeTruthy();
    expect(screen.getAllByText(/Tạm tính 1\/4 kỳ/i).length).toBeGreaterThan(0);
  });
});
