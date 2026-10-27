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
    summary: 'Phụ trách chương trình, lớp học, giáo viên, điểm số và chất lượng đào tạo.',
    capabilities: [
      'Quản lý chương trình, lớp, phòng, lịch học, thời khóa biểu và phân công giáo viên.',
      'Theo dõi điểm danh, nhập điểm, ghi nhận xét buổi học và giao việc / bàn giao ca.',
      'Xem danh sách học viên theo lớp; không xem học phí và thông tin cá nhân học viên.',
    ],
  },
  teacher: {
    summary: 'Thực hiện nghiệp vụ giảng dạy trên các lớp được phân công.',
    capabilities: [
      'Xem học viên, điểm danh, nhập điểm và nhận xét ở lớp được phân công.',
      'Chỉ xem lịch của chính giáo viên đã liên kết; không xem lịch của giáo viên khác.',
      'Không xem thông tin cá nhân, học phí; không truy cập Tuyển sinh, danh mục đào tạo, giáo viên, phòng học hoặc thời khóa biểu trung tâm.',
    ],
    caution: 'Phải gán đúng hồ sơ giáo viên và lớp phụ trách; các giới hạn này không thể mở lại bằng quyền tùy chỉnh.',
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
