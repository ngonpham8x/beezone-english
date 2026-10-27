// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BeeZoneWork } from '../src/modules/work/BeeZoneWork';
import { ACCOUNT_DIRECTORY_CHANGED_EVENT } from '../src/lib/appEvents';
import { DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import type { ClassRoom, CourseProgram, Room, Teacher, TimetableSlot, UserAccount } from '../src/types';
import type { WorkPerson, WorkTask } from '../src/modules/work/types';
import { buildWorkPeople, fetchWorkModuleData, getAssignableWorkPeople, loadLocalWorkData, localISODate, prepareLocalWorkSync, saveLocalWorkData, syncWorkModuleData } from '../src/modules/work/workStorage';

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

  it('loads shared work and authorized people from Supabase when connected', async () => {
    seedTestTasks();
    const requestOrder: string[] = [];
    const people = [{ user_id: DEV_OWNER_ACCOUNT.id, display_name: 'BeeZone Owner', email: DEV_OWNER_ACCOUNT.email, role: 'manager', active: true, branch: 'admin' }];
    const from = vi.fn((table: string) => {
      requestOrder.push(table);
      return ({
      select: () => ({ order: async () => ({ data: table === 'bz_work_tasks' ? [{ id: '11111111-1111-4111-8111-111111111111', title: 'Việc đã đồng bộ', branch: 'admin', assigned_uid: DEV_OWNER_ACCOUNT.id, work_date: localISODate(), status: 'todo', priority: 'normal', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }] : [], error: null }) }),
      });
    });
    const serverClient = { rpc: vi.fn(async () => { requestOrder.push('people'); return { data: people, error: null }; }), from };

    const data = await fetchWorkModuleData(serverClient as never, localISODate(), DEV_OWNER_ACCOUNT.id);

    expect(data.source).toBe('supabase');
    expect(data.tasks.map((task) => task.title)).toEqual(['Việc đã đồng bộ']);
    expect(data.people?.[0].role).toBe('manager');
    expect(from).toHaveBeenCalledTimes(4);
    expect(requestOrder[0]).toBe('people');
  });

  it.each(['owner', 'admin'] as const)('shows %s every training update, note and assigned task', async (role) => {
    const now = new Date().toISOString();
    saveLocalWorkData({
      tasks: [{
        id: 'training-visibility-task',
        title: 'Giáo viên cập nhật tiến độ lớp Kiddy',
        description: 'Nội dung công việc do phòng đào tạo giao',
        branch: 'training',
        assigned_uid: mockTeacher.id,
        work_date: localISODate(),
        shift_label: 'Ca tối',
        class_label: mockClass.name,
        priority: 'normal',
        status: 'progress',
        needs_handover: false,
        completed_at: null,
        email_sent_at: null,
        email_sent_to: null,
        created_at: now,
        updated_at: now,
      }],
      notes: [{
        id: 'training-note',
        task_id: 'training-visibility-task',
        author_uid: mockTeacher.id,
        author_name: mockTeacher.name,
        body: 'Giáo viên đã cập nhật nội dung mới nhất.',
        created_at: now,
      }],
      reasons: [{
        id: 'training-reason',
        task_id: 'training-visibility-task',
        author_uid: 'training-office',
        author_name: 'Phòng Đào tạo',
        kind: 'progress',
        body: 'Phòng đào tạo đang theo dõi tiến độ.',
        created_at: now,
      }],
      handoffs: [],
    });
    const account: UserAccount = { ...DEV_OWNER_ACCOUNT, role, name: role === 'admin' ? 'BeeZone Hành Chính' : 'Chủ trung tâm' };

    render(
      <BeeZoneWork
        currentUser={account}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    expect(await screen.findByText('Giáo viên cập nhật tiến độ lớp Kiddy')).toBeTruthy();
    expect(screen.getByText('Giáo viên đã cập nhật nội dung mới nhất.')).toBeTruthy();
    expect(screen.getByText(/Phòng đào tạo đang theo dõi tiến độ/i)).toBeTruthy();
    expect(screen.getByText(/Việc chuyên môn · Đào tạo/i)).toBeTruthy();
  });

  it('refreshes the assignee directory after an account permission change', async () => {
    const ownerPerson = {
      user_id: DEV_OWNER_ACCOUNT.id,
      display_name: 'BeeZone Owner',
      email: DEV_OWNER_ACCOUNT.email,
      role: 'manager',
      active: true,
      branch: 'admin',
    };
    const grantedPerson = {
      user_id: 'newly-granted-user',
      display_name: 'Nhân viên mới',
      email: 'nhanvienmoi@beezone.vn',
      role: 'admin',
      active: true,
      department: 'Hành chính',
      branch: 'admin',
    };
    let directoryUpdated = false;
    const rpc = vi.fn(async () => ({
      data: directoryUpdated ? [ownerPerson, grantedPerson] : [ownerPerson],
      error: null,
    }));
    const from = vi.fn(() => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    }));
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };
    const serverClient = {
      rpc,
      from,
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };

    render(
      <BeeZoneWork currentUser={DEV_OWNER_ACCOUNT} teachers={[]} supabaseClient={serverClient as never} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Nhân sự/i }));
    expect(screen.getByText(/Danh sách này đồng bộ từ các tài khoản hoạt động/i)).toBeTruthy();
    expect(screen.queryByText('Nhân viên mới')).toBeNull();

    directoryUpdated = true;
    window.dispatchEvent(new Event(ACCOUNT_DIRECTORY_CHANGED_EVENT));

    expect(await screen.findByText('Nhân viên mới')).toBeTruthy();

    directoryUpdated = false;
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByText('Nhân viên mới')).toBeNull());

    directoryUpdated = true;
    fireEvent.focus(window);
    expect(await screen.findByText('Nhân viên mới')).toBeTruthy();
  });

  it('shows authorized staff for training tasks and only admin-capable people for admin tasks', () => {
    const people: WorkPerson[] = [
      { user_id: 'owner', display_name: 'Owner', email: null, role: 'manager', active: true },
      { user_id: 'staff', display_name: 'Office', email: null, role: 'admin', active: true },
      { user_id: 'trainer', display_name: 'Trainer', email: null, role: 'trainer', active: true },
      { user_id: 'teacher', display_name: 'Teacher', email: null, role: 'teacher', active: true },
    ];

    expect(getAssignableWorkPeople(people, 'admin').map((person) => person.user_id)).toEqual(['owner', 'staff']);
    expect(getAssignableWorkPeople(people, 'training').map((person) => person.user_id)).toEqual([
      'owner', 'staff', 'trainer', 'teacher',
    ]);
    expect(getAssignableWorkPeople(people, 'teacher').map((person) => person.user_id)).toEqual(['teacher']);
  });

  it('sends one atomic server sync with the expected task versions', async () => {
    const rpc = vi.fn(async () => ({ error: null }));
    const task: WorkTask = { id: '11111111-1111-4111-8111-111111111111', title: 'Cloud task', description: '', branch: 'admin', assigned_uid: DEV_OWNER_ACCOUNT.id, work_date: localISODate(), shift_label: 'Ca sáng', class_label: '', priority: 'normal', status: 'todo', needs_handover: false, completed_at: null, email_sent_at: null, email_sent_to: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    await syncWorkModuleData({ rpc } as never, { tasks: [task], notes: [], reasons: [], handoffs: [] }, []);
    expect(rpc).toHaveBeenCalledWith('bz_work_sync_snapshot', expect.objectContaining({ p_tasks: [task], p_expected_tasks: [] }));
  });

  it('prepares legacy local tasks for upload while retaining tasks with no matching account', () => {
    const legacyTask: WorkTask = { id: 'old-task-1', title: 'Công việc cũ', description: '', branch: 'admin', assigned_uid: 'acc-old-office', work_date: localISODate(), shift_label: 'Ca sáng', class_label: '', priority: 'normal', status: 'todo', needs_handover: false, completed_at: null, email_sent_at: null, email_sent_to: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    const unknownTask = { ...legacyTask, id: 'old-task-2', assigned_uid: 'unknown-user', title: 'Công việc cần giữ cục bộ' };
    const serverPerson: WorkPerson = { user_id: DEV_OWNER_ACCOUNT.id, display_name: 'BeeZone Owner', email: 'office@beezone.vn', role: 'manager', active: true };
    const prepared = prepareLocalWorkSync(
      { tasks: [], notes: [], reasons: [], handoffs: [] },
      { tasks: [legacyTask, unknownTask], notes: [], reasons: [], handoffs: [] },
      [{ ...serverPerson, user_id: 'acc-old-office' }],
      [serverPerson],
      DEV_OWNER_ACCOUNT.id,
    );
    expect(prepared.tasks).toHaveLength(2);
    expect(prepared.tasks[0].id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(prepared.tasks[0].assigned_uid).toBe(DEV_OWNER_ACCOUNT.id);
    expect(prepared.tasks[1].sync_pending).toBe(true);
  });

  it('does not grant the administrative branch from an account email or display name', async () => {
    seedTestTasks();
    const teachingStaff: UserAccount = {
      ...DEV_OWNER_ACCOUNT,
      id: 'teaching-staff',
      role: 'staff',
      name: 'Quản trị Hành chính',
      email: 'chauoaingua679@gmail.com',
      permissions: {
        ...DEV_OWNER_ACCOUNT.permissions,
        teacherId: mockTeacher.id,
      },
    };

    render(<BeeZoneWork currentUser={teachingStaff} teachers={[mockTeacher]} supabaseClient={null} />);

    await waitFor(() => {
      expect(screen.queryByText('Tư vấn lịch học thử cho phụ huynh')).toBeNull();
    });
    expect(screen.queryByText(/Việc hôm nay · Hành chính/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /Tạo công việc/i })).toBeNull();
  });

  it('refreshes the assignee list when the center adds a teacher', async () => {
    const newTeacher: Teacher = { ...mockTeacher, id: 't-new', name: 'Cô Giáo Mới', email: 'new@beezone.edu.vn' };
    const { rerender } = render(
      <BeeZoneWork currentUser={DEV_OWNER_ACCOUNT} teachers={[mockTeacher]} supabaseClient={null} />,
    );
    rerender(
      <BeeZoneWork currentUser={DEV_OWNER_ACCOUNT} teachers={[mockTeacher, newTeacher]} supabaseClient={null} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tạo công việc/i }));
    fireEvent.change(screen.getByLabelText(/Nhóm|Nhánh công việc/i), { target: { value: 'training' } });
    fireEvent.click(screen.getByLabelText(/Người thực hiện/i));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Cô Giáo Mới/i })).toBeTruthy();
    });
  });

  it('does not add a private signed-in account to the work directory', () => {
    const privateUser = { ...DEV_OWNER_ACCOUNT, email: 'private-owner@beezone.edu.vn', isPrivate: true };
    const people = buildWorkPeople(privateUser, [mockTeacher]);

    expect(people.some((person) => person.email === privateUser.email)).toBe(false);
  });

  it('keeps the designated office account classified as Hành chính across directory sources', () => {
    const officeUser: UserAccount = {
      ...DEV_OWNER_ACCOUNT,
      id: 'office-live-id',
      email: 'phonghanhchinh.beezone@gmail.com',
      name: 'Tên cũ',
      role: 'teacher',
    };
    const people = buildWorkPeople(officeUser, [], [{
      user_id: officeUser.id,
      display_name: 'Tên từ máy chủ',
      email: officeUser.email,
      department: 'Giáo viên',
      branch: 'training',
      role: 'teacher',
      active: true,
    }]);
    expect(people.find((person) => person.email === officeUser.email)).toMatchObject({
      display_name: 'BeeZone Hành Chính',
      department: 'Hành chính',
      branch: 'admin',
      role: 'admin',
    });
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
    const branchSelect = screen.getByLabelText(/Nhóm|Nhánh công việc/i);
    fireEvent.change(branchSelect, { target: { value: 'training' } });

    // Select assignee: Cô Mai Linh
    const assigneeSelect = screen.getByLabelText(/Người thực hiện/i);
    fireEvent.click(assigneeSelect);
    fireEvent.click(screen.getByRole('option', { name: /Cô Mai Linh/i }));

    // Select class: LOP-KINDY-01
    const classSelect = screen.getByLabelText(/Lớp/i);
    fireEvent.change(classSelect, { target: { value: 'c-kindy' } });

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
    const seeded = loadLocalWorkData(localISODate(), DEV_OWNER_ACCOUNT.id);
    saveLocalWorkData({
      ...seeded,
      tasks: seeded.tasks.map((task) => task.id === 'task-2' ? { ...task, branch: 'teacher' as const } : task),
      handoffs: [],
    });
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

    // 1. As Manager, choose the recipient and create the pending handover.
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
    fireEvent.click(screen.getAllByRole('button', { name: /Chọn người nhận/i })[0]);
    expect(screen.getByRole('dialog', { name: 'Bàn giao công việc' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Người nhận bàn giao *'), { target: { value: 't-linh' } });
    fireEvent.change(screen.getByLabelText('Nội dung bàn giao *'), { target: { value: 'Bàn giao đúng người nhận' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi bàn giao' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Bàn giao công việc' })).toBeNull());
    expect(loadLocalWorkData(localISODate(), DEV_OWNER_ACCOUNT.id).handoffs).toEqual([
      expect.objectContaining({ task_id: 'task-2', to_uid: 't-linh', note: 'Bàn giao đúng người nhận' }),
    ]);

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

  it('contains the 3 authorized accounts, excludes tayninhdoimoi@gmail.com, and only shows Hành chính branch', async () => {
    const userWithHiddenEmail: UserAccount = {
      ...DEV_OWNER_ACCOUNT,
      id: 'usr-hidden',
      name: 'Quản trị hệ thống',
      email: 'tayninhdoimoi@gmail.com',
      role: 'owner',
      isPrivate: true,
    };

    render(
      <BeeZoneWork
        currentUser={userWithHiddenEmail}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Tạo công việc/i }));

    expect(screen.getByText('Tạo công việc mới')).toBeTruthy();

    // Check branch options: "Hành chính", "Đào tạo", "Giáo viên"
    const branchSelect = screen.getByLabelText(/Nhóm|Nhánh công việc/i) as HTMLSelectElement;
    const branchOptionTexts = Array.from(branchSelect.options).map((o) => o.textContent);
    expect(branchOptionTexts).toContain('Hành chính');
    expect(branchOptionTexts).toContain('Đào tạo');
    expect(branchOptionTexts).toContain('Giáo viên');
    expect(branchOptionTexts).not.toContain('Hành chính / Lễ tân');

    // Check assignee options
    fireEvent.click(screen.getByLabelText(/Người thực hiện/i));
    const assigneeOptionTexts = screen.getAllByRole('option').map((option) => option.textContent || '');

    // Must contain authorized accounts
    expect(assigneeOptionTexts.some((txt) => txt.includes('phongdaotao.beezone@gmail.com'))).toBe(false);
    expect(assigneeOptionTexts.some((txt) => txt.includes('chauoaingua679@gmail.com'))).toBe(true);
    expect(assigneeOptionTexts.some((txt) => txt.includes('phonghanhchinh.beezone@gmail.com'))).toBe(true);
    expect(assigneeOptionTexts.some((txt) => txt.includes('BeeZone Hành Chính (Hành chính)'))).toBe(true);
    expect(assigneeOptionTexts.some((txt) => txt.includes('nhu.beezone@gmail.com'))).toBe(true);
    expect(assigneeOptionTexts.some((txt) => txt.includes('Nguyễn Bích Như'))).toBe(true);
    expect(assigneeOptionTexts.some((txt) => txt.includes('vgen8642@gmail.com'))).toBe(true);
    expect(assigneeOptionTexts.some((txt) => txt.includes('Cao Dương Bích Tuyền'))).toBe(true);

    // Must NOT contain tayninhdoimoi@gmail.com
    expect(assigneeOptionTexts.some((txt) => txt.includes('tayninhdoimoi@gmail.com'))).toBe(false);
  });

  it('allows quick adding a new person directly in the Task Editor modal and auto-selects them', async () => {
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

    // Select option "➕ Thêm mới nhân sự / giáo viên..." in Người thực hiện dropdown
    const assigneeSelect = screen.getByLabelText(/Người thực hiện/i);
    fireEvent.click(assigneeSelect);
    fireEvent.click(screen.getByRole('option', { name: /Thêm mới nhân sự \/ giáo viên/i }));

    expect(screen.getByText('➕ Thêm mới nhân sự / giáo viên')).toBeTruthy();

    const nameInput = screen.getByPlaceholderText(/Ví dụ: Cô Mai Anh/i);
    const emailInput = screen.getByPlaceholderText(/name@gmail\.com/i);
    fireEvent.change(nameInput, { target: { value: 'Thầy Tuấn Anh' } });
    fireEvent.change(emailInput, { target: { value: 'tuananh@beezone.edu.vn' } });

    // Click "✓ Lưu & Chọn người này"
    fireEvent.click(screen.getByRole('button', { name: /Lưu & Chọn người này/i }));

    await waitFor(() => {
      // The quick-add box is closed
      expect(screen.queryByText(/Bổ sung người thực hiện trực tiếp/i)).toBeNull();
      // The assignee select now has the new person selected
      const assigneeSelect = screen.getByLabelText(/Người thực hiện/i);
      expect(assigneeSelect.textContent).toContain('Thầy Tuấn Anh');
      expect(assigneeSelect.textContent).toContain('tuananh@beezone.edu.vn');
    });
  });

  it('allows selecting "Thêm mới / Tự nhập mốc thời gian" in Ca / Buổi and entering custom time manually', async () => {
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

    const shiftSelect = screen.getByLabelText(/Ca \/ Buổi/i) as HTMLSelectElement;
    // Check that "__custom_shift__" is in the options
    const shiftOptions = Array.from(shiftSelect.options).map((o) => o.value);
    expect(shiftOptions).toContain('__custom_shift__');

    // Select "__custom_shift__"
    fireEvent.change(shiftSelect, { target: { value: '__custom_shift__' } });

    // Custom shift box should now be visible
    expect(screen.getByText(/Tự nhập mốc thời gian \/ ca làm việc/i)).toBeTruthy();

    // Type custom time manually
    const customTimeInput = screen.getByPlaceholderText(/Mốc thời gian sẽ lưu vào công việc/i);
    fireEvent.change(customTimeInput, { target: { value: 'Trực trưa (11:30 - 13:30)' } });

    // Set task title
    const titleInput = screen.getByPlaceholderText(/Nhập tên nhiệm vụ/i);
    fireEvent.change(titleInput, { target: { value: 'Trực đón học viên ca trưa' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /Lưu công việc/i }));

    await waitFor(() => {
      expect(screen.getByText('Trực đón học viên ca trưa')).toBeTruthy();
      expect(screen.getAllByText(/Trực trưa \(11:30 - 13:30\)/i).length).toBeGreaterThan(0);
    });
  });

  it('removes backup buttons from main toolbar and arranges filter inputs cleanly', async () => {
    render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    // Filter toolbar should have search, date, and status selector
    expect(screen.getByPlaceholderText(/Tìm công việc, lớp, nhân sự/i)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: '' })).toBeTruthy();

    // Backup & Restore buttons should NOT be present on the main filter toolbar
    expect(screen.queryByRole('button', { name: /↓ Sao lưu/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /↑ Nhập lại/i })).toBeNull();
  });

  it('enforces branch visibility: training staff does not see admin branch tasks and only creates training tasks', async () => {
    seedTestTasks();

    const trainingUser: UserAccount = {
      id: 'acc-daotao',
      name: 'BeeZone Đào Tạo',
      email: 'phongdaotao.beezone@gmail.com',
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
        academic: { programs: true, classes: true, rooms: true },
      },
    };

    render(
      <BeeZoneWork
        currentUser={trainingUser}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    // Admin column header should NOT be present for training staff
    expect(screen.queryByText(/Việc hôm nay · Hành chính/i)).toBeNull();

    // Training column header should be present
    expect(screen.getByText(/Việc chuyên môn · Đào tạo/i)).toBeTruthy();

    // When clicking Create task, training staff can assign to Training or Teacher, but not Admin
    fireEvent.click(screen.getByRole('button', { name: /Tạo công việc/i }));

    const branchSelect = screen.getByLabelText(/Nhóm|Nhánh công việc/i) as HTMLSelectElement;
    expect(branchSelect.value).toBe('training');
    const branchOptionValues = Array.from(branchSelect.options).map((o) => o.value);
    expect(branchOptionValues).toContain('training');
    expect(branchOptionValues).toContain('teacher');
    expect(branchOptionValues).not.toContain('admin');
    expect(screen.getByText(/Bộ phận Đào tạo phụ trách việc chuyên môn và phân công cho Giáo viên/i)).toBeTruthy();

    // Verify Nguyen Bich Nhu and Cao Duong Bich Tuyen are also assignable in Training branch
    fireEvent.click(screen.getByLabelText(/Người thực hiện/i));
    const trainingAssignees = screen.getAllByRole('option').map((option) => option.textContent || '');
    expect(trainingAssignees.some((txt) => txt.includes('nhu.beezone@gmail.com'))).toBe(true);
    expect(trainingAssignees.some((txt) => txt.includes('vgen8642@gmail.com'))).toBe(true);
    expect(trainingAssignees.some((txt) => txt.includes('phongdaotao.beezone@gmail.com'))).toBe(true);
  });

  it('clearly separates work into 3 distinct groups: Hanh Chinh - Dao Tao - Giao Vien', async () => {
    const today = localISODate();
    saveLocalWorkData({
      tasks: [
        {
          id: 'task-admin-1',
          title: 'Soát sổ quỹ tiền mặt cơ sở 1',
          description: 'Hành chính kiểm tra cuối ca',
          branch: 'admin',
          assigned_uid: DEV_OWNER_ACCOUNT.id,
          work_date: today,
          shift_label: 'Ca tối',
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
          id: 'task-training-1',
          title: 'Soạn đề thi giữa kỳ Starter',
          description: 'Đào tạo chuẩn bị giáo trình',
          branch: 'training',
          assigned_uid: 'acc-daotao',
          work_date: today,
          shift_label: 'Ca sáng',
          class_label: '',
          priority: 'high',
          status: 'progress',
          needs_handover: false,
          completed_at: null,
          email_sent_at: null,
          email_sent_to: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'task-teacher-1',
          title: 'Nhận xét và chấm bài lớp Kiddy 3D',
          description: 'Giáo viên gửi nhận xét buổi học',
          branch: 'teacher',
          assigned_uid: mockTeacher.id,
          work_date: today,
          shift_label: 'Ca chiều',
          class_label: mockClass.name,
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
          id: 'task-teacher-other',
          title: 'Công việc riêng của giáo viên khác',
          description: 'Không hiển thị cho giáo viên hiện tại',
          branch: 'teacher',
          assigned_uid: 'teacher-other',
          work_date: today,
          shift_label: 'Ca chiều',
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
      ],
      notes: [],
      reasons: [],
      handoffs: [],
    });

    const { rerender } = render(
      <BeeZoneWork
        currentUser={DEV_OWNER_ACCOUNT}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    // 1. Manager/Admin sees 4 column headers: Hành chính, Đào tạo, Giáo viên, Bàn giao
    expect(screen.getByText(/Việc hôm nay · Hành chính/i)).toBeTruthy();
    expect(screen.getByText(/Việc chuyên môn · Đào tạo/i)).toBeTruthy();
    expect(screen.getByText(/Việc giảng dạy · Giáo viên/i)).toBeTruthy();
    expect(screen.getByText(/Bàn giao cuối ca \/ cuối buổi/i)).toBeTruthy();

    // 2. All 3 tasks appear on the board
    expect(await screen.findByText('Soát sổ quỹ tiền mặt cơ sở 1')).toBeTruthy();
    expect(screen.getByText('Soạn đề thi giữa kỳ Starter')).toBeTruthy();
    expect(screen.getByText('Nhận xét và chấm bài lớp Kiddy 3D')).toBeTruthy();
    expect(screen.getByText('Công việc riêng của giáo viên khác')).toBeTruthy();

    // 3. Test filtering by group
    const filterSelect = screen.getByLabelText(/Lọc theo bộ phận/i) as HTMLSelectElement;
    expect(filterSelect).toBeTruthy();

    // Filter to Hành chính only
    fireEvent.change(filterSelect, { target: { value: 'admin' } });
    expect(screen.getByText('Soát sổ quỹ tiền mặt cơ sở 1')).toBeTruthy();
    expect(screen.queryByText('Soạn đề thi giữa kỳ Starter')).toBeNull();
    expect(screen.queryByText('Nhận xét và chấm bài lớp Kiddy 3D')).toBeNull();

    // Filter to Đào tạo only
    fireEvent.change(filterSelect, { target: { value: 'training' } });
    expect(screen.queryByText('Soát sổ quỹ tiền mặt cơ sở 1')).toBeNull();
    expect(screen.getByText('Soạn đề thi giữa kỳ Starter')).toBeTruthy();
    expect(screen.queryByText('Nhận xét và chấm bài lớp Kiddy 3D')).toBeNull();

    // Filter to Giáo viên only
    fireEvent.change(filterSelect, { target: { value: 'teacher' } });
    expect(screen.queryByText('Soát sổ quỹ tiền mặt cơ sở 1')).toBeNull();
    expect(screen.queryByText('Soạn đề thi giữa kỳ Starter')).toBeNull();
    expect(screen.getByText('Nhận xét và chấm bài lớp Kiddy 3D')).toBeTruthy();

    // Reset filter
    fireEvent.change(filterSelect, { target: { value: 'all' } });

    // 4. Test Teacher perspective: only sees Giáo viên and Handover, no Hành chính or Đào tạo
    const teacherAccount: UserAccount = {
      ...DEV_OWNER_ACCOUNT,
      id: mockTeacher.id,
      name: mockTeacher.name,
      email: mockTeacher.email || 'teacher@beezone.edu.vn',
      avatar: '',
      role: 'teacher',
      active: true,
      permissions: {
        ...DEV_OWNER_ACCOUNT.permissions,
        teacherId: mockTeacher.id,
        assignedClassIds: [mockClass.id],
      },
    };

    rerender(
      <BeeZoneWork
        currentUser={teacherAccount}
        teachers={[mockTeacher]}
        classes={[mockClass]}
        programs={[mockProgram]}
        supabaseClient={null}
      />,
    );

    expect(screen.queryByText(/Việc hôm nay · Hành chính/i)).toBeNull();
    expect(screen.queryByText(/Việc chuyên môn · Đào tạo/i)).toBeNull();
    expect(screen.getByText(/Việc giảng dạy · Giáo viên/i)).toBeTruthy();
    expect(screen.getByText(/Bàn giao cuối ca \/ cuối buổi/i)).toBeTruthy();
    expect(screen.getByText('Nhận xét và chấm bài lớp Kiddy 3D')).toBeTruthy();
    expect(screen.queryByText('Soát sổ quỹ tiền mặt cơ sở 1')).toBeNull();
    expect(screen.queryByText('Công việc riêng của giáo viên khác')).toBeNull();
    expect(screen.queryByRole('button', { name: /Tạo công việc/i })).toBeNull();
  });
});
