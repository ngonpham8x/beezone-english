import { ChevronLeft, ChevronRight, Smartphone } from 'lucide-react';
import React, { useRef } from 'react';
import { getNavigationGroups } from '../app/navigation';
import { useLanguage } from '../context/LanguageContext';
import { useOverlay } from '../hooks/useOverlay';
import { DRAWER_QUERY, useMediaQuery } from '../hooks/useResponsive';
import { UserAccount } from '../types';

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
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  const sidebarRef = useRef<HTMLElement>(null);
  useOverlay(sidebarRef, isDrawer && !collapsed, () => setCollapsed(true));

  const menuGroups = getNavigationGroups(currentUser, t);

  return (
    <>
      {/* Mobile Backdrop when open */}
      {!collapsed && (
        <div
          onClick={() => setCollapsed(true)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-40 lg:hidden animate-fade-in"
          aria-hidden="true"
        />
      )}

      <aside
        ref={sidebarRef}
        role={isDrawer && !collapsed ? 'dialog' : undefined}
        aria-modal={isDrawer && !collapsed ? true : undefined}
        tabIndex={-1}
        id="primary-navigation"
        aria-label="Điều hướng chính"
        className={`app-sidebar flex-col overflow-hidden bg-white text-slate-800 transition-all duration-300 border-r border-slate-200/90 shadow-2xs ${
          collapsed
            ? 'hidden lg:flex lg:w-16 lg:sticky lg:self-start lg:z-20'
            : 'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] h-dvh shadow-2xl lg:shadow-none lg:static lg:sticky lg:self-start lg:w-64 lg:z-20'
        }`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2.5 py-3 custom-scrollbar">
          {/* Mobile Header Bar inside Sidebar when open */}
          <div className="flex lg:hidden items-center justify-between pb-3 mb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-900 uppercase tracking-tight">Danh mục quản lý</span>
              <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">BeeZone</span>
            </div>
            <button
              onClick={() => setCollapsed(true)}
              title="Thu gọn menu"
              aria-label="Thu gọn menu"
              className="min-w-11 p-1.5 rounded-xl text-slate-600 hover:text-amber-800 hover:bg-amber-100/70 border border-slate-200 bg-white shadow-xs transition active:scale-95 flex items-center justify-center"
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
                            if (isDrawer) {
                              setCollapsed(true);
                            }
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs sm:text-[13px] transition-all duration-150 ${
                            isActive
                              ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-sm shadow-amber-500/25 font-black ring-1 ring-amber-400/60'
                              : 'text-slate-700 hover:text-slate-950 hover:bg-amber-50/80 font-bold'
                          }`}
                          title={collapsed ? item.label : undefined}
                          aria-label={item.label}
                          aria-current={isActive ? 'page' : undefined}
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
        <div className="shrink-0 border-t border-slate-200 bg-slate-50/80">
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
