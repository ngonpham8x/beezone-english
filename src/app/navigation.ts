import { academicPermission } from '../lib/permissions';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  CloudUpload,
  DollarSign,
  DoorOpen,
  FileDown,
  GraduationCap,
  History,
  Layers,
  LayoutDashboard,
  RefreshCw,
  Settings,
  UserCheck,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react';
import type { UserAccount } from '../types';
export const NAVIGATION_GROUPS = [
  {
    title: 'TỔNG QUAN & ĐIỂM DANH',
    items: [
      {
        id: 'dashboard',
        labelKey: 'dashboard',
        icon: LayoutDashboard,
        iconColor: 'text-amber-600',
      },
      {
        id: 'attendance',
        label: 'Điểm danh buổi học',
        icon: UserCheck,
        iconColor: 'text-emerald-600',
      },
      {
        id: 'admissions',
        label: 'Tuyển sinh & Ghi danh',
        icon: UserPlus,
        iconColor: 'text-blue-600',
      },
    ],
  },
  {
    title: 'ĐÀO TẠO & HỌC VỤ',
    items: [
      { id: 'programs', label: 'Chương trình học', icon: Layers, iconColor: 'text-amber-600' },
      { id: 'students', labelKey: 'students', icon: Users, iconColor: 'text-emerald-600' },
      { id: 'teachers', labelKey: 'teachers', icon: GraduationCap, iconColor: 'text-indigo-600' },
      { id: 'classes', labelKey: 'classes', icon: BookOpen, iconColor: 'text-amber-600' },
      { id: 'rooms', labelKey: 'rooms', icon: DoorOpen, iconColor: 'text-rose-600' },
      { id: 'timetable', labelKey: 'timetable', icon: CalendarDays, iconColor: 'text-purple-600' },
      {
        id: 'teacher-schedule',
        label: 'Lịch giáo viên',
        icon: CalendarCheck,
        iconColor: 'text-cyan-600',
      },
      { id: 'grades', labelKey: 'grades', icon: XCircle, iconColor: 'text-orange-600' },
    ],
  },
  {
    title: 'TÀI CHÍNH & BÁO CÁO',
    items: [
      { id: 'tuition', labelKey: 'tuition', icon: DollarSign, iconColor: 'text-emerald-700' },
      { id: 'reports', labelKey: 'reports', icon: BarChart3, iconColor: 'text-indigo-700' },
    ],
  },
  {
    title: 'HỆ THỐNG',
    items: [
      { id: 'excel-import-export', labelKey: 'excel', icon: FileDown, iconColor: 'text-teal-600' },
      {
        id: 'data-consistency',
        label: 'Kiểm tra dữ liệu',
        icon: RefreshCw,
        iconColor: 'text-violet-600',
      },
      { id: 'backups', labelKey: 'backups', icon: CloudUpload, iconColor: 'text-sky-600' },
      { id: 'settings', labelKey: 'settings', icon: Settings, iconColor: 'text-slate-600' },
      { id: 'activity-logs', labelKey: 'system_logs', icon: History, iconColor: 'text-slate-700' },
    ],
  },
] as const;
export type TabId = (typeof NAVIGATION_GROUPS)[number]['items'][number]['id'];
export const VALID_TABS = new Set<string>(
  NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.id)),
);
export const isTabId = (value: string): value is TabId => VALID_TABS.has(value);

export const canAccessTab = (tab: string, user: UserAccount): tab is TabId => {
  if (!VALID_TABS.has(tab)) return false;
  if (user.role === 'owner') return true;
  const permissions = user.permissions;

  switch (tab) {
    case 'dashboard':
      return true;
    case 'attendance':
      return permissions.student.view || permissions.teacher.view;
    case 'admissions':
      return permissions.student.view || permissions.student.add || permissions.student.edit || permissions.student.delete;
    case 'programs':
      return permissions.student.view || (['add', 'edit', 'delete'] as const).some(action => academicPermission(permissions, 'programs', action));
    case 'students':
      return permissions.student.view;
    case 'teachers':
      return permissions.teacher.view || (permissions.teacher.add ?? permissions.teacher.edit) || permissions.teacher.edit || permissions.teacher.delete;
    case 'classes':
      return permissions.student.view || (['add', 'edit', 'delete'] as const).some(action => academicPermission(permissions, 'classes', action));
    case 'rooms':
      return permissions.student.view || permissions.teacher.view || (['add', 'edit', 'delete'] as const).some(action => academicPermission(permissions, 'rooms', action));
    case 'timetable':
    case 'teacher-schedule':
      return permissions.student.view || permissions.teacher.view || (['add', 'edit', 'delete'] as const).some(action => academicPermission(permissions, 'classes', action));
    case 'grades':
      return permissions.grade.view;
    case 'tuition':
      return permissions.tuition.view;
    case 'reports':
      return permissions.report.view && permissions.report.revenue;
    case 'excel-import-export':
      return permissions.excel.import || permissions.excel.export;
    case 'data-consistency':
      return false;
    default:
      return false;
  }
};

export function getNavigationGroups(user: UserAccount, translate: (key: string) => string) {
  return NAVIGATION_GROUPS.map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({
      ...item,
      label: 'labelKey' in item ? translate(item.labelKey) : item.label,
      visible: canAccessTab(item.id, user),
    })),
  }));
}
