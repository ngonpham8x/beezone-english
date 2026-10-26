import type { AccountRole, UserRole } from '../types';

export const ACCOUNT_ROLE_OPTIONS: ReadonlyArray<{ value: AccountRole; label: string; description: string }> = [
  { value: 'owner', label: 'Chủ trung tâm', description: 'Toàn quyền quản trị' },
  { value: 'admin', label: 'Hành chính', description: 'Phân quyền hành chính' },
  { value: 'trainer', label: 'Đào tạo', description: 'Phân quyền đào tạo' },
  { value: 'teacher', label: 'Giáo viên', description: 'Phân quyền theo lớp phụ trách' },
];

export const ACCOUNT_ROLE_GUIDES: Record<AccountRole, {
  summary: string;
  capabilities: readonly string[];
  caution?: string;
}> = {
  owner: {
    summary: 'Quản trị cao nhất của trung tâm.',
    capabilities: [
      'Toàn quyền với học viên, đào tạo, học phí, báo cáo và dữ liệu hệ thống.',
      'Cấp bậc, phân quyền, khóa hoặc xóa các tài khoản khác.',
      'Xem toàn bộ lớp học, nhật ký và báo cáo doanh thu.',
    ],
    caution: 'Chỉ cấp khi người nhận thực sự chịu trách nhiệm toàn bộ trung tâm.',
  },
  admin: {
    summary: 'Phụ trách hành chính, tài khoản và vận hành hằng ngày.',
    capabilities: [
      'Cấp quyền, sửa, khóa hoặc xóa tài khoản không phải Chủ trung tâm.',
      'Quản lý hồ sơ học viên, thu học phí, công nợ và báo cáo doanh thu theo quyền được tích chọn.',
      'Theo dõi điểm danh và nhận xét của toàn bộ lớp khi có quyền nghiệp vụ tương ứng.',
    ],
    caution: 'Hành chính không thể cấp cấp bậc Chủ trung tâm hoặc thay đổi tài khoản Chủ trung tâm.',
  },
  trainer: {
    summary: 'Phụ trách chương trình, lớp học, giáo viên và chất lượng đào tạo.',
    capabilities: [
      'Quản lý chương trình, lớp, phòng, lịch học và phân công giáo viên theo quyền được tích chọn.',
      'Theo dõi điểm danh, nhập điểm và nhận xét học viên.',
      'Xem hồ sơ học viên và dữ liệu học vụ; không mặc định có quyền doanh thu hoặc quản trị tài khoản.',
    ],
  },
  teacher: {
    summary: 'Thực hiện nghiệp vụ giảng dạy trên các lớp được phân công.',
    capabilities: [
      'Xem học viên, điểm danh, nhập điểm và nhận xét ở lớp được phân công.',
      'Xem lịch dạy và thông tin học vụ cần thiết.',
      'Không mặc định có quyền học phí, doanh thu, xóa dữ liệu hoặc quản trị tài khoản.',
    ],
  },
};

/** Convert the retired `staff` value without granting any additional permissions. */
export function normalizeAccountRole(value: unknown): AccountRole | null {
  if (value === 'staff') return 'teacher';
  return ACCOUNT_ROLE_OPTIONS.some((option) => option.value === value) ? value as AccountRole : null;
}

export function accountRoleLabel(role: UserRole | string | null | undefined): string {
  const normalized = normalizeAccountRole(role);
  return ACCOUNT_ROLE_OPTIONS.find((option) => option.value === normalized)?.label || 'Giáo viên';
}
