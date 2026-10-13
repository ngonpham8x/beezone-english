import React, { useState, useEffect, useRef } from 'react';
import { DRAWER_QUERY, useMediaQuery } from '../hooks/useResponsive';
import { UserAccount, CenterSettings } from '../types';
import { Logo } from './Logo';
import { useLanguage } from '../context/LanguageContext';
import {
  ChevronDown,
  Search,
  Smartphone,
  Globe,
  ShieldCheck,
  UserCheck,
  Sparkles,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Menu,
  X
} from 'lucide-react';

interface HeaderProps {
  currentUser: UserAccount;
  settings: CenterSettings;
  onOpenLogin: () => void;
  onOpenUserManagement: () => void;
  onOpenBackupModal: () => void;
  onOpenSettingsModal: () => void;
  onOpenPwaInstall?: () => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onLogout: () => void;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  syncStatus?: 'preview' | 'saved' | 'saving' | 'error' | 'conflict';
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  settings,
  onOpenLogin,
  onOpenUserManagement,
  onOpenPwaInstall,
  searchQuery,
  setSearchQuery,
  sidebarCollapsed,
  onToggleSidebar,
  syncStatus = 'saved'
}) => {
  const { language, setLanguage, t } = useLanguage();
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  const headerRef = useRef<HTMLElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const oldHeight = document.documentElement.style.getPropertyValue('--app-header-height');
    const update = () => {
      const height = headerRef.current?.getBoundingClientRect().height;
      if (height) document.documentElement.style.setProperty('--app-header-height', `${Math.ceil(height)}px`);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    if (headerRef.current) observer?.observe(headerRef.current);
    update();
    window.addEventListener('resize', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); document.documentElement.style.setProperty('--app-header-height', oldHeight); };
  }, []);
  useEffect(() => { if (!isDrawer) setShowMobileSearch(false); }, [isDrawer]);
  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (window.matchMedia(DRAWER_QUERY).matches) {
          setShowMobileSearch(true);
          mobileSearchRef.current?.focus();
        }
        else searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <header ref={headerRef} className="app-header bg-white border-b border-amber-200/70 sticky top-0 z-30 shadow-2xs">
      <div className="app-header-row px-3 sm:px-4 py-2 flex items-center justify-between gap-2 sm:gap-3">
        {/* Brand & Logo & Mobile Toggle */}
        <div className="flex min-w-0 flex-1 lg:flex-initial lg:max-w-[35%] items-center gap-2 sm:gap-3">
          {/* Menu Collapse/Expand Arrow Button */}
          {onToggleSidebar && (
            <button
              onClick={onToggleSidebar}
              className="shrink-0 min-w-11 p-2 text-slate-700 hover:text-amber-700 hover:bg-amber-50 rounded-xl transition-all border border-slate-200 flex items-center justify-center bg-slate-50 shadow-2xs active:scale-95"
              title={sidebarCollapsed ? "Mở menu điều hướng" : "Thu gọn menu"}
              aria-label={sidebarCollapsed ? 'Mở menu điều hướng' : 'Thu gọn menu'}
              aria-expanded={!sidebarCollapsed}
              aria-controls="primary-navigation"
            >
              {sidebarCollapsed ? (
                <ChevronRight className="w-5 h-5 text-amber-600" />
              ) : (
                <ChevronLeft className="w-5 h-5 text-amber-600" />
              )}
            </button>
          )}

          <span className="shrink-0 hidden min-[360px]:block"><Logo size={42} /></span>
          <div className="min-w-0">
            <h1 className="font-black text-slate-900 tracking-tight text-xs sm:text-base md:text-lg leading-tight uppercase line-clamp-2">
              {settings.name}
            </h1>
            <p className="text-[11px] text-amber-700 font-bold truncate hidden sm:block">
              {settings.slogan}
            </p>
          </div>
        </div>

        {/* Center Search Bar */}
        <div className="min-w-0 flex-1 max-w-lg mx-2 hidden lg:block">
          <div className="relative w-full">
            <Search className="w-4 h-4 absolute left-3.5 top-2.5 text-slate-400" />
            <input
              ref={searchRef}
              aria-label="Tìm học viên hoặc lớp học"
              type="text"
              placeholder={`${t('search_placeholder')} (học sinh, lớp, giáo viên...)`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-12 py-2 bg-slate-100/70 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs sm:text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all shadow-2xs"
            />
            <span className="absolute right-3 top-2.5 text-[10px] font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200 select-none hidden lg:inline">
              Ctrl K
            </span>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {/* Live System Status Pill */}
          <div role="status" className={`hidden 2xl:flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold ${syncStatus === 'error' || syncStatus === 'conflict' ? 'border-red-200 bg-red-50 text-red-800' : syncStatus === 'saved' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <span className="w-2 h-2 rounded-full bg-current" />
            <span>{({ preview: 'Bản xem thử', saved: 'Đã lưu dữ liệu', saving: 'Đang lưu…', error: 'Chưa lưu được', conflict: 'Xung đột dữ liệu' })[syncStatus]}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowMobileSearch((shown) => !shown)}
            className="min-w-11 p-2 text-slate-600 hover:bg-slate-100 hover:text-amber-700 rounded-xl transition-colors lg:hidden"
            title={showMobileSearch ? 'Ẩn tìm kiếm' : 'Tìm kiếm'}
            aria-label={showMobileSearch ? 'Ẩn tìm kiếm' : 'Mở tìm kiếm'}
            aria-expanded={showMobileSearch}
            aria-controls="mobile-search"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* Owner Staff Permission Button shortcut */}
          {currentUser.role === 'owner' && (
            <button
              onClick={onOpenUserManagement}
              className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold rounded-xl text-xs flex items-center gap-1.5 border border-amber-300 transition-colors hidden lg:flex shadow-2xs active:scale-95"
              title="Cấp quyền quản lý cho nhân viên trung tâm"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-700" />
              <span>{t('permissions')}</span>
            </button>
          )}

          {/* User Account Dropdown Pill */}
          <div className="relative group">
            <button
              onClick={onOpenLogin}
              aria-label="Mở tài khoản"
              className="flex items-center gap-2 pl-1.5 py-1 pr-2.5 bg-slate-50 hover:bg-amber-50/80 rounded-xl transition-all border border-slate-200 shadow-2xs active:scale-95"
              title="Chuyển đổi tài khoản / Phân quyền"
            >
              {currentUser.avatar ? <img
                src={currentUser.avatar}
                alt={currentUser.name}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-amber-300/80"
                referrerPolicy="no-referrer"
              /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-amber-100 text-sm font-bold text-amber-900">{currentUser.name.slice(0, 1)}</span>}
              <div className="min-w-0 max-w-32 text-left hidden sm:block">
                <div className="truncate text-xs font-bold text-slate-800 leading-tight">
                  {currentUser.name.replace(/\s*\(Quản [L|l]ý\)/gi, '')}
                </div>
                <div className="text-[10px] font-bold text-amber-700 flex items-center gap-1">
                  <span>{currentUser.role === 'owner' ? t('owner') : t('staff')}</span>
                </div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 transition-colors" />
            </button>
          </div>
        </div>
      </div>

      {showMobileSearch && (
        <div id="mobile-search" className="border-t border-slate-100 px-3 pb-2 pt-1.5 lg:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              ref={mobileSearchRef}
              aria-label="Tìm học viên, lớp học hoặc giáo viên"
              onKeyDown={event => { if (event.key === 'Escape') setShowMobileSearch(false); }}
              autoFocus
              type="text"
              placeholder={t('search_placeholder')}
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-100/80 py-2 pl-10 pr-10 text-sm placeholder-slate-400 transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <button
              type="button"
              onClick={() => setShowMobileSearch(false)}
              className="absolute right-0 top-0 min-w-11 h-full rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
              title="Ẩn tìm kiếm"
              aria-label="Ẩn tìm kiếm"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
