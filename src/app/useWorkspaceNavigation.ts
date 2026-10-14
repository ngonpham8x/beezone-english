import { reportError } from '../lib/diagnostics';
import { useEffect, useRef, useState } from 'react';
import { DRAWER_QUERY, useMediaQuery } from '../hooks/useResponsive';
import type { TaskDestination } from '../modules/dashboard/TodayTasks';
import type { ClassRoom, UserAccount } from '../types';
import { canAccessTab, isTabId, type TabId } from './navigation';
const ACTIVE_TAB_STORAGE_KEY = 'PHUC_PHUC_THINH_ACTIVE_TAB';
export function useWorkspaceNavigation(currentUser: UserAccount | null) {
  const [taskRequest, setTaskRequest] = useState<TaskDestination | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    try {
      const tabFromUrl = new URLSearchParams(window.location.search).get('tab');
      const candidate = tabFromUrl || sessionStorage.getItem(ACTIVE_TAB_STORAGE_KEY) || 'dashboard';
      return isTabId(candidate) ? candidate : 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const isDrawer = useMediaQuery(DRAWER_QUERY);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return typeof window !== 'undefined' && window.innerWidth < 1280;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (isDrawer) setSidebarCollapsed(true);
  }, [isDrawer]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [classEditRequest, setClassEditRequest] = useState<ClassRoom | null>(null);
  const contentViewportRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      // The page can scroll on desktop while the main area scrolls on smaller
      // viewports. Reset both whenever the user changes a menu/tab.
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      contentViewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab]);

  useEffect(() => {
    if (
      currentUser &&
      currentUser.role !== 'owner' &&
      !canAccessTab(activeTab, currentUser) &&
      activeTab !== 'dashboard'
    ) {
      setActiveTab('dashboard');
    }
  }, [activeTab, currentUser]);

  useEffect(() => {
    try {
      sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', activeTab);
      window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
      );
    } catch (error) {
      reportError('navigation.persist', error);
    }
  }, [activeTab]);

  const navigateTo = (tab: string) => {
    if (currentUser && canAccessTab(tab, currentUser)) setActiveTab(tab);
  };
  return {
    activeTab,
    navigateTo,
    sidebarCollapsed,
    setSidebarCollapsed,
    searchQuery,
    setSearchQuery,
    classEditRequest,
    setClassEditRequest,
    contentViewportRef,
    taskRequest,
    setTaskRequest,
  };
}
export type WorkspaceNavigation = ReturnType<typeof useWorkspaceNavigation>;
