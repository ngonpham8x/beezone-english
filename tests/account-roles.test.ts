import { describe, expect, it } from 'vitest';
import { ACCOUNT_ROLE_OPTIONS, accountRoleLabel, normalizeAccountRole } from '../src/lib/accountRoles';

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
});
