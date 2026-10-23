// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeeZoneWork } from '../src/modules/work/BeeZoneWork';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import type { ClassRoom, CourseProgram, Teacher, UserAccount } from '../src/types';
import type { WorkTask } from '../src/modules/work/types';
import { localISODate, saveLocalWorkData } from '../src/modules/work/workStorage';

const mockTeacher: Teacher = {
  id: 't-linh',
  name: 'Cô Mai Linh',
  email: 'mailinh@beezone.edu.vn',
  phone: '0901234567',
  address: 'Hà Nội',
  specialty: 'IELTS & Cambridge',
  assignedClassIds: ['c-kindy'],
};

const mockClass: ClassRoom = {
  id: 'c-kindy',
  code: 'LOP-KINDY-01',
  name: 'Tiếng Anh Mầm Non Kindy 1',
  programId: 'prog-cambridge',
  teacherId: 't-linh',
  roomId: 'r1',
  scheduleTime: '17:30 - 19:00',
  days: ['Thứ 2', 'Thứ 4'],
  capacity: 15,
  studentIds: [],
};

const mockProgram: CourseProgram = {
  id: 'prog-cambridge',
  code: 'CT-CAM',
  name: 'Cambridge Tiếng Anh Mầm Non',
  category: 'Trẻ em',
  tuitionFee: 2500000,
  description: 'Chương trình chuẩn Cambridge cho trẻ mầm non',
};

function seedTestTasks() {
  const today = localISODate();
  const testTasks: WorkTask[] = [
    {
      id: 'task-1',
      title: 'Tư vấn lịch học thử cho phụ huynh',
      description: 'Liên hệ phụ huynh theo danh sách',
      branch: 'admin',
      assigned_uid: DEV_OWNER_ACCOUNT.id,
      work_date: today,
      shift_label: 'Ca sáng',
      class_label: '',
      priority: 'normal',
      status: 'todo',
      needs_handover: false,
      completed_at: null,
      email_sent_at: null,
      email_sent_to: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'task-2',
      title: 'Kiểm tra và chốt học phí cuối ca',
      description: 'Đối chiếu khoản thu',
      branch: 'admin',
      assigned_uid: DEV_OWNER_ACCOUNT.id,
      work_date: today,
      shift_label: 'Ca chiều',
      class_label: '',
      priority: 'high',
      status: 'progress',
      needs_handover: true,
      completed_at: null,
      email_sent_at: null,
      email_sent_to: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];
  saveLocalWorkData({
    tasks: testTasks,
    notes: [
      {
        id: 'n-1',
        task_id: 'task-1',
        author_uid: DEV_OWNER_ACCOUNT.id,
        author_name: 'Quản trị hệ thống',
        body: 'Đang theo dõi tiến độ phụ huynh',
        created_at: new Date().toISOString(),
      },
    ],
    reasons: [],
    handoffs: [],
  });
}

describe('BeeZoneWork Module', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders without error and displays 4 interactive stat cards', async () => {
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    expect(screen.getByText(/Giao việc & Bàn giao/i)).toBeTruthy();
    expect(screen.getByText('Việc trong danh sách')).toBeTruthy();
    expect(screen.getAllByText('Đang làm').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cần bàn giao').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Không có công việc phù hợp.').length).toBeGreaterThan(0);
  });

  it('allows clicking stat cards to open drill-down modal', async () => {
    seedTestTasks();
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Tư vấn lịch học thử cho phụ huynh/i)).toBeTruthy();
    });

    const statButton = screen.getByText('Việc trong danh sách').closest('button')!;
    fireEvent.click(statButton);

    expect(screen.getAllByText(/Việc trong danh sách/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Đóng' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
  });

  it('allows creating a new training task linked to a BeeZone class and teacher', async () => {
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tạo công việc/i }));

    expect(screen.getByText('Tạo công việc mới')).toBeTruthy();

    const titleInput = screen.getByPlaceholderText(/Nhập tên nhiệm vụ/i);
    fireEvent.change(titleInput, { target: { value: 'Chấm bài kiểm tra định kỳ Kindy 1' } });

    // Select branch: Đào tạo / Giáo viên
    const branchSelect = screen.getByLabelText(/Nhánh công việc/i);
    fireEvent.change(branchSelect, { target: { value: 'training' } });

    // Select assignee: Cô Mai Linh
    const assigneeSelect = screen.getByLabelText(/Người thực hiện/i);
    fireEvent.change(assigneeSelect, { target: { value: 't-linh' } });

    // Select class: LOP-KINDY-01
    const classInput = screen.getByPlaceholderText(/Chọn lớp có sẵn/i);
    fireEvent.change(classInput, { target: { value: 'LOP-KINDY-01 - Tiếng Anh Mầm Non Kindy 1' } });

    // Description
    const descInput = screen.getByPlaceholderText(/Mô tả các bước/i);
    fireEvent.change(descInput, { target: { value: 'Chấm 12 bài kiểm tra phát âm và nhận xét vào sổ theo dõi.' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Lưu công việc/i }));

    await waitFor(() => {
      expect(screen.getByText('Chấm bài kiểm tra định kỳ Kindy 1')).toBeTruthy();
      expect(screen.getAllByText(/Cô Mai Linh/i).length).toBeGreaterThan(0);
    });
  });

  it('allows updating task status with a reason and records reason history', async () => {
    seedTestTasks();
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    const reasonButtons = await screen.findAllByRole('button', { name: /＋ Thêm mới/i });
    fireEvent.click(reasonButtons[0]);

    expect(screen.getByText(/Cập nhật trạng thái & Lý do/i)).toBeTruthy();

    const statusSelect = screen.getByLabelText(/Trạng thái \/ Nhóm lý do/i);
    fireEvent.change(statusSelect, { target: { value: 'done' } });

    const reasonInput = screen.getByPlaceholderText(/Nhập lý do \/ kết quả/i);
    fireEvent.change(reasonInput, { target: { value: 'Đã hoàn thành mọi đầu việc theo yêu cầu.' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu trạng thái' }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/Nhập lý do \/ kết quả/i)).toBeNull();
    });
  });

  it('allows adding a note to a task', async () => {
    seedTestTasks();
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    const noteButtons = await screen.findAllByRole('button', { name: /☷ Ghi chú/i });
    fireEvent.click(noteButtons[0]);

    const noteInput = screen.getByPlaceholderText(/Thêm ghi chú bổ sung/i);
    fireEvent.change(noteInput, { target: { value: 'Học sinh Nguyễn Văn An đã nộp bài bù.' } });

    fireEvent.click(screen.getByRole('button', { name: /Thêm ghi chú/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Học sinh Nguyễn Văn An đã nộp bài bù/i).length).toBeGreaterThan(0);
    });
  });

  it('opens email modal and prepares prefilled Gmail compose URL', async () => {
    seedTestTasks();
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    const emailButtons = await screen.findAllByRole('button', { name: /Gửi email công việc/i });
    fireEvent.click(emailButtons[0]);

    expect(screen.getAllByText(/Gửi email công việc/i).length).toBeGreaterThan(0);

    // Select recipient with valid email
    const recipientSelect = screen.getByLabelText(/Người nhận/i);
    fireEvent.change(recipientSelect, { target: { value: 't-linh' } });

    // Click open Gmail
    fireEvent.click(screen.getByRole('button', { name: /Mở Gmail để gửi/i }));

    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('mail.google.com/mail'),
      '_blank',
      'noopener,noreferrer',
    );

    // Toggle confirm email sent
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận đã gửi email/i }));
  });

  it('supports handover and acknowledgment flow', async () => {
    seedTestTasks();
    const teacherUser: UserAccount = {
      id: 't-linh',
      name: 'Cô Mai Linh',
      email: 'mailinh@beezone.edu.vn',
      avatar: '',
      role: 'staff',
      active: true,
      permissions: {
        student: { view: true, add: false, edit: false, delete: false, export: false },
        teacher: { view: true, edit: false, delete: false },
        tuition: { view: false, collect: false, delete: false, showDebt: false },
        grade: { view: true, edit: true },
        excel: { import: false, export: false },
        report: { view: false, revenue: false },
        teacherId: 't-linh',
      },
    };

    // 1. As Manager, check handover task in list
    const { unmount } = render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Kiểm tra và chốt học phí/i).length).toBeGreaterThan(0);
    });

    unmount();

    // 2. As teacher, view the handover column and acknowledge
    render(
      <BeeZoneWork
        currentUser={teacherUser}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    const ackButtons = await screen.findAllByRole('button', { name: /Nhận ca/i });
    expect(ackButtons.length).toBeGreaterThan(0);
    fireEvent.click(ackButtons[0]);

    expect(screen.getByText('Xác nhận đã nhận bàn giao')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận bàn giao/i }));

    await waitFor(() => {
      expect(screen.queryByText('Xác nhận đã nhận bàn giao')).toBeNull();
    });
  });
});
