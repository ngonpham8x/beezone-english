import { lazy, Suspense } from 'react';
import { DialogFrame } from '../components/DialogFrame';
import { PwaInstallModal } from '../components/PwaInstallModal';
import { LoginModal } from '../modules/auth/LoginModal';
import { UserManagementModal } from '../modules/auth/UserManagementModal';
import { ACCOUNT_DIRECTORY_CHANGED_EVENT } from '../lib/appEvents';
import type { CenterActions } from '../modules/center/createCenterActions';
import type { CenterConnection } from '../modules/center/useCenterConnection';
import type { CenterStore } from '../modules/center/useCenterStore';
import type { ActivityLogger } from '../modules/system/activityLogger';
import { SystemSettingsModal } from '../modules/system/SystemSettingsModal';
import type { AccountAudit } from '../modules/system/useAccountAudit';
import type { UserAccount } from '../types';
import type { WorkspaceDialogs } from './useWorkspaceDialogs';

const ImportExportModal = lazy(() =>
  import('../modules/system/ImportExportModal').then((module) => ({
    default: module.ImportExportModal,
  })),
);
const BackupManager = lazy(() =>
  import('../modules/system/BackupManager').then((module) => ({ default: module.BackupManager })),
);
interface Props {
  store: CenterStore;
  actions: CenterActions;
  dialogs: WorkspaceDialogs;
  connection: CenterConnection;
  audit: AccountAudit;
  currentUser: UserAccount;
  addLog: ActivityLogger;
}
export function WorkspaceDialogs({
  store,
  actions,
  dialogs,
  connection,
  audit,
  currentUser,
  addLog,
}: Props) {
  const {
    settings,
    setSettings,
    programs,
    teachers,
    rooms,
    classes,
    students,
    timetableSlots,
    grades,
    receipts,
    backups,
    activityLogs,
    attendanceSessions,
    enrollments,
    scheduleChanges,
  } = store;
  const { handleImportStudents, handleImportCenterData, handleImportAcademicCatalog, handleBackupCreated, handleRestoreBackup } =
    actions;
  const {
    isLoginOpen,
    setIsLoginOpen,
    isUserManagementOpen,
    setIsUserManagementOpen,
    isBackupModalOpen,
    setIsBackupModalOpen,
    isImportExportModalOpen,
    setIsImportExportModalOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isPwaModalOpen,
    setIsPwaModalOpen,
    deferredPrompt,
    setDeferredPrompt,
  } = dialogs;
  const { session, canSyncCenterData, handleLogout, handleDevLogin, handleAccountLogin } =
    connection;
  const { loadAccountAuditLogs } = audit;
  return (
    <>
      {' '}
      {/* MODALS */}
      <LoginModal
        isOpen={isLoginOpen}
        onClose={() => setIsLoginOpen(false)}
        currentUser={currentUser}
        authenticatedUser={session?.user}
        onLogout={handleLogout}
        onSwitchRole={handleDevLogin}
        onSwitchAccount={handleAccountLogin}
        onManageAccounts={() => setIsUserManagementOpen(true)}
      />
      <UserManagementModal
        isOpen={isUserManagementOpen}
        onClose={() => setIsUserManagementOpen(false)}
        accessToken={session?.access_token || ''}
        currentUser={currentUser}
        classes={classes}
        teachers={teachers}
        onAccountChanged={() => {
          void loadAccountAuditLogs();
          window.dispatchEvent(new Event(ACCOUNT_DIRECTORY_CHANGED_EVENT));
        }}
      />
      {isImportExportModalOpen && (
        <Suspense fallback={null}>
          <ImportExportModal
            isOpen={isImportExportModalOpen}
            onClose={() => setIsImportExportModalOpen(false)}
            students={students}
            programs={programs}
            teachers={teachers}
            rooms={rooms}
            classes={classes}
            receipts={receipts}
            attendanceSessions={attendanceSessions}
            grades={grades}
            settings={settings}
            canSyncCenterData={canSyncCenterData}
            isOwner={currentUser.role === 'owner'}
            permissions={currentUser.permissions}
            onImportStudents={handleImportStudents}
            onImportCenterData={handleImportCenterData}
              onImportAcademicCatalog={handleImportAcademicCatalog}
            onExportExcel={(filename) =>
              addLog('EXPORT', 'Excel', `Xuất báo cáo Excel ${filename}`)
            }
          />
        </Suspense>
      )}
      <SystemSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={(s) => {
          setSettings(s);
          addLog('SỬA', 'Cài đặt', 'Cập nhật thông tin trung tâm & email báo cáo hằng tuần');
        }}
      />
      {isBackupModalOpen && (
        <DialogFrame
          label="Sao lưu dữ liệu"
          onClose={() => setIsBackupModalOpen(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
        >
          <div className="dialog-panel bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsBackupModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              ✕
            </button>
            <Suspense
              fallback={<div className="p-6 text-sm text-slate-500">Đang tải công cụ sao lưu…</div>}
            >
              <BackupManager
                backups={backups}
                settings={settings}
                students={students}
                teachers={teachers}
                rooms={rooms}
                classes={classes}
                receipts={receipts}
                grades={grades}
                onOpenImportExportModal={() => setIsImportExportModalOpen(true)}
                programs={programs}
                timetableSlots={timetableSlots}
                activityLogs={activityLogs}
                enrollments={enrollments}
                scheduleChanges={scheduleChanges}
                attendanceSessions={attendanceSessions}
                onBackupCreated={currentUser.role === 'owner' ? handleBackupCreated : undefined}
                onRestoreBackup={currentUser.role === 'owner' ? handleRestoreBackup : undefined}
              />
            </Suspense>
          </div>
        </DialogFrame>
      )}
      <PwaInstallModal
        isOpen={isPwaModalOpen}
        onClose={() => setIsPwaModalOpen(false)}
        deferredPrompt={deferredPrompt}
        onPromptHandled={() => setDeferredPrompt(null)}
      />
    </>
  );
}
