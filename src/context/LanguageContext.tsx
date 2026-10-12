import React, { createContext, useContext, useState, useEffect } from 'react';
import viJson from '../locales/vi.json';
import enJson from '../locales/en.json';

export type Language = 'vi' | 'en';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const localesData: Record<Language, any> = {
  vi: viJson,
  en: enJson
};

const flatFallback: Record<Language, Record<string, string>> = {
  vi: {
    dashboard: 'Tổng quan',
    students: 'Học viên',
    programs: 'Chương trình học',
    classes: 'Lớp học & Điểm danh',
    teachers: 'Giáo viên',
    grades: 'Điểm số',
    tuition: 'Học phí',
    reports: 'Báo cáo',
    sheets: 'Google Sheets',
    excel: 'Excel',
    backups: 'Backup & Khôi phục',
    settings: 'Cài đặt hệ thống',
    permissions: 'Phân quyền nhân viên',
    search_placeholder: 'Tìm kiếm nhanh học sinh, lớp học...',
    install_app: 'Tải App MH Chính',
    notifications: 'Thông báo hệ thống',
    messages: 'Tin nhắn',
    mark_all_read: 'Đánh dấu đã đọc',
    clear_all: 'Xóa tất cả',
    no_notifications: 'Không có thông báo mới',
    no_messages: 'Không có tin nhắn mới',
    switch_account: 'Chuyển tài khoản',
    owner: 'Chủ cơ sở',
    staff: 'Nhân viên',
    add_student: 'Thêm Học Sinh',
    export_data: 'Xuất Dữ Liệu',
    import_export_excel: 'Excel Import / Export',
    save: 'Lưu thay đổi',
    cancel: 'Hủy bỏ',
    delete: 'Xóa',
    edit: 'Sửa',
    close: 'Đóng',
    active: 'Đang học',
    reserved: 'Bảo lưu',
    dropped: 'Nghỉ học',
    status_paid: 'Đã đóng đủ',
    status_unpaid: 'Chưa đóng',
    status_debt: 'Còn nợ',
    status_partial: 'Đóng 1 phần',
    class_assignment: 'Xếp vào lớp học',
    program: 'Chương trình học',
    student_code: 'Mã học viên',
    student_name: 'Họ và tên',
    parent_name: 'Tên phụ huynh',
    phone: 'Số điện thoại',
    school: 'Trường đang học',
    grade_level: 'Khối lớp',
    gender: 'Giới tính',
    male: 'Nam',
    female: 'Nữ',
    actions: 'Thao tác',
    auto_saved: 'Đã tự động lưu bản nháp',
    undo: 'Hoàn tác',
    redo: 'Khôi phục',
    system_logs: 'Nhật ký hệ thống',
    rooms: 'Phòng học',
    timetable: 'Thời khóa biểu',
    total_students: 'Tổng học viên',
    total_classes: 'Lớp học hoạt động',
    active_teachers: 'Giáo viên',
    monthly_revenue: 'Doanh thu tháng',
    pending_tuition: 'Cần thu học phí',
    tuition_debt: 'Công nợ học phí',
    pwa_title: 'Tải App Ra Màn Hình Chính',
    pwa_desc: 'Truy cập tức thì - Không lo mất kết nối - Chuẩn PWA',
    pwa_install_btn: 'Cài Đặt Ngay Cho Thiết Bị',
    pwa_instructions: 'Hướng dẫn cài đặt',
    pwa_done: 'Đã Hiểu'
  },
  en: {
    dashboard: 'Dashboard',
    students: 'Students',
    programs: 'Programs',
    classes: 'Classes & Attendance',
    teachers: 'Teachers',
    grades: 'Grades',
    tuition: 'Tuition Fees',
    reports: 'Reports',
    sheets: 'Google Sheets',
    excel: 'Excel',
    backups: 'Backup & Restore',
    settings: 'System Settings',
    permissions: 'Staff Permissions',
    search_placeholder: 'Quick search students, classes...',
    install_app: 'Install App',
    notifications: 'Notifications',
    messages: 'Messages',
    mark_all_read: 'Mark all as read',
    clear_all: 'Clear all',
    no_notifications: 'No new notifications',
    no_messages: 'No new messages',
    switch_account: 'Switch Account',
    owner: 'Center Owner',
    staff: 'Staff Member',
    add_student: 'Add Student',
    export_data: 'Export Data',
    import_export_excel: 'Excel Import / Export',
    save: 'Save Changes',
    cancel: 'Cancel',
    delete: 'Delete',
    edit: 'Edit',
    close: 'Close',
    active: 'Active',
    reserved: 'Reserved',
    dropped: 'Dropped',
    status_paid: 'Paid',
    status_unpaid: 'Unpaid',
    status_debt: 'Debt',
    status_partial: 'Partial',
    class_assignment: 'Class Enrollment',
    program: 'Course Program',
    student_code: 'Student ID',
    student_name: 'Full Name',
    parent_name: 'Parent Name',
    phone: 'Phone Number',
    school: 'Current School',
    grade_level: 'Grade Level',
    gender: 'Gender',
    male: 'Male',
    female: 'Female',
    actions: 'Actions',
    auto_saved: 'Draft Auto-saved',
    undo: 'Undo',
    redo: 'Redo',
    system_logs: 'System Logs',
    rooms: 'Classrooms',
    timetable: 'Timetable',
    total_students: 'Total Students',
    total_classes: 'Active Classes',
    active_teachers: 'Teachers',
    monthly_revenue: 'Monthly Revenue',
    pending_tuition: 'Tuition Pending',
    tuition_debt: 'Tuition Debt',
    pwa_title: 'Install App to Home Screen',
    pwa_desc: 'Instant Access - Works Offline - Standard PWA',
    pwa_install_btn: 'Install Device App',
    pwa_instructions: 'Installation Guide',
    pwa_done: 'Got It'
  }
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'vi',
  setLanguage: () => {},
  t: (key: string) => key
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language] = useState<Language>('vi');

  useEffect(() => {
    localStorage.setItem('ppt_lang', 'vi');
  }, []);

  const setLanguage = (_lang: Language) => {
    // Lock to Vietnamese as requested
  };

  const getNestedValue = (obj: any, path: string) => {
    return path.split('.').reduce((prev, curr) => (prev && prev[curr] !== undefined) ? prev[curr] : undefined, obj);
  };

  const t = (key: string): string => {
    const val = getNestedValue(localesData[language], key);
    if (typeof val === 'string') return val;
    
    // Check flat fallback
    if (flatFallback[language]?.[key]) return flatFallback[language][key];
    
    // Check Vietnamese fallback
    const viVal = getNestedValue(localesData['vi'], key);
    if (typeof viVal === 'string') return viVal;
    if (flatFallback['vi']?.[key]) return flatFallback['vi'][key];

    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);

