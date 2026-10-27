import { describe, expect, it } from 'vitest';
import { ACCOUNT_ROLE_GUIDES, ACCOUNT_ROLE_OPTIONS, accountRoleLabel, normalizeAccountRole } from '../src/lib/accountRoles';
import { createRolePermissions, createStaffPermissions, normalizeRolePermissions } from '../src/lib/permissions';

describe('account ranks', () => {
  it('lists the four assignable ranks in management order', () => {
    expect(ACCOUNT_ROLE_OPTIONS.map(({ value, label }) => ({ value, label }))).toEqual([
      { value: 'owner', label: 'Chủ trung tâm' },
      { value: 'admin', label: 'Hành chính' },
      { value: 'trainer', label: 'Đào tạo' },
      { value: 'teacher', label: 'Giáo viên' },
    ]);
  });

  it('reads retired staff values as teacher without promoting the account', () => {
    expect(normalizeAccountRole('staff')).toBe('teacher');
    expect(accountRoleLabel('staff')).toBe('Giáo viên');
    expect(normalizeAccountRole('unexpected')).toBeNull();
  });

  it('provides role guidance and safe recommended permission presets', () => {
    expect(ACCOUNT_ROLE_GUIDES.admin.capabilities.join(' ')).toContain('Cấp quyền');
    expect(ACCOUNT_ROLE_GUIDES.teacher.capabilities.join(' ')).toContain('lớp được phân công');
    expect(createRolePermissions('admin')).toMatchObject({
      student: { view: true, add: true, edit: true, delete: false },
      tuition: { view: true, collect: true },
      grade: { view: true, edit: false },
      report: { view: true, revenue: true },
    });
    expect(createRolePermissions('trainer')).toMatchObject({
      academic: { classesAdd: true, classesEdit: true, classesDelete: false },
      grade: { view: true, edit: true },
    });
    expect(createRolePermissions('teacher')).toMatchObject({
      student: { view: true, edit: false, delete: false },
      teacher: { view: false, edit: true, delete: false },
      grade: { view: true, edit: true },
    });
  });

  it('keeps legacy teacher grants inside the fixed teaching ceiling', () => {
    const broad = createStaffPermissions(true);
    const permissions = normalizeRolePermissions('teacher', {
      ...broad,
      assignedClassIds: ['class-a'],
      teacherId: 'teacher-a',
    });
    expect(permissions.student).toMatchObject({ view: true, add: false, edit: false, delete: false, export: false });
    expect(permissions.grade).toEqual({ view: true, edit: true });
    expect(permissions.teacher).toMatchObject({ view: false, edit: true, delete: false });
    expect(permissions.tuition).toMatchObject({ view: false, collect: false, showDebt: false });
    expect(permissions.academic).toMatchObject({ programs: false, classes: false, rooms: false });
    expect(permissions.assignedClassIds).toEqual(['class-a']);
    expect(permissions.teacherId).toBe('teacher-a');
  });
});
