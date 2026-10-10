import React from 'react';
import { UserAccount } from '../types';
import { useLanguage } from '../context/LanguageContext';
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  DoorOpen,
  CalendarDays,
  CalendarCheck,
  XCircle,
  DollarSign,
  BarChart3,
  FileSpreadsheet,
  FileDown,
  CloudUpload,
  Settings,
  History,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Globe
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  collapsed: boolean;
  setCollapsed: (c: boolean) => void;
  currentUser: UserAccount;
  onOpenPwaInstall?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  currentUser,
  onOpenPwaInstall
}) => {
  const { language, setLanguage, t } = useLanguage();
  const isOwner = currentUser.role === 'owner';
  const perms = currentUser.permissions;

  const menuItems = [
    { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard, visible: true, iconColor: 'text-blue-600' },
    { id: 'students', label: t('students'), icon: Users, visible: isOwner || perms.student.view, iconColor: 'text-emerald-600' },
    { id: 'teachers', label: t('teachers'), icon: GraduationCap, visible: isOwner || perms.teacher.view, iconColor: 'text-indigo-600' },
    { id: 'classes', label: t('classes'), icon: BookOpen, visible: isOwner || perms.student.view, iconColor: 'text-amber-600' },
    { id: 'rooms', label: t('rooms'), icon: DoorOpen, visible: isOwner || perms.student.view || perms.teacher.view, iconColor: 'text-rose-600' },
    { id: 'timetable', label: t('timetable'), icon: CalendarDays, visible: isOwner || perms.student.view || perms.teacher.view, iconColor: 'text-purple-600' },
    { id: 'teacher-schedule', label: 'Lịch giáo viên', icon: CalendarCheck, visible: isOwner || perms.student.view || perms.teacher.view, iconColor: 'text-cyan-600' },
    { id: 'grades', label: t('grades'), icon: XCircle, visible: isOwner || perms.grade.view, iconColor: 'text-orange-600' },
    { id: 'tuition', label: t('tuition'), icon: DollarSign, visible: isOwner || perms.tuition.view, iconColor: 'text-emerald-700' },
    { id: 'reports', label: t('reports'), icon: BarChart3, visible: isOwner || (perms.report?.view && perms.report?.revenue), iconColor: 'text-indigo-700' },
    // Đồng bộ Google Sheets cần OAuth/API phía máy chủ; ẩn tới khi tích hợp thật.
    { id: 'google-sheets', label: t('sheets'), icon: FileSpreadsheet, visible: false, iconColor: 'text-emerald-600' },
    { id: 'excel-import-export', label: t('excel'), icon: FileDown, visible: isOwner || perms.excel.import || perms.excel.export, iconColor: 'text-teal-600' },
    { id: 'backups', label: t('backups'), icon: CloudUpload, visible: isOwner, iconColor: 'text-sky-600' },
    { id: 'data-consistency', label: t('data_consistency'), icon: ShieldCheck, visible: isOwner, iconColor: 'text-purple-600' },
    { id: 'settings', label: t('settings'), icon: Settings, visible: isOwner, iconColor: 'text-slate-600' },
    { id: 'activity-logs', label: t('system_logs'), icon: History, visible: isOwner, iconColor: 'text-slate-700' }
  ];

  return (
    <aside
      className={`sticky top-[52px] self-start h-[calc(100vh-52px)] overflow-y-auto bg-white text-slate-800 transition-all duration-300 z-20 border-r border-slate-200 shadow-sm ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="px-2 py-2.5">
        {/* Navigation Menu */}
        <nav className="space-y-1.5">
          {menuItems.filter(item => item.visible).map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-150 ${
                  isActive
                    ? 'bg-gradient-to-r from-red-700 via-red-800 to-red-900 text-white shadow-md shadow-red-900/20 ring-1 ring-red-600/30'
                    : 'text-slate-700 hover:text-red-800 hover:bg-slate-100/90 font-bold'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-white' : item.iconColor}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Area: PWA Download Button + Collapse Toggle Arrow */}
      <div className="border-t border-slate-200 bg-slate-50/90">
        {/* Move App Download button to the bottom of page / sidebar */}
        {onOpenPwaInstall && (
          <div className="p-2 border-b border-slate-200/80 bg-gradient-to-b from-amber-50/40 to-red-50/30">
            <button
              onClick={onOpenPwaInstall}
              className={`w-full flex items-center gap-2.5 p-2 rounded-xl bg-gradient-to-r from-red-800 via-red-900 to-red-950 hover:from-red-900 hover:to-slate-900 text-white font-extrabold text-xs shadow-xs border border-amber-400/40 transition-all active:scale-95 ${
                collapsed ? 'justify-center' : 'justify-start'
              }`}
              title="Tải ứng dụng ra Màn Hình Chính (PWA)"
            >
              <Smartphone className="w-4 h-4 text-amber-300 animate-bounce flex-shrink-0" />
              {!collapsed && (
                <div className="text-left leading-tight">
                  <div className="text-amber-300 text-[11px] font-black uppercase tracking-wide">Tải App MH Chính</div>
                  <div className="text-[9px] text-red-100 font-medium">Cài đặt PWA nhanh chóng</div>
                </div>
              )}
            </button>
          </div>
        )}

        {/* Collapse Toggle Arrow Button */}
        <div className="p-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-slate-700 hover:text-red-800 hover:bg-slate-200/80 rounded-xl transition-colors border border-slate-200/80 bg-white"
            title={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4 text-red-700" />
            ) : (
              <>
                <ChevronLeft className="w-4 h-4 text-red-700" />
                <span className="font-bold text-slate-800">Thu gọn menu</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
};
