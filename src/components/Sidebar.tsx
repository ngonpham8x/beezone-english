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
  ChevronLeft,
  ChevronRight,
  Smartphone,
  Globe,
  UserCheck,
  RefreshCw,
  Layers,
  UserPlus,
  X
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

  const menuGroups = [
    {
      title: 'TỔNG QUAN & ĐIỂM DANH',
      items: [
        { id: 'dashboard', label: t('dashboard'), icon: LayoutDashboard, visible: true, iconColor: 'text-amber-600' },
        { id: 'attendance', label: 'Điểm danh buổi học', icon: UserCheck, visible: isOwner || perms.student.view || perms.teacher.view, iconColor: 'text-emerald-600' },
        { id: 'admissions', label: 'Tuyển sinh & Ghi danh', icon: UserPlus, visible: isOwner || perms.student.view, iconColor: 'text-blue-600' },
      ]
    },
    {
      title: 'ĐÀO TẠO & HỌC VỤ',
      items: [
        { id: 'programs', label: 'Chương trình học', icon: Layers, visible: isOwner || perms.student.view, iconColor: 'text-amber-600' },
        { id: 'students', label: t('students'), icon: Users, visible: isOwner || perms.student.view, iconColor: 'text-emerald-600' },
        { id: 'teachers', label: t('teachers'), icon: GraduationCap, visible: isOwner || perms.teacher.view, iconColor: 'text-indigo-600' },
        { id: 'classes', label: t('classes'), icon: BookOpen, visible: isOwner || perms.student.view, iconColor: 'text-amber-600' },
        { id: 'rooms', label: t('rooms'), icon: DoorOpen, visible: isOwner || perms.student.view || perms.teacher.view, iconColor: 'text-rose-600' },
        { id: 'timetable', label: t('timetable'), icon: CalendarDays, visible: isOwner || perms.student.view || perms.teacher.view, iconColor: 'text-purple-600' },
        { id: 'teacher-schedule', label: 'Lịch giáo viên', icon: CalendarCheck, visible: isOwner || perms.student.view || perms.teacher.view, iconColor: 'text-cyan-600' },
        { id: 'grades', label: t('grades'), icon: XCircle, visible: isOwner || perms.grade.view, iconColor: 'text-orange-600' },
      ]
    },
    {
      title: 'TÀI CHÍNH & BÁO CÁO',
      items: [
        { id: 'tuition', label: t('tuition'), icon: DollarSign, visible: isOwner || perms.tuition.view, iconColor: 'text-emerald-700' },
        { id: 'reports', label: t('reports'), icon: BarChart3, visible: isOwner || (perms.report?.view && perms.report?.revenue), iconColor: 'text-indigo-700' },
      ]
    },
    {
      title: 'HỆ THỐNG',
      items: [
        { id: 'excel-import-export', label: t('excel'), icon: FileDown, visible: isOwner || perms.excel.import || perms.excel.export, iconColor: 'text-teal-600' },
        { id: 'data-consistency', label: 'Kiểm tra dữ liệu', icon: RefreshCw, visible: isOwner, iconColor: 'text-violet-600' },
        { id: 'backups', label: t('backups'), icon: CloudUpload, visible: isOwner, iconColor: 'text-sky-600' },
        { id: 'settings', label: t('settings'), icon: Settings, visible: isOwner, iconColor: 'text-slate-600' },
        { id: 'activity-logs', label: t('system_logs'), icon: History, visible: isOwner, iconColor: 'text-slate-700' },
      ]
    }
  ];

  return (
    <>
      {/* Mobile Backdrop when open */}
      {!collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 md:hidden animate-fade-in"
          aria-hidden="true"
        />
      )}

      <aside
        className={`bg-white text-slate-800 transition-all duration-300 border-r border-slate-200/90 shadow-2xs custom-scrollbar ${
          collapsed
            ? 'hidden md:block md:w-16 md:sticky md:top-[52px] md:self-start md:h-[calc(100vh-52px)] md:overflow-y-auto md:z-20'
            : 'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] h-full overflow-y-auto shadow-2xl md:shadow-none md:static md:sticky md:top-[52px] md:self-start md:h-[calc(100vh-52px)] md:w-64 md:z-20'
        }`}
      >
        <div className="px-2.5 py-3">
          {/* Mobile Header Bar inside Sidebar when open */}
          <div className="flex md:hidden items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900 uppercase tracking-tight">Danh mục quản lý</span>
              <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">BeeZone</span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              title="Thu gọn menu"
              aria-label="Thu gọn menu"
              className="p-1.5 rounded-xl text-slate-600 hover:text-amber-800 hover:bg-amber-100/70 border border-slate-200 bg-white shadow-xs transition active:scale-95 flex items-center justify-center"
            >
              <ChevronLeft className="w-5 h-5 text-amber-700" />
            </button>
          </div>

          {/* Navigation Menu by Groups */}
          <nav className="space-y-4">
            {menuGroups.map((group, gIdx) => {
              const visibleItems = group.items.filter(item => item.visible);
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.title} className={gIdx > 0 ? 'pt-1' : ''}>
                  {!collapsed ? (
                    <div className="px-2.5 pb-1.5 text-[10px] font-black tracking-wider text-slate-400 uppercase">
                      {group.title}
                    </div>
                  ) : gIdx > 0 ? (
                    <div className="my-2 border-t border-slate-100" />
                  ) : null}

                  <div className="space-y-1">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activeTab === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setActiveTab(item.id);
                            if (typeof window !== 'undefined' && window.innerWidth < 768) {
                              setCollapsed(true);
                            }
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs sm:text-[13px] transition-all duration-150 ${
                            isActive
                              ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-sm shadow-amber-500/25 font-black ring-1 ring-amber-400/60'
                              : 'text-slate-700 hover:text-slate-950 hover:bg-amber-50/80 font-bold'
                          }`}
                          title={collapsed ? item.label : undefined}
                        >
                          <Icon className={`w-4 h-4 flex-shrink-0 transition-transform ${isActive ? 'text-slate-950 scale-105' : item.iconColor}`} />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Footer Area: PWA Download Button + Collapse Toggle Arrow */}
        <div className="border-t border-slate-200 bg-slate-50/80 sticky bottom-0">
          {/* Move App Download button to the bottom of page / sidebar */}
          {onOpenPwaInstall && (
            <div className="p-2 border-b border-slate-200/80 bg-amber-50/40">
              <button
                onClick={onOpenPwaInstall}
                className={`w-full flex items-center gap-2.5 p-2 rounded-xl bg-gradient-to-r from-slate-900 via-slate-950 to-slate-900 hover:from-slate-800 hover:to-slate-900 text-white font-extrabold text-xs shadow-xs border border-amber-400/50 transition-all active:scale-95 ${
                  collapsed ? 'justify-center' : 'justify-start'
                }`}
                title="Tải ứng dụng ra Màn Hình Chính (PWA)"
              >
                <Smartphone className="w-4 h-4 text-amber-400 animate-bounce flex-shrink-0" />
                {!collapsed && (
                  <div className="text-left leading-tight">
                    <div className="text-amber-400 text-[11px] font-black uppercase tracking-wide">Tải App MH Chính</div>
                    <div className="text-[9px] text-slate-300 font-medium">Cài đặt PWA nhanh chóng</div>
                  </div>
                )}
              </button>
            </div>
          )}

          {/* Collapse Toggle Arrow Button */}
          <div className="p-2">
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold text-slate-700 hover:text-amber-800 hover:bg-amber-50 rounded-xl transition-colors border border-slate-200/80 bg-white shadow-2xs"
              title={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
            >
              {collapsed ? (
                <ChevronRight className="w-4 h-4 text-amber-600" />
              ) : (
                <>
                  <ChevronLeft className="w-4 h-4 text-amber-600" />
                  <span className="font-bold text-slate-800">Thu gọn menu</span>
                </>
              )}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
