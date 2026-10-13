import { useState } from 'react';
import { usePwaInstall } from './usePwaInstall';
export function useWorkspaceDialogs() {
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isImportExportModalOpen, setIsImportExportModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  return {
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
    ...usePwaInstall(),
  };
}
export type WorkspaceDialogs = ReturnType<typeof useWorkspaceDialogs>;
