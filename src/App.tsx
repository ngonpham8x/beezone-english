import { Suspense } from 'react';
import { AuthenticationGate } from './app/AuthenticationGate';
import { QuickSearch } from './app/QuickSearch';
import { WorkspaceDialogs } from './app/WorkspaceDialogs';
import { WorkspaceScreens } from './app/WorkspaceScreens';
import { useWorkspaceDialogs } from './app/useWorkspaceDialogs';
import { useWorkspaceNavigation } from './app/useWorkspaceNavigation';
import { createCenterActions } from './modules/center/createCenterActions';
import { useCenterConnection } from './modules/center/useCenterConnection';
import { useCenterStore } from './modules/center/useCenterStore';
import { createActivityLogger } from './modules/system/activityLogger';
import { useAccountAudit } from './modules/system/useAccountAudit';
export { sanitizeClassName } from './modules/center/model';

import { ErrorBoundary } from './components/ErrorBoundary';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ToastContainer } from './components/Toast';
import { isLocalPreview } from './lib/supabase';

export default function App() {
  const store = useCenterStore();
  const { settings, students, classes, teachers, setActivityLogs, storageError } = store;
  const dialogs = useWorkspaceDialogs();
  const {
    setIsLoginOpen,
    setIsUserManagementOpen,
    setIsBackupModalOpen,
    setIsSettingsModalOpen,
    handleTriggerPwaInstall,
  } = dialogs;
  const connection = useCenterConnection(store, () => setIsLoginOpen(false));
  const { currentUser, session, authStatus, syncStatus, syncError, syncQueueRef, handleLogout } =
    connection;

  const navigation = useWorkspaceNavigation(currentUser);
  const {
    activeTab,
    navigateTo,
    sidebarCollapsed,
    setSidebarCollapsed,
    searchQuery,
    setSearchQuery,
    contentViewportRef,
  } = navigation;

  const addLog = createActivityLogger(currentUser, setActivityLogs);

  const audit = useAccountAudit(store, currentUser, session, activeTab);

  const actions = createCenterActions(store, currentUser, addLog);

  if (authStatus !== 'ready' || !currentUser || !session)
    return <AuthenticationGate connection={connection} />;

  return (
    <div className="min-h-svh bg-slate-100 flex flex-col font-sans antialiased text-slate-900">
      {/* Top Header Navigation */}
      <Header
        currentUser={currentUser}
        settings={settings}
        onOpenLogin={() => setIsLoginOpen(true)}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        onOpenBackupModal={() => setIsBackupModalOpen(true)}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onOpenPwaInstall={handleTriggerPwaInstall}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        onLogout={() => void handleLogout()}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        syncStatus={isLocalPreview ? 'preview' : syncStatus}
        statusNotice={
          isLocalPreview ? (
            <div className="border-t border-amber-200 bg-amber-50 px-4 py-1.5 text-xs text-amber-900">
              Bản xem thử • Dữ liệu chỉ lưu trên trình duyệt của máy này.
            </div>
          ) : undefined
        }
      />

      <QuickSearch
        students={students}
        classes={classes}
        teachers={teachers}
        currentUser={currentUser}
        navigation={navigation}
      />
      {(syncError || storageError) && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span className="flex-1">{syncError || storageError}</span>
          {syncStatus === 'error' && (
            <button
              onClick={() => syncQueueRef.current?.retry()}
              className="rounded-lg border border-red-300 px-3 py-1 font-bold"
            >
              Thử lưu lại
            </button>
          )}
          {(currentUser.role === 'owner' || currentUser.permissions.excel.export) && (
            <button
              onClick={() => setIsBackupModalOpen(true)}
              className="rounded-lg border border-red-300 px-3 py-1 font-bold"
            >
              Xuất sao lưu
            </button>
          )}
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="flex flex-1 items-start">
        {/* Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={navigateTo}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          currentUser={currentUser}
          onOpenPwaInstall={handleTriggerPwaInstall}
        />

        {/* Content View Container */}
        <main
          id="main-content"
          ref={contentViewportRef}
          className="workspace-content @container min-w-0 flex-1 p-3 sm:p-6 transition-all"
        >
          <ErrorBoundary key={activeTab}>
            <Suspense
              fallback={
                <div role="status" className="rounded-2xl bg-white p-6 text-sm text-slate-500">
                  Đang tải chức năng…
                </div>
              }
            >
              <WorkspaceScreens
                store={store}
                actions={actions}
                navigation={navigation}
                dialogs={dialogs}
                audit={audit}
                currentUser={currentUser}
              />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      <WorkspaceDialogs
        store={store}
        actions={actions}
        dialogs={dialogs}
        connection={connection}
        audit={audit}
        currentUser={currentUser}
        addLog={addLog}
      />

      <ToastContainer />
    </div>
  );
}
