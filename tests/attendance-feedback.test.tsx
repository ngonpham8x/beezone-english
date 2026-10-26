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
  it('keeps class-wide lesson details collapsed until requested', () => {
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

    expect(screen.queryByLabelText('Chủ đề bài học / Giáo trình hôm nay')).toBeNull();
    expect(screen.queryByLabelText('Nội dung dặn dò / BTVN chung cả lớp')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nội dung buổi học' }));
    expect(screen.getByLabelText('Chủ đề bài học / Giáo trình hôm nay')).toBeTruthy();
    expect(screen.getByLabelText('Nội dung dặn dò / BTVN chung cả lớp')).toBeTruthy();
  });

  it('keeps the roster compact and saves optional feedback only when expanded', () => {
    const onSave = vi.fn((_session: AttendanceSession) => true);
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
    expect(screen.queryByRole('button', { name: '+ Phát biểu tốt' })).toBeNull();
    expect(screen.queryByLabelText(`Thái độ học tập của ${student.name}`)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dặn dò & đánh giá thêm' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Phát biểu tốt' }));
    expect(note.value).toBe('Bé hiểu bài, Phát biểu tốt');

    fireEvent.change(
      screen.getByLabelText(`Nội dung dặn dò hoặc bài tập về nhà riêng của ${student.name}`),
      { target: { value: 'Luyện đọc trang 12 và gửi ghi âm cho cô.' } },
    );
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
            learningAttitude: 'excellent',
            sessionScore: 9.5,
          }),
        ],
      }),
    );
    expect(onSave.mock.calls[0]?.[0].entries[0]?.rating).toBeUndefined();
  });

  it('preserves a legacy star rating while saving the simplified attendance form', () => {
    const onSave = vi.fn((_session: AttendanceSession) => true);
    const previous: AttendanceSession = {
      id: 'legacy-rating-session',
      classId: classroom.id,
      date: centerDate(),
      lessonTopic: 'Speaking',
      entries: [{
        studentId: student.id,
        status: 'present',
        homeworkCompleted: true,
        note: 'Nhận xét cũ',
        rating: 5,
      }],
    };
    render(
      <AttendanceManager
        classes={[classroom]}
        students={[student]}
        teachers={[teacher]}
        attendanceSessions={[previous]}
        onSaveSession={onSave}
        isOwner
      />,
    );

    fireEvent.change(screen.getByLabelText(`Nhận xét trên lớp của ${student.name}`), {
      target: { value: 'Nhận xét đã cập nhật' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Lưu Điểm Danh & Nhận Xét Đã Sửa/i })[0]);
    expect(onSave.mock.calls[0]?.[0].entries[0]).toMatchObject({
      note: 'Nhận xét đã cập nhật',
      rating: 5,
    });
  });

  it('allows sending before attendance is saved and records history after a saved absence', async () => {
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
    fireEvent.change(screen.getByLabelText(`Nhận xét trên lớp của ${student.name}`), {
      target: { value: 'Nội dung giáo viên vừa nhập, chưa lưu điểm danh.' },
    });
    const immediateShare = screen.getByRole('button', {
      name: `Chia sẻ nhận xét buổi học của ${student.name} cho phụ huynh`,
    });
    expect((immediateShare as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(immediateShare);
    expect(screen.getByText(/không cần lưu điểm danh trước/i)).toBeTruthy();
    expect((screen.getByPlaceholderText('Nhập nội dung tin nhắn gửi phụ huynh...') as HTMLTextAreaElement).value)
      .toContain('Nội dung giáo viên vừa nhập, chưa lưu điểm danh.');
    expect((screen.getByPlaceholderText('Nhập nội dung tin nhắn gửi phụ huynh...') as HTMLTextAreaElement).value)
      .toContain('Chuyên cần: Chưa lưu điểm danh');
    fireEvent.click(screen.getByRole('button', { name: 'Mở Zalo gửi phụ huynh' }));
    expect(onRecord).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Xác nhận đã gửi qua Zalo/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng chia sẻ nhận xét' }));
    open.mockClear();

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
    expect(onRecord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã gửi qua Zalo' }));
    expect(onRecord).toHaveBeenCalledWith({
      sessionId: savedSession.id,
      studentId: student.id,
      channel: 'Zalo',
      type: 'review',
      details: 'Đã xác nhận gửi thông báo học viên vắng mặt qua Zalo.',
    });
    expect(open).toHaveBeenCalledWith('https://zalo.me/0974497030', '_blank', 'noopener,noreferrer');
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining('CHƯA CÓ MẶT')));
  });

  it('shows only essential fields by default and hides learning feedback when absent', () => {
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

    expect(screen.getByText('Nhận xét nhanh (không bắt buộc)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Phát biểu tốt' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dặn dò & đánh giá thêm' }));
    expect(screen.getByRole('button', { name: '+ Phát biểu tốt' })).toBeTruthy();
    expect(screen.queryByText(/Đánh giá sao/i)).toBeNull();
    expect(screen.getByLabelText(`Thái độ học tập của ${student.name}`)).toBeTruthy();
    expect(screen.getByLabelText(`Điểm buổi học của ${student.name}`)).toBeTruthy();
    expect(screen.getByText(/BTVN:\s*Có/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Vắng/ }));

    expect(screen.queryByRole('button', { name: '+ Phát biểu tốt' })).toBeNull();
    expect(screen.queryByLabelText(`Thái độ học tập của ${student.name}`)).toBeNull();
    expect(screen.queryByLabelText(`Điểm buổi học của ${student.name}`)).toBeNull();

    expect(screen.getByText('Lý do vắng / Ghi chú')).toBeTruthy();
    expect(screen.getByLabelText(`Ghi chú điểm danh của ${student.name}`)).toBeTruthy();
    expect(screen.getByText(/BTVN:\s*— \(Vắng\)/)).toBeTruthy();
    expect(screen.getByText('Báo vắng phụ huynh')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Có mặt/ }));
    expect(screen.getByText('Nhận xét nhanh (không bắt buộc)')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Phát biểu tốt' })).toBeTruthy();
    expect(screen.getByLabelText(`Thái độ học tập của ${student.name}`)).toBeTruthy();
    expect(screen.getByText(/BTVN:\s*Có/)).toBeTruthy();
  });
});
