// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { centerDate } from '../src/lib/dates';
import * as initial from '../src/mock/initialData';
import { AttendanceManager } from '../src/modules/attendance/AttendanceManager';
import type { AttendanceSession, ClassRoom, Student, Teacher } from '../src/types';

const classroom: ClassRoom = {
  ...initial.initialClasses[0],
  id: 'feedback-class',
  name: 'Kiddy 3D',
  teacherId: 'feedback-teacher',
  billingMode: 'monthly',
};

const student: Student = {
  ...initial.initialStudents[0],
  id: 'feedback-student',
  code: 'TS002',
  name: 'Lê Trần Ái Vy',
  classId: classroom.id,
  status: 'active',
  parentName: 'Mẹ Lan',
  parentPhone: '0974497030',
};

const teacher: Teacher = {
  ...initial.initialTeachers[0],
  id: 'feedback-teacher',
  name: 'Trần Ngọc Thảo Linh',
};

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('attendance feedback editor', () => {
  it('saves separate class remarks, private homework, stars, attitude and session score', () => {
    const onSave = vi.fn(() => true);
    render(
      <AttendanceManager
        classes={[classroom]}
        students={[student]}
        teachers={[teacher]}
        attendanceSessions={[]}
        onSaveSession={onSave}
        isOwner
      />,
    );

    const note = screen.getByLabelText(`Nhận xét trên lớp của ${student.name}`) as HTMLTextAreaElement;
    fireEvent.change(note, { target: { value: 'Bé hiểu bài, ,' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Phát biểu tốt' }));
    expect(note.value).toBe('Bé hiểu bài, Phát biểu tốt');

    fireEvent.change(
      screen.getByLabelText(`Nội dung dặn dò hoặc bài tập về nhà riêng của ${student.name}`),
      { target: { value: 'Luyện đọc trang 12 và gửi ghi âm cho cô.' } },
    );
    fireEvent.click(screen.getByRole('button', { name: `5 sao cho ${student.name}` }));
    fireEvent.change(screen.getByLabelText(`Thái độ học tập của ${student.name}`), {
      target: { value: 'excellent' },
    });
    fireEvent.change(screen.getByLabelText(`Điểm buổi học của ${student.name}`), {
      target: { value: '9.5' },
    });

    fireEvent.click(screen.getAllByRole('button', { name: /Lưu Điểm Danh & Nhận Xét/i })[0]);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            studentId: student.id,
            note: 'Bé hiểu bài, Phát biểu tốt',
            homeworkAssignment: 'Luyện đọc trang 12 và gửi ghi âm cho cô.',
            rating: 5,
            learningAttitude: 'excellent',
            sessionScore: 9.5,
          }),
        ],
      }),
    );
  });

  it('requires saved data before sharing and sends a clear absence notice with an audit event', async () => {
    const savedSession: AttendanceSession = {
      id: 'saved-feedback-session',
      classId: classroom.id,
      date: centerDate(),
      teacherId: teacher.id,
      lessonTopic: 'Unit 5: Wild Animals',
      generalNotes: 'Ôn lại từ vựng và làm Workbook trang 18.',
      entries: [{
        studentId: student.id,
        status: 'absent',
        homeworkCompleted: false,
        note: 'Chưa rõ lý do vắng',
        homeworkAssignment: 'Bổ sung bài luyện đọc trang 12.',
      }],
    };
    const onRecord = vi.fn(() => null);
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    const view = render(
      <AttendanceManager
        classes={[classroom]}
        students={[student]}
        teachers={[teacher]}
        attendanceSessions={[]}
        onSaveSession={vi.fn()}
        onRecordParentContact={onRecord}
        isOwner
      />,
    );
    expect(
      (screen.getByRole('button', { name: `Chia sẻ nhận xét buổi học của ${student.name} cho phụ huynh` }) as HTMLButtonElement).disabled,
    ).toBe(true);

    view.rerender(
      <AttendanceManager
        classes={[classroom]}
        students={[student]}
        teachers={[teacher]}
        attendanceSessions={[savedSession]}
        onSaveSession={vi.fn()}
        onRecordParentContact={onRecord}
        isOwner
      />,
    );

    const share = await screen.findByRole('button', {
      name: `Gửi thông báo vắng mặt của ${student.name} cho phụ huynh`,
    });
    expect((share as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(share);

    expect(screen.getByRole('dialog', { name: 'Thông báo phụ huynh học viên vắng mặt' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('đang vắng mặt');
    const message = screen.getByPlaceholderText('Nhập nội dung tin nhắn gửi phụ huynh...') as HTMLTextAreaElement;
    expect(message.value).toContain('THÔNG BÁO HỌC VIÊN VẮNG MẶT');
    expect(message.value).toContain(`${student.name} CHƯA CÓ MẶT`);
    expect(message.value).toContain(`Giáo viên phụ trách: ${teacher.name}`);
    expect(message.value).toContain('Dặn dò / BTVN chung của lớp');
    expect(screen.queryByText('⚠ BTVN: Chưa hoàn thành')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mở Zalo gửi phụ huynh' }));
    expect(onRecord).toHaveBeenCalledWith({
      sessionId: savedSession.id,
      studentId: student.id,
      channel: 'Zalo',
      type: 'review',
      details: 'Đã mở Zalo để gửi thông báo học viên đang vắng mặt.',
    });
    expect(open).toHaveBeenCalledWith('https://zalo.me/0974497030', '_blank', 'noopener,noreferrer');
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('CHƯA CÓ MẶT')));
  });

  it('hides in-class remarks, quick note tags, stars and scores when student is marked absent', () => {
    render(
      <AttendanceManager
        classes={[classroom]}
        students={[student]}
        teachers={[teacher]}
        attendanceSessions={[]}
        onSaveSession={vi.fn()}
        isOwner
      />,
    );

    // Ban đầu học sinh có mặt: hiển thị nhận xét trên lớp, quick notes, sao, thái độ, điểm
    expect(screen.getByText('Nhận xét trên lớp:')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Phát biểu tốt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: `5 sao cho ${student.name}` })).toBeTruthy();
    expect(screen.getByText(/BTVN:\s*Có/)).toBeTruthy();

    // Chuyển sang Vắng mặt:
    fireEvent.click(screen.getByRole('button', { name: /^Vắng/ }));

    // Ẩn hoàn toàn ô nhận xét trên lớp và quick tags
    expect(screen.queryByText('Nhận xét trên lớp:')).toBeNull();
    expect(screen.queryByRole('button', { name: '+ Phát biểu tốt' })).toBeNull();
    // Ẩn đánh giá sao, thái độ, điểm số
    expect(screen.queryByRole('button', { name: `5 sao cho ${student.name}` })).toBeNull();
    expect(screen.queryByLabelText(`Thái độ học tập của ${student.name}`)).toBeNull();
    expect(screen.queryByLabelText(`Điểm buổi học của ${student.name}`)).toBeNull();

    // Hiển thị ô Lý do vắng mặt / Ghi chú & banner vắng mặt
    expect(screen.getByText(/Lý do vắng mặt \/ Ghi chú:/)).toBeTruthy();
    expect(screen.getByText(/Học viên vắng mặt buổi này/)).toBeTruthy();
    expect(screen.getByText(/BTVN:\s*— \(Vắng\)/)).toBeTruthy();

    // Nút báo vắng hiển thị rõ ràng
    expect(screen.getByText('📲 Báo vắng cho PH (Zalo/SMS)')).toBeTruthy();

    // Chuyển lại Có mặt: nhận xét trên lớp xuất hiện lại
    fireEvent.click(screen.getByRole('button', { name: /^Có mặt/ }));
    expect(screen.getByText('Nhận xét trên lớp:')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Phát biểu tốt' })).toBeTruthy();
    expect(screen.getByRole('button', { name: `5 sao cho ${student.name}` })).toBeTruthy();
    expect(screen.getByText(/BTVN:\s*Có/)).toBeTruthy();
  });
});
