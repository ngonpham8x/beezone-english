// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GradeManager } from '../src/modules/grades/GradeManager';
import { StudentManager } from '../src/modules/students/StudentManager';
import { LanguageProvider } from '../src/context/LanguageContext';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { StudentProfileDialog } from '../src/modules/students/StudentProfileDialog';
import { ShareReviewDialog } from '../src/modules/attendance/ShareReviewDialog';
import { canShareSessionReview } from '../src/modules/attendance/access';
import * as initial from '../src/mock/initialData';
import { DEV_OWNER_ACCOUNT, DEV_TRAINER_ACCOUNT } from '../src/lib/auth';
import type { AttendanceSession, ClassRoom, CustomGradeColumn, Grade, Student, UserAccount } from '../src/types';
import * as dialogs from '../src/lib/dialogs';

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

  it('allows all three CKII assessment scores to be typed manually from an empty semester', () => {
    const updates = vi.fn();
    const Harness = () => {
      const [grades, setGrades] = React.useState<Grade[]>([]);
      return <GradeManager
        students={[{ ...dummyStudent, classId: dummyClass.id }]}
        classes={[dummyClass]}
        grades={grades}
        programs={[]}
        teachers={[]}
        settings={{} as any}
        permissions={{ grade: { view: true, edit: true } } as any}
        isOwner
        currentUser={DEV_OWNER_ACCOUNT}
        onUpdateGrade={(updated) => {
          updates(updated);
          setGrades((current) => [...current.filter((grade) => grade.id !== updated.id), updated]);
        }}
      />;
    };
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Chọn học kỳ CKII' }));

    const enter = (label: RegExp, value: string) => {
      const input = screen.getByLabelText(label);
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    };
    enter(new RegExp(`Nghe - ${dummyStudent.code}`, 'i'), '9');
    // After the first save the untouched field is 0. Mobile browsers may send
    // 010 if the selection collapses, which must still commit as 10.
    enter(new RegExp(`Nói - ${dummyStudent.code}`, 'i'), '010');
    enter(new RegExp(`Đọc và Viết - ${dummyStudent.code}`, 'i'), '8,5');

    expect(updates).toHaveBeenLastCalledWith(expect.objectContaining({
      semester: 'CKII',
      listening: 9,
      speaking: 10,
      readingWriting: 8.5,
      average: 2.8,
    }));
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
      average: 2.4,
      semester: 'GKI',
    }));
  });

  it('supports manual scores, adding both custom column kinds, safe deletion, comments and yearly summary', async () => {
    const onUpdateGrade = vi.fn();
    const onUpdateGradeColumns = vi.fn((_columns: CustomGradeColumn[]) => true);
    const program = initial.initialPrograms.find((item) => item.id === dummyClass.programId)!;
    const Harness = () => {
      const [grades, setGrades] = React.useState<Grade[]>([]);
      const [settings, setSettings] = React.useState<any>({ gradeColumns: [] });
      return (
        <GradeManager
          students={[{ ...dummyStudent, classId: dummyClass.id }]}
          classes={[dummyClass]}
          grades={grades}
          programs={[program]}
          teachers={[]}
          settings={settings}
          permissions={{ grade: { view: true, add: true, edit: true, delete: true, export: true } } as any}
          isOwner={true}
          currentUser={DEV_OWNER_ACCOUNT}
          onUpdateGrade={(updated) => {
            onUpdateGrade(updated);
            setGrades((current) => [...current.filter((grade) => grade.id !== updated.id), updated]);
          }}
          onUpdateGradeColumns={(columns) => {
            onUpdateGradeColumns(columns);
            setSettings((current: any) => ({ ...current, gradeColumns: columns }));
            return true;
          }}
        />
      );
    };
    render(<Harness />);

    const unitInput = screen.getByLabelText(new RegExp(`UNIT 1 - ${dummyStudent.code}`, 'i'));
    fireEvent.change(unitInput, { target: { value: '8,5' } });
    fireEvent.blur(unitInput);
    expect(onUpdateGrade).toHaveBeenCalledWith(expect.objectContaining({ unitScores: { unit1: 8.5 } }));

    fireEvent.click(screen.getByRole('button', { name: /Thêm \/ xóa cột/i }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Cột điểm \/ bài kiểm tra/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /Tên cột bài hoặc UNIT/i }), { target: { value: 'UNIT 13' } });
    fireEvent.change(screen.getByRole('textbox', { name: /Tên cột điểm hoặc bài kiểm tra/i }), { target: { value: 'Progress Test 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm 2 cột/i }));
    expect(onUpdateGradeColumns).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: 'UNIT 13', kind: 'unit', programId: program.id, semester: 'GKI' }),
      expect.objectContaining({ name: 'Progress Test 1', kind: 'assessment', programId: program.id, semester: 'GKI' }),
    ]));
    fireEvent.click(screen.getAllByRole('button', { name: /^Đóng$/i }).at(-1)!);
    const customScore = screen.getByLabelText(new RegExp(`UNIT 13 - ${dummyStudent.code}`, 'i'));
    fireEvent.change(customScore, { target: { value: '7,5' } });
    fireEvent.blur(customScore);
    expect(onUpdateGrade).toHaveBeenLastCalledWith(expect.objectContaining({ average: 0 }));

    const confirmDelete = vi.spyOn(dialogs, 'askConfirmation').mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Thêm \/ xóa cột/i }));
    fireEvent.click(screen.getAllByRole('button', { name: /Xóa cột UNIT 13/i })[0]);
    await waitFor(() => expect(onUpdateGradeColumns).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: 'UNIT 13', archivedAt: expect.any(String) }),
    ])));
    expect(confirmDelete).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: /^Đóng$/i }).at(-1)!);
    expect(screen.queryByLabelText(new RegExp(`UNIT 13 - ${dummyStudent.code}`, 'i'))).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Thêm nhận xét/i }));
    const comment = screen.getByRole('textbox', { name: new RegExp(`Nhận xét lực học - ${dummyStudent.code}`, 'i') });
    fireEvent.change(comment, { target: { value: 'Bé tiến bộ rõ và chủ động hơn trong giờ học.' } });
    fireEvent.click(screen.getByRole('button', { name: /Lưu nhận xét/i }));
    expect(onUpdateGrade).toHaveBeenLastCalledWith(expect.objectContaining({ comment: 'Bé tiến bộ rõ và chủ động hơn trong giờ học.' }));
    expect(screen.getByRole('button', { name: /^Xóa$/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Xem tổng kết cuối năm/i }));
    expect(screen.getByText(/Tổng kết năng lực cuối năm/i)).toBeTruthy();
    expect(screen.getAllByText(/Tạm tính 1\/4 kỳ/i).length).toBeGreaterThan(0);
  });

  it('allows trainer account (phongdaotao) to click add/remove columns, tick both UNIT and assessment, and create 2 columns', async () => {
    const onUpdateGradeColumns = vi.fn((_columns: CustomGradeColumn[]) => true);
    const program = initial.initialPrograms.find((item) => item.id === dummyClass.programId)!;
    render(
      <GradeManager
        students={[{ ...dummyStudent, classId: dummyClass.id }]}
        classes={[dummyClass]}
        grades={[]}
        programs={[program]}
        teachers={[]}
        settings={{ gradeColumns: [] } as any}
        permissions={DEV_TRAINER_ACCOUNT.permissions}
        isOwner={false}
        currentUser={DEV_TRAINER_ACCOUNT}
        onUpdateGrade={() => {}}
        onUpdateGradeColumns={onUpdateGradeColumns}
      />
    );

    // The button must NOT be disabled for trainer
    const addColBtn = screen.getByRole('button', { name: /Thêm \/ xóa cột/i }) as HTMLButtonElement;
    expect(addColBtn.disabled).toBe(false);
    fireEvent.click(addColBtn);

    // Dialog opens with two selectable options
    expect(screen.getByText(/Thêm \/ xóa cột bài học & cột điểm/i)).toBeTruthy();
    const columnDialog = screen.getByRole('dialog', { name: /Quản lý cột bài và cột điểm/i });
    expect(columnDialog.className).toContain('fixed');
    expect(columnDialog.className).toContain('inset-0');
    expect(columnDialog.className).toContain('z-50');

    // Check "Cột điểm / bài kiểm tra" in addition to "Cột bài / UNIT" (both checked)
    const unitCheck = screen.getByRole('checkbox', { name: /Cột bài \/ UNIT/i }) as HTMLInputElement;
    const assessCheck = screen.getByRole('checkbox', { name: /Cột điểm \/ bài kiểm tra/i }) as HTMLInputElement;
    expect(unitCheck.checked).toBe(true);
    expect(assessCheck.checked).toBe(false);

    fireEvent.click(assessCheck);
    expect(assessCheck.checked).toBe(true);

    // Enter names for both columns
    const unitInput = screen.getByRole('textbox', { name: /Tên cột bài hoặc UNIT/i });
    const assessInput = screen.getByRole('textbox', { name: /Tên cột điểm hoặc bài kiểm tra/i });
    fireEvent.change(unitInput, { target: { value: 'UNIT 7' } });
    fireEvent.change(assessInput, { target: { value: 'Midterm Review' } });

    // Submit the 2 columns
    const submitBtn = screen.getByRole('button', { name: /Thêm 2 cột/i });
    fireEvent.click(submitBtn);

    expect(onUpdateGradeColumns).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ name: 'UNIT 7', kind: 'unit', programId: program.id }),
      expect.objectContaining({ name: 'Midterm Review', kind: 'assessment', programId: program.id }),
    ]));
  });

  it('keeps add/remove column button accessible to read-only viewers with informative notice', () => {
    const program = initial.initialPrograms.find((item) => item.id === dummyClass.programId)!;
    render(
      <GradeManager
        students={[{ ...dummyStudent, classId: dummyClass.id }]}
        classes={[dummyClass]}
        grades={[]}
        programs={[program]}
        teachers={[]}
        settings={{ gradeColumns: [] } as any}
        permissions={{ grade: { view: true, edit: false } } as any}
        isOwner={false}
        currentUser={{ id: 'view-only', name: 'Khách', role: 'teacher', active: true, permissions: { grade: { view: true, edit: false } } } as any}
        onUpdateGrade={() => {}}
      />
    );

    const btn = screen.getByRole('button', { name: /Thêm \/ xóa cột/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);

    expect(screen.getByText(/Bạn đang ở chế độ xem/i)).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: /Tên cột bài hoặc UNIT/i })).toBeNull();
  });

  it('displays friendly class names without raw CLASS_uuid in StudentManager using allClasses lookup', () => {
    const rawClassId = 'CLASS_ed2c5265-4180-4597-9599-250d6f14759a';
    const classKiddy3D: ClassRoom = {
      ...dummyClass,
      id: rawClassId,
      name: 'Kiddy 3D',
    };
    const classKiddy3A: ClassRoom = {
      ...dummyClass,
      id: 'cls-kiddy3a',
      name: 'Kiddy 3A',
    };
    const multiClassStudent: Student = {
      ...dummyStudent,
      classId: rawClassId,
      additionalClassIds: [classKiddy3A.id],
    };

    // Scoped classes for teacher only includes Kiddy 3A, but center allClasses has both Kiddy 3D and 3A
    render(
      <LanguageProvider>
        <StudentManager
          students={[multiClassStudent]}
          classes={[classKiddy3A]}
          allClasses={[classKiddy3D, classKiddy3A]}
          programs={[]}
          receipts={[]}
          timetableSlots={[]}
          permissions={DEV_OWNER_ACCOUNT.permissions}
          isOwner={true}
          searchQuery=""
          onAddStudent={vi.fn()}
          onUpdateStudent={vi.fn()}
          onDeleteStudent={vi.fn()}
          onCreateProgram={vi.fn()}
          onOpenImportExportModal={vi.fn()}
          onOpenTuition={vi.fn()}
        />
      </LanguageProvider>
    );

    // It must render 'Kiddy 3D · Kiddy 3A' and NOT contain raw UUID 'CLASS_ed2c5265'
    expect(screen.getByText('Kiddy 3D · Kiddy 3A')).toBeTruthy();
    expect(screen.queryByText(new RegExp(rawClassId, 'i'))).toBeNull();
  });

  it('supports direct edit/delete buttons on header and renaming a custom column in GradeManager', async () => {
    const onUpdateGradeColumns = vi.fn((_columns: CustomGradeColumn[]) => true);
    const customCol: CustomGradeColumn = {
      id: 'col_unit_special',
      name: 'UNIT Extra',
      kind: 'unit',
      semester: 'GKI',
      programId: dummyClass.programId,
      createdAt: '2026-10-25T00:00:00.000Z',
    };

    render(
      <GradeManager
        students={[{ ...dummyStudent, classId: dummyClass.id }]}
        classes={[dummyClass]}
        grades={[]}
        programs={initial.initialPrograms}
        teachers={[]}
        settings={{ gradeColumns: [customCol] } as any}
        permissions={DEV_OWNER_ACCOUNT.permissions}
        isOwner={true}
        currentUser={DEV_OWNER_ACCOUNT}
        onUpdateGrade={() => {}}
        onUpdateGradeColumns={onUpdateGradeColumns}
      />
    );

    // Edit and delete buttons appear directly on the column header for managers
    const editBtn = screen.getByRole('button', { name: /Sửa tên cột UNIT Extra/i });
    const deleteBtn = screen.getByRole('button', { name: /Xóa cột UNIT Extra/i });
    expect(editBtn).toBeTruthy();
    expect(deleteBtn).toBeTruthy();

    // Click edit -> dialog opens
    fireEvent.click(editBtn);
    expect(screen.getByText(/Sửa tên cột/i)).toBeTruthy();

    // Change name and submit update
    const input = screen.getByRole('textbox', { name: /Tên cột mới/i });
    fireEvent.change(input, { target: { value: 'UNIT 3.5' } });
    fireEvent.click(screen.getByRole('button', { name: /Cập nhật/i }));

    expect(onUpdateGradeColumns).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'col_unit_special', name: 'UNIT 3.5' }),
    ]));
  });

  it('allows editing scores and clearing scores cleanly without snapping back or failing validation', () => {
    const onUpdateGrade = vi.fn((_grade: Grade) => true);
    const existingGrade: Grade = {
      id: 'grd_test_clearing',
      studentId: dummyStudent.id,
      classId: dummyClass.id,
      semester: 'CKII',
      listening: 0.1,
      speaking: 0.1,
      readingWriting: 0,
      reading: 0,
      writing: 0,
      midterm: 0,
      finalExam: 0,
      attendance: 10,
      average: 0.1,
      comment: '',
    };

    render(
      <GradeManager
        students={[{ ...dummyStudent, classId: dummyClass.id }]}
        classes={[dummyClass]}
        grades={[existingGrade]}
        programs={initial.initialPrograms}
        teachers={[]}
        settings={{ gradeColumns: [] } as any}
        permissions={DEV_OWNER_ACCOUNT.permissions}
        isOwner={true}
        currentUser={DEV_OWNER_ACCOUNT}
        onUpdateGrade={onUpdateGrade}
      />
    );

    // Switch to CKII semester
    const ckiiBtn = screen.getByRole('button', { name: /Học kỳ CKII/i });
    fireEvent.click(ckiiBtn);

    // Find the listening score input (currently 0.1)
    const listeningInput = screen.getByRole('textbox', {
      name: new RegExp(`Nghe.*${dummyStudent.code}`, 'i'),
    }) as HTMLInputElement;
    expect(listeningInput.value).toBe('0.1');

    // User edits score to 8.5
    fireEvent.change(listeningInput, { target: { value: '8.5' } });
    fireEvent.blur(listeningInput);

    expect(onUpdateGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: dummyStudent.id,
        classId: dummyClass.id,
        semester: 'CKII',
        listening: 8.5,
      }),
    );

    // User clears score completely back to blank
    fireEvent.change(listeningInput, { target: { value: '' } });
    fireEvent.blur(listeningInput);

    expect(onUpdateGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: dummyStudent.id,
        classId: dummyClass.id,
        semester: 'CKII',
        listening: undefined,
      }),
    );

    // Keyboard focus (including Tab navigation) replaces the selected score
    // immediately, without relying on the browser preserving its selection.
    const speakingInput = screen.getByRole('textbox', {
      name: new RegExp(`Nói.*${dummyStudent.code}`, 'i'),
    }) as HTMLInputElement;
    fireEvent.focus(speakingInput);
    fireEvent.keyDown(speakingInput, { key: 'ArrowDown', code: 'Numpad2' });
    expect(speakingInput.value).toBe('2');
    fireEvent.blur(speakingInput);
    expect(onUpdateGrade).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: dummyStudent.id,
        classId: dummyClass.id,
        semester: 'CKII',
        speaking: 2,
      }),
    );
  });

  it('keeps score inputs editable for an active owner even if the screen owner flag is stale', () => {
    const onUpdateGrade = vi.fn((_grade: Grade) => true);
    const ownerWithStalePermissions: UserAccount = {
      ...DEV_OWNER_ACCOUNT,
      permissions: {
        ...DEV_OWNER_ACCOUNT.permissions,
        grade: { view: true, edit: false },
      },
    };
    render(
      <GradeManager
        students={[{ ...dummyStudent, classId: dummyClass.id }]}
        classes={[dummyClass]}
        grades={[]}
        programs={initial.initialPrograms}
        teachers={[]}
        settings={{ gradeColumns: [] } as any}
        permissions={ownerWithStalePermissions.permissions}
        isOwner={false}
        currentUser={ownerWithStalePermissions}
        onUpdateGrade={onUpdateGrade}
      />
    );

    const listeningInput = screen.getByRole('textbox', {
      name: new RegExp(`Nghe.*${dummyStudent.code}`, 'i'),
    }) as HTMLInputElement;
    expect(listeningInput.disabled).toBe(false);
    fireEvent.focus(listeningInput);
    fireEvent.change(listeningInput, { target: { value: '6,5' } });
    fireEvent.blur(listeningInput);
    expect(onUpdateGrade).toHaveBeenCalledWith(expect.objectContaining({ listening: 6.5 }));
  });

  it('separates custom unit columns and assessment columns into respective groups in all classes mode', () => {
    const unitCol: CustomGradeColumn = {
      id: 'col_u_test',
      name: 'UNIT 3+',
      kind: 'unit',
      semester: 'GKI',
      programId: dummyClass.programId,
      createdAt: '2026-10-25T00:00:00.000Z',
    };
    const assessCol: CustomGradeColumn = {
      id: 'col_a_test',
      name: 'Mini Test 1',
      kind: 'assessment',
      semester: 'GKI',
      programId: dummyClass.programId,
      createdAt: '2026-10-25T00:00:00.000Z',
    };

    render(
      <GradeManager
        students={[{ ...dummyStudent, classId: dummyClass.id }]}
        classes={[dummyClass]}
        grades={[]}
        programs={initial.initialPrograms}
        teachers={[]}
        settings={{ gradeColumns: [unitCol, assessCol] } as any}
        permissions={DEV_OWNER_ACCOUNT.permissions}
        isOwner={true}
        currentUser={DEV_OWNER_ACCOUNT}
        onUpdateGrade={() => {}}
      />
    );

    // Header must show 4 columns under assessment header (3 exam + 1 custom assessment)
    expect(screen.getByText(/GKI \(4 CỘT ĐIỂM THI ĐÁNH GIÁ\)/i)).toBeTruthy();

    // Custom unit is displayed under UNIT group
    expect(screen.getByText('UNIT 3+')).toBeTruthy();
    // Custom assessment is displayed under exam skills group
    expect(screen.getByText('Mini Test 1')).toBeTruthy();
  });
});
