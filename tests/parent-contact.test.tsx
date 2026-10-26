// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEV_OWNER_ACCOUNT, DEV_TEACHER_ACCOUNT } from '../src/lib/auth';
import { centerDate } from '../src/lib/dates';
import * as initial from '../src/mock/initialData';
import { AttendanceManager } from '../src/modules/attendance/AttendanceManager';
import { ParentContactDialog } from '../src/modules/attendance/ParentContactDialog';
import {
  appendParentContact,
  canContactParent,
  parentPhoneHref,
  retainContactHistory,
  sessionReviewMessage,
  splitAttendanceNote,
} from '../src/modules/attendance/parentContact';
import type { AttendanceSession, AttendanceStatus, UserAccount } from '../src/types';
import { chooseOption } from './helpers/select';

const classroom = { ...initial.initialClasses[0], name: 'Lớp kiểm tra' };
const student = {
  ...initial.initialStudents[0],
  classId: classroom.id,
  name: 'Học viên kiểm tra',
  parentName: 'Phụ huynh kiểm tra',
  parentPhone: '0900 000 000',
  status: 'active' as const,
};
const now = new Date('2026-10-13T18:30:05Z');
const contactNote = appendParentContact(
  'Cần ôn bài',
  'Zalo',
  'Phụ huynh báo con bị ốm',
  'Giáo viên kiểm tra',
  now,
);
const session = (status: AttendanceStatus = 'absent', note = ''): AttendanceSession => ({
  id: 'contact-session',
  classId: classroom.id,
  date: centerDate(),
  lessonTopic: 'Speaking',
  entries: [{ studentId: student.id, status, homeworkCompleted: true, note }],
});
let viewportWidth = 320;
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: Boolean(
        /max-width:\s*(\d+)px/.exec(query)?.[1] &&
          viewportWidth <= Number(/max-width:\s*(\d+)px/.exec(query)![1]),
      ),
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

describe('manual parent contact rules', () => {
  it('creates an explicit current absence alert with the lesson details for parents', () => {
    const message = sessionReviewMessage(
      student,
      classroom.name,
      '2026-10-25',
      'Trung tâm BeeZone',
      {
        studentId: student.id,
        status: 'absent',
        note: 'Chưa rõ lý do vắng',
        homeworkAssignment: 'Bổ sung Workbook trang 18',
      },
      'Unit 5: Wild Animals',
      'Ôn lại từ vựng của Unit 5',
      'Cô Thảo Linh',
    );

    expect(message).toContain('THÔNG BÁO HỌC VIÊN VẮNG MẶT');
    expect(message).toContain('Hiện tại');
    expect(message).toContain(`${student.name} CHƯA CÓ MẶT`);
    expect(message).toContain('Trạng thái chuyên cần: VẮNG MẶT');
    expect(message).toContain('Giáo viên phụ trách: Cô Thảo Linh');
    expect(message).toContain('Dặn dò / BTVN chung của lớp');
    expect(message).not.toContain('Điểm số bài học');
  });

  it('preserves teacher notes, Vietnam time and contact history across later edits', () => {
    const parsed = splitAttendanceNote(contactNote);
    expect(parsed.text).toBe('Cần ôn bài');
    expect(parsed.history[0]).toMatchObject({
      time: '2026-10-14 01:30:05',
      channel: 'Zalo',
      author: 'Giáo viên kiểm tra',
    });
    const changed = retainContactHistory('Nhận xét mới', contactNote);
    expect(splitAttendanceNote(changed).text).toBe('Nhận xét mới');
    expect(splitAttendanceNote(changed).history).toEqual(parsed.history);
    expect(retainContactHistory(changed, contactNote)).toBe(changed);
    expect(splitAttendanceNote('[Liên hệ PH | invalid] Nhận xét cũ').text).toContain('invalid');
    expect(retainContactHistory('  Nhận xét cũ  ')).toBe('  Nhận xét cũ  ');
  });
  it('uses explicit class assignment and active edit permission, matching SQL', () => {
    const user: UserAccount = {
      ...DEV_TEACHER_ACCOUNT,
      permissions: { ...DEV_TEACHER_ACCOUNT.permissions, teacherId: '', assignedClassIds: [] },
    };
    expect(canContactParent(user, classroom)).toBe(false);
    expect(
      canContactParent(
        { ...user, permissions: { ...user.permissions, assignedClassIds: [classroom.id] } },
        classroom,
      ),
    ).toBe(true);
    expect(canContactParent({ ...DEV_OWNER_ACCOUNT, active: false }, classroom)).toBe(false);
    expect(parentPhoneHref('+84 (900) 000-000')).toBe('tel:+84900000000');
    for (const invalid of ['', '0900#1234', 'javascript:alert(1)', '123'])
      expect(parentPhoneHref(invalid)).toBeNull();
  });
});

it.each([320, 1366])(
  'requires a saved absence and retains access to history after correcting attendance at %spx',
  async (width) => {
    viewportWidth = width;
    const record = vi.fn(() => null);
    function Harness() {
      const [sessions, setSessions] = useState<AttendanceSession[]>([session('present')]);
      return (
        <AttendanceManager
          classes={[classroom]}
          students={[student]}
          teachers={[]}
          attendanceSessions={sessions}
          onSaveSession={(value) => {
            setSessions([value]);
            return true;
          }}
          onRecordParentContact={record}
          isOwner
          currentUser={DEV_OWNER_ACCOUNT}
          centerName="Trung tâm kiểm tra"
        />
      );
    }
    const rendered = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: /^Vắng(?: mặt)?$/ }));
    expect(
      (
        screen.getByRole('button', {
          name: `Báo phụ huynh của ${student.name}`,
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Lưu Điểm Danh/ }));
    const contactButton = screen.getByRole('button', { name: `Báo phụ huynh của ${student.name}` });
    expect((contactButton as HTMLButtonElement).disabled).toBe(false);
    contactButton.focus();
    fireEvent.click(contactButton);
    const dialog = screen.getByRole('dialog', { name: 'Báo phụ huynh học viên vắng' });
    expect(document.activeElement).toBe(dialog);
    expect(
      (screen.getByLabelText('Nội dung gửi phụ huynh') as HTMLTextAreaElement).value,
    ).toContain('Trung tâm kiểm tra');
    expect(
      (screen.getByLabelText('Nội dung gửi phụ huynh') as HTMLTextAreaElement).value,
    ).toContain('CHƯA CÓ MẶT');
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    fireEvent.click(screen.getByRole('button', { name: 'Sao chép' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Đã sao chép'));
    expect(record).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Gọi phụ huynh' }).getAttribute('href')).toBe(
      'tel:0900000000',
    );
    await chooseOption(
      screen.getByRole('combobox', { name: 'Kênh liên hệ phụ huynh' }),
      'Điện thoại',
    );
    fireEvent.change(screen.getByLabelText('Kết quả liên hệ / phản hồi'), {
      target: { value: 'Đã gọi, phụ huynh xác nhận' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Tôi đã liên hệ/ }));
    expect(record).toHaveBeenCalledWith({
      sessionId: 'contact-session',
      studentId: student.id,
      channel: 'Điện thoại',
      details: 'Đã gọi, phụ huynh xác nhận',
    });
    expect(
      (screen.getByRole('button', { name: /Tôi đã liên hệ/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(contactButton);
    rendered.unmount();
    render(
      <AttendanceManager
        classes={[classroom]}
        students={[student]}
        teachers={[]}
        attendanceSessions={[session('present', contactNote)]}
        onSaveSession={vi.fn()}
        onRecordParentContact={record}
        isOwner
        currentUser={DEV_OWNER_ACCOUNT}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: `Lịch sử liên hệ phụ huynh của ${student.name}` }),
    );
    expect(screen.getByRole('region', { name: 'Lịch sử liên hệ phụ huynh' }).textContent).toContain(
      'Phụ huynh báo con bị ốm',
    );
    expect(screen.queryByRole('button', { name: /Tôi đã liên hệ/ })).toBeNull();
  },
);

it('keeps unsaved remarks until attendance is saved and excludes contact lines from the remark input', () => {
  viewportWidth = 320;
  render(
    <AttendanceManager
      classes={[classroom]}
      students={[student]}
      teachers={[]}
      attendanceSessions={[session('absent', contactNote)]}
      onSaveSession={vi.fn()}
      onRecordParentContact={vi.fn(() => null)}
      isOwner
      currentUser={DEV_OWNER_ACCOUNT}
    />,
  );
  const note = screen.getByLabelText(`Ghi chú điểm danh của ${student.name}`) as HTMLTextAreaElement;
  expect(note.value).toBe('Cần ôn bài');
  fireEvent.change(note, { target: { value: 'Chưa lưu nhận xét' } });
  fireEvent.click(screen.getByRole('button', { name: /Lịch sử liên hệ phụ huynh/ }));
  expect(screen.getAllByText('Lưu điểm danh trước khi báo phụ huynh.').length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', { name: /Tôi đã liên hệ/ })).toBeNull();
  expect(note.value).toBe('Chưa lưu nhận xét');
});

it('reports clipboard failure, missing phone and record rejection without claiming contact success', async () => {
  const record = vi.fn(() => 'Buổi điểm danh đã thay đổi.');
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
  });
  render(
    <ParentContactDialog
      student={{ ...student, parentPhone: '' }}
      session={session()}
      className={classroom.name}
      centerName="Test"
      canRecord
      unavailableReason=""
      onRecord={record}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole('link', { name: 'Gọi phụ huynh' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sao chép' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain('Chưa sao chép được'),
  );
  expect(record).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Tôi đã liên hệ/ }));
  expect(screen.getByRole('status').textContent).toBe('Buổi điểm danh đã thay đổi.');
  expect(
    (screen.getByRole('button', { name: /Tôi đã liên hệ/ }) as HTMLButtonElement).disabled,
  ).toBe(false);
});
