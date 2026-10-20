import { LoaderCircle, ShieldCheck, UserRoundCheck, X } from 'lucide-react';
import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { ActiveSession, getActiveSessions, removeActiveSession } from '../../lib/activeSessions';
import { readApiJson } from '../../lib/http';
import { isLocalPreview } from '../../lib/supabase';
import { toast } from '../../lib/toast';
import { createStaffPermissions, normalizeStaffPermissions } from '../../lib/permissions';
import { ClassRoom, StaffPermissions, Teacher, UserAccount, UserRole } from '../../types';

interface ManagedUser {
  id: string;
  email?: string;
  full_name: string;
  avatar_url: string | null;
  role?: UserRole;
  is_active?: boolean;
  permissions?: StaffPermissions;
}

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
  currentUser?: UserAccount | null;
  classes?: ClassRoom[];
  teachers?: Teacher[];
  onAccountChanged?: () => void;
}

const createEmptyPermissions = () => createStaffPermissions();

const permissionGroups: { title: string; options: { module: keyof StaffPermissions; action: string; label: string; emphasis?: boolean }[] }[] = [
  {
    title: 'Học viên',
    options: [
      { module: 'student', action: 'view', label: 'Xem học viên' },
      { module: 'student', action: 'add', label: 'Thêm học viên' },
      { module: 'student', action: 'edit', label: 'Sửa học viên' },
      { module: 'student', action: 'delete', label: 'Xóa học viên' },
      { module: 'student', action: 'export', label: 'Xuất danh sách' },
    ],
  },
  {
    title: 'Quản lý đào tạo (thêm, sửa, xóa)',
    options: [
      { module: 'academic', action: 'programs', label: 'Thêm / sửa / xóa chương trình học' },
      { module: 'academic', action: 'classes', label: 'Thêm / sửa / xóa lớp học & lịch học' },
      { module: 'academic', action: 'rooms', label: 'Thêm / sửa / xóa phòng học' },
    ],
  },
  {
    title: 'Học phí & báo cáo',
    options: [
      { module: 'tuition', action: 'view', label: 'Xem học phí' },
      { module: 'tuition', action: 'collect', label: 'Thu học phí' },
      { module: 'tuition', action: 'delete', label: 'Xóa phiếu thu' },
      { module: 'tuition', action: 'showDebt', label: 'Xem công nợ', emphasis: true },
      { module: 'report', action: 'view', label: 'Xem báo cáo' },
      { module: 'report', action: 'revenue', label: 'Xem doanh thu', emphasis: true },
    ],
  },
  {
    title: 'Học vụ & tệp dữ liệu',
    options: [
      { module: 'teacher', action: 'view', label: 'Xem giáo viên' },
      { module: 'teacher', action: 'edit', label: 'Thêm / sửa giáo viên' },
      { module: 'teacher', action: 'delete', label: 'Xóa giáo viên' },
      { module: 'grade', action: 'view', label: 'Xem điểm' },
      { module: 'grade', action: 'edit', label: 'Nhập / sửa điểm' },
      { module: 'excel', action: 'import', label: 'Nhập Excel' },
      { module: 'excel', action: 'export', label: 'Xuất Excel' },
    ],
  },
];

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose, accessToken, currentUser, classes = [], teachers = [], onAccountChanged }) => {
  const [members, setMembers] = useState<ManagedUser[]>([]);
  const [hiddenAccountIds, setHiddenAccountIds] = useState<string[]>([]);
  const [accountVisibilityReady, setAccountVisibilityReady] = useState(false);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('staff');
  const [staffPermissions, setStaffPermissions] = useState<StaffPermissions>(createEmptyPermissions);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [editRole, setEditRole] = useState<UserRole>('staff');
  const [editPermissions, setEditPermissions] = useState<StaffPermissions>(createEmptyPermissions);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const memberRequest = useRef(0);
  const dialogOpen = useRef(isOpen);
  dialogOpen.current = isOpen;

  const refreshActiveSessions = useCallback(() => {
    const sessions = getActiveSessions().filter(session =>
      !hiddenAccountIds.includes(session.id) && !(currentUser?.isPrivate &&
        (session.id === currentUser.id || (session.email || '').toLowerCase() === currentUser.email.toLowerCase()))
    );
    if (currentUser && !currentUser.isPrivate && (currentUser.email || currentUser.name)) {
      const exists = sessions.some(
        (s) =>
          (s.email && currentUser.email && s.email.toLowerCase() === currentUser.email.toLowerCase()) ||
          s.id === currentUser.id
      );
      if (!exists) {
        sessions.unshift({
          id: currentUser.id,
          name: currentUser.name || (currentUser.email ? currentUser.email.split('@')[0] : 'Chủ trung tâm BeeZone'),
          email: currentUser.email || '',
          avatar: currentUser.avatar,
          role: currentUser.role,
          loginTime: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          lastActive: Date.now(),
        });
      }
    }
    setActiveSessions(sessions);
  }, [currentUser, hiddenAccountIds]);

  const loadMembers = useCallback(async () => {
    if (!accessToken) return;
    const requestId = ++memberRequest.current;
    if (isLocalPreview) { setMembers([]); setAccountVisibilityReady(true); setError('Bản xem thử chưa kết nối quản lý tài khoản. Cấp quyền Google cần cấu hình Supabase và máy chủ.'); return; }
    setAccountVisibilityReady(false);
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      });
      const payload = await readApiJson<{ users: ManagedUser[]; hiddenAccountIds?: string[] }>(response, 'Không thể tải danh sách tài khoản.');
      if (requestId !== memberRequest.current || !dialogOpen.current) return;
      if (!Array.isArray(payload.users)) throw new Error('Danh sách tài khoản không đúng định dạng.');
      setMembers(payload.users);
      setHiddenAccountIds(Array.isArray(payload.hiddenAccountIds) ? payload.hiddenAccountIds.filter(id => typeof id === 'string') : []);
      setAccountVisibilityReady(true);
    } catch (error) {
      if (requestId !== memberRequest.current || !dialogOpen.current) return;
      setMembers([]);
      setError(error instanceof Error ? error.message : 'Không thể tải danh sách tài khoản.');
    } finally {
      if (requestId === memberRequest.current && dialogOpen.current) setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (isOpen) {
      void loadMembers();
    } else { memberRequest.current++; setAccountVisibilityReady(false); }
  }, [isOpen, loadMembers]);
  useEffect(() => { if (isOpen) refreshActiveSessions(); }, [isOpen, refreshActiveSessions]);

  if (!isOpen) return null;
  const displayedMembers = accountVisibilityReady ? members : [];
  const displayedSessions = accountVisibilityReady ? activeSessions.filter(session => !hiddenAccountIds.includes(session.id)) : [];

  const togglePermission = (module: keyof StaffPermissions, action: string) => {
    setStaffPermissions((current) => ({
      ...current,
      [module]: {
        ...(current[module] as Record<string, boolean>),
        [action]: !(current[module] as Record<string, boolean>)[action],
      },
    } as StaffPermissions));
  };

  const selectAllPermissions = () => {
    setStaffPermissions((current) => {
      return {
        ...createStaffPermissions(true),
        assignedClassIds: current.assignedClassIds,
        teacherId: current.teacherId,
      } as StaffPermissions;
    });
  };

  const clearAllPermissions = () => {
    setStaffPermissions((current) => ({
      ...createEmptyPermissions(),
      assignedClassIds: current.assignedClassIds,
      teacherId: current.teacherId,
    }));
  };

  const selectAllClasses = () => {
    setStaffPermissions((current) => ({
      ...current,
      assignedClassIds: classes.map((c) => c.id),
    }));
  };

  const grantGoogleAccess = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLocalPreview || isSubmitting) return;
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ email, fullName, role, permissions: role === 'staff' ? staffPermissions : undefined }),
      });
      await readApiJson(response, 'Không thể cấp quyền Google.');
      setEmail('');
      setFullName('');
      setRole('staff');
      setStaffPermissions(createEmptyPermissions());
      setMessage('Đã cấp quyền. Người này chỉ cần đăng nhập Google bằng đúng email để sử dụng hệ thống.');
      toast.success('Đã cấp quyền truy cập thành công!');
      await loadMembers();
      onAccountChanged?.();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể cấp quyền Google.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditModal = (member: ManagedUser) => {
    setEditingUser(member);
    setEditRole(member.role || 'staff');
    setEditPermissions(normalizeStaffPermissions(member.permissions));
    setError(null);
  };

  const handleUpdateUserPermissions = async (event: FormEvent) => {
    event.preventDefault();
    if (!editingUser || isSubmitting || isLocalPreview) return;
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          action: 'updatePermissions',
          userId: editingUser.id,
          role: editRole,
          permissions: editRole === 'staff' ? editPermissions : undefined,
        }),
      });
      await readApiJson(response, 'Không thể cập nhật cấp quyền.');
      const targetName = editingUser.full_name || editingUser.email || 'tài khoản';
      setEditingUser(null);
      await loadMembers();
      onAccountChanged?.();
      setMessage(`Cập nhật cấp quyền thành công cho tài khoản "${targetName}"!`);
      toast.success(`Cập nhật cấp quyền thành công cho tài khoản "${targetName}"!`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể cập nhật cấp quyền.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const setAccountActive = async (member: ManagedUser) => {
    if (isSubmitting || isLocalPreview || member.id === currentUser?.id) return;
    setIsSubmitting(true); setError(null); setMessage(null);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'setActive', userId: member.id, active: !member.is_active }),
      });
      await readApiJson(response, 'Không thể cập nhật trạng thái tài khoản.');
      await loadMembers(); onAccountChanged?.();
      setMessage(member.is_active ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.');
      toast.success(member.is_active ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Không thể cập nhật tài khoản.'); }
    finally { setIsSubmitting(false); }
  };

  const deleteAccount = async (member: ManagedUser) => {
    if (isSubmitting || isLocalPreview || member.id === currentUser?.id) return;
    const nameOrEmail = member.full_name || member.email || 'tài khoản này';
    if (!window.confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn tài khoản "${nameOrEmail}" khỏi hệ thống không?\n\nLưu ý: Hành động này không thể hoàn tác.`)) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ action: 'delete', userId: member.id }),
      });
      await readApiJson(response, 'Không thể xóa tài khoản.');
      removeActiveSession(member.id);
      if (member.email) removeActiveSession(member.email);
      if (email === member.email) {
        setEmail('');
        setFullName('');
        setRole('staff');
        setStaffPermissions(createEmptyPermissions());
      }
      await loadMembers();
      refreshActiveSessions();
      onAccountChanged?.();
      setMessage(`Đã xóa vĩnh viễn tài khoản "${nameOrEmail}".`);
      toast.success(`Đã xóa vĩnh viễn tài khoản "${nameOrEmail}".`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Không thể xóa tài khoản.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogFrame label="Quản lý tài khoản" onClose={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <section    className="dialog-panel relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng">
          <X className="h-5 w-5" />
        </button>
        <div className="pr-8">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><ShieldCheck className="h-5 w-5 text-amber-600" /> Quản lý tài khoản</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">Chỉ Chủ trung tâm có thể cấp hoặc khóa tài khoản. Tài khoản mới chỉ đăng nhập bằng Google, không cần đặt mật khẩu.</p>
        </div>

        <form className="mt-5 grid grid-cols-1 gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:grid-cols-2" onSubmit={grantGoogleAccess}>
          <label className="text-xs font-bold text-slate-700">Họ và tên
            <input value={fullName} onChange={(event) => setFullName(event.target.value)} required minLength={2} maxLength={120} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
          </label>
          <label className="text-xs font-bold text-slate-700">Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500" />
          </label>
          <label className="text-xs font-bold text-slate-700">Cấp bậc
            <select value={role} onChange={(event) => setRole(event.target.value as UserRole)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-500">
              <option value="staff">Nhân viên</option>
              <option value="owner">Chủ trung tâm</option>
            </select>
          </label>
          {role === 'staff' && (
            <fieldset className="sm:col-span-2 rounded-xl border border-amber-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <legend className="px-1 text-xs font-extrabold text-slate-900">Quyền cho nhân viên</legend>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllPermissions}
                    className="rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    ✓ Chọn tất cả quyền
                  </button>
                  <button
                    type="button"
                    onClick={clearAllPermissions}
                    className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    Bỏ chọn hết
                  </button>
                </div>
              </div>
              <p className="mb-3 text-[11px] leading-4 text-slate-500">Chỉ tick các quyền cần thiết hoặc bấm "Chọn tất cả quyền". Quyền doanh thu và công nợ nên cấp riêng nếu cần bảo mật.</p>
              <div className="grid gap-3 md:grid-cols-3">
                {permissionGroups.map((group) => (
                  <div key={group.title} className="rounded-lg bg-slate-50 p-2.5">
                    <p className="mb-2 text-[11px] font-extrabold uppercase text-slate-700">{group.title}</p>
                    <div className="space-y-1.5">
                      {group.options.map((option) => {
                        const checked = Boolean((staffPermissions[option.module] as Record<string, boolean>)?.[option.action]);
                        return (
                          <label key={`${option.module}.${option.action}`} className={`flex cursor-pointer items-start gap-2 text-[11px] font-medium ${option.emphasis ? 'text-amber-900' : 'text-slate-700'}`}>
                            <input type="checkbox" checked={checked} onChange={() => togglePermission(option.module, option.action)} className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                            <span>{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Phân công lớp phụ trách cho giáo viên/nhân viên */}
                <div className="md:col-span-3 rounded-lg bg-amber-50/70 border border-amber-200/80 p-3 mt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <p className="text-[11px] font-extrabold uppercase text-amber-900 flex items-center gap-1.5">
                      Phân công lớp phụ trách (Chỉ được Điểm danh & Chấm điểm các lớp này)
                    </p>
                    {classes.length > 0 && (
                      <button
                        type="button"
                        onClick={selectAllClasses}
                        className="rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 px-2.5 py-0.5 text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        ✓ Chọn tất cả lớp
                      </button>
                    )}
                  </div>
                  <p className="mb-2 text-[10px] text-slate-500">Giáo viên/Nhân viên chỉ có thể thấy và thao tác trên những lớp được tick chọn bên dưới:</p>
                  {classes.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">Chưa có dữ liệu lớp học trong hệ thống.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto pr-1">
                      {classes.map(c => {
                        const isAssigned = staffPermissions.assignedClassIds?.includes(c.id) || false;
                        return (
                          <label key={c.id} className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-800 bg-white p-1.5 rounded-lg border border-slate-200 hover:border-amber-400">
                            <input
                              type="checkbox"
                              checked={isAssigned}
                              onChange={(e) => {
                                const currentIds = staffPermissions.assignedClassIds || [];
                                const nextIds = e.target.checked
                                  ? [...currentIds, c.id]
                                  : currentIds.filter(id => id !== c.id);
                                setStaffPermissions(prev => ({ ...prev, assignedClassIds: nextIds }));
                              }}
                              className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                            />
                            <span className="truncate font-semibold text-xs">{c.name.replace(/\s*\([^)]*\)/g, '').trim()}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {teachers.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-amber-200/60 flex flex-col sm:flex-row sm:items-center gap-2">
                      <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">Gán hồ sơ giáo viên:</span>
                      <select
                        value={staffPermissions.teacherId || ''}
                        onChange={(e) => setStaffPermissions(prev => ({ ...prev, teacherId: e.target.value || undefined }))}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">-- Tự do / Chưa liên kết giáo viên cụ thể --</option>
                        {teachers.map(t => (
                          <option key={t.id} value={t.id}>{t.name} ({t.id})</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </fieldset>
          )}
          <div className="flex items-end">
            <button type="submit" disabled={isSubmitting || isLocalPreview} className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60 flex items-center justify-center gap-2 shadow-xs transition">
              {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin text-slate-950" /> : <UserRoundCheck className="h-4 w-4 text-slate-950" />} Cấp quyền Google
            </button>
          </div>
        </form>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-800">{error}</p>}
        {message && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-800">{message}</p>}

        <div className="mt-6 flex items-center justify-between gap-3"><h3 className="text-sm font-bold">Tài khoản đã được cấp quyền</h3><button disabled={isLoading || isLocalPreview} onClick={() => void loadMembers()} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">{isLoading ? 'Đang tải…' : 'Làm mới'}</button></div>
        <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {!isLoading && displayedMembers.length === 0 && <p className="p-4 text-sm text-slate-500">Chưa có danh sách tài khoản.</p>}
          {displayedMembers.map(member => <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="min-w-0"><p className="break-words text-sm font-bold">{member.full_name || member.email}</p><p className="break-all text-xs text-slate-500">{member.email}</p><p className="mt-1 text-xs text-slate-600">{member.role === 'owner' ? 'Chủ trung tâm' : 'Nhân viên'} • {member.is_active ? 'Được truy cập' : 'Đã khóa'}</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => openEditModal(member)}
                className="rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50 transition-colors disabled:opacity-50"
              >
                Sửa quyền
              </button>
              <button
                type="button"
                disabled={isSubmitting || member.id === currentUser?.id}
                onClick={() => void setAccountActive(member)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {member.is_active ? 'Khóa' : 'Mở khóa'}
              </button>
              <button
                type="button"
                disabled={isSubmitting || member.id === currentUser?.id}
                onClick={() => void deleteAccount(member)}
                className="rounded-lg border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50"
                title={member.id === currentUser?.id ? 'Không thể tự xóa tài khoản đang đăng nhập' : 'Xóa vĩnh viễn tài khoản khỏi hệ thống'}
              >
                Xóa
              </button>
            </div>
          </div>)}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Phiên ghi nhận trên trình duyệt này</h3>
            <p className="text-[11px] text-slate-500">
              {displayedSessions.length > 0
                ? `${displayedSessions.length} phiên được ghi nhận cục bộ; không phản ánh trạng thái trực tuyến trên các máy khác.`
                : 'Chưa có tài khoản nào đăng nhập'}
            </p>
          </div>
          {displayedSessions.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {displayedSessions.length} phiên cục bộ
            </span>
          )}
        </div>

        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
          {displayedSessions.length === 0 ? (
            <div className="p-5 text-center text-xs text-slate-400">
              Chưa có tài khoản nào đăng nhập vào hệ thống.
            </div>
          ) : (
            displayedSessions.map((sessionUser) => {
              const isCurrent = Boolean(
                currentUser &&
                ((sessionUser.email && currentUser.email && sessionUser.email.toLowerCase() === currentUser.email.toLowerCase()) ||
                  sessionUser.id === currentUser.id)
              );
              const displayName = (sessionUser.name && sessionUser.name.trim() !== '')
                ? sessionUser.name
                : (sessionUser.email ? sessionUser.email.split('@')[0] : 'Tài khoản BeeZone');

              return (
                <div key={sessionUser.id || sessionUser.email} className="flex items-center justify-between p-3 hover:bg-slate-50/70 transition">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      {sessionUser.avatar ? (
                        <img
                          src={sessionUser.avatar}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover border border-slate-200"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="grid h-9 w-9 place-items-center rounded-full bg-amber-100 text-amber-900 font-bold text-xs uppercase border border-amber-200">
                          {displayName.charAt(0)}
                        </div>
                      )}
                      <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {displayName}
                        </p>
                        {isCurrent && (
                          <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-900 border border-amber-200">
                            Phiên này
                          </span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-slate-500">{sessionUser.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        sessionUser.role === 'owner'
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : 'bg-blue-100 text-blue-900 border border-blue-200'
                      }`}
                    >
                      {sessionUser.role === 'owner' ? 'Chủ trung tâm' : 'Nhân viên'}
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 hidden sm:inline-block">
                      ● Đang hoạt động
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {editingUser && (
        <DialogFrame
          label={`Sửa quyền ${editingUser.full_name || editingUser.email}`}
          onClose={() => setEditingUser(null)}
          className="fixed inset-0 z-60 flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-xs"
        >
          <div className="dialog-panel relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="pr-8">
              <h3 className="flex items-center gap-2 text-base font-extrabold text-slate-900">
                <ShieldCheck className="h-5 w-5 text-amber-600" />
                Sửa cấp quyền: {editingUser.full_name || editingUser.email}
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Email: <span className="font-semibold text-slate-700">{editingUser.email}</span>
              </p>
            </div>

            <form onSubmit={handleUpdateUserPermissions} className="mt-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Cấp bậc tài khoản</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value as UserRole)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="staff">Nhân viên (Phân quyền theo từng chức năng bên dưới)</option>
                  <option value="owner">Chủ trung tâm (Toàn quyền tất cả các chức năng và các lớp)</option>
                </select>
              </div>

              {editRole === 'owner' ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-medium text-emerald-900">
                  ✓ <strong>Chủ trung tâm:</strong> Tài khoản này sẽ có toàn bộ quyền quản trị cao nhất, truy cập mọi chức năng, tất cả lớp học và báo cáo doanh thu.
                </div>
              ) : (
                <fieldset className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <legend className="px-1 text-xs font-extrabold text-slate-900">Tích chọn các quyền cho nhân viên</legend>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditPermissions((prev) => ({
                            ...createStaffPermissions(true),
                            assignedClassIds: prev.assignedClassIds,
                            teacherId: prev.teacherId,
                          }));
                        }}
                        className="rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        ✓ Chọn tất cả quyền
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditPermissions((prev) => ({
                            ...createEmptyPermissions(),
                            assignedClassIds: prev.assignedClassIds,
                            teacherId: prev.teacherId,
                          }))
                        }
                        className="rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 text-[11px] font-bold transition-colors cursor-pointer"
                      >
                        Bỏ chọn hết
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    {permissionGroups.map((group) => (
                      <div key={group.title} className="rounded-lg bg-white p-3 border border-slate-200 shadow-xs">
                        <p className="mb-2 text-[11px] font-extrabold uppercase text-slate-700">{group.title}</p>
                        <div className="space-y-1.5">
                          {group.options.map((option) => {
                            const checked = Boolean(
                              (editPermissions[option.module] as Record<string, boolean>)?.[option.action],
                            );
                            return (
                              <label
                                key={`${option.module}.${option.action}`}
                                className={`flex cursor-pointer items-start gap-2 text-[11px] font-medium ${
                                  option.emphasis ? 'text-amber-900' : 'text-slate-700'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => {
                                    setEditPermissions((current) => ({
                                      ...current,
                                      [option.module]: {
                                        ...(current[option.module] as Record<string, boolean>),
                                        [option.action]: !checked,
                                      },
                                    }));
                                  }}
                                  className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                />
                                <span>{option.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Phân công lớp phụ trách */}
                    <div className="md:col-span-3 rounded-lg bg-white border border-amber-300 p-3 shadow-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <p className="text-[11px] font-extrabold uppercase text-amber-900 flex items-center gap-1.5">
                          Phân công lớp phụ trách (Chỉ được Điểm danh & Chấm điểm các lớp này)
                        </p>
                        {classes.length > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setEditPermissions((prev) => ({
                                ...prev,
                                assignedClassIds: classes.map((c) => c.id),
                              }))
                            }
                            className="rounded-lg bg-amber-200/80 hover:bg-amber-300 text-amber-950 px-2 py-0.5 text-[10px] font-bold transition-colors cursor-pointer"
                          >
                            ✓ Chọn tất cả lớp
                          </button>
                        )}
                      </div>
                      {classes.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">Chưa có dữ liệu lớp học trong hệ thống.</p>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-36 overflow-y-auto pr-1">
                          {classes.map((c) => {
                            const isAssigned = editPermissions.assignedClassIds?.includes(c.id) || false;
                            return (
                              <label
                                key={c.id}
                                className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-800 bg-slate-50 p-1.5 rounded-lg border border-slate-200 hover:border-amber-400"
                              >
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  onChange={(e) => {
                                    const currentIds = editPermissions.assignedClassIds || [];
                                    const nextIds = e.target.checked
                                      ? [...currentIds, c.id]
                                      : currentIds.filter((id) => id !== c.id);
                                    setEditPermissions((prev) => ({ ...prev, assignedClassIds: nextIds }));
                                  }}
                                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                />
                                <span className="truncate font-semibold text-xs">
                                  {c.name.replace(/\s*\([^)]*\)/g, '').trim()}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      {teachers.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-700 whitespace-nowrap">
                            Gán hồ sơ giáo viên:
                          </span>
                          <select
                            value={editPermissions.teacherId || ''}
                            onChange={(e) =>
                              setEditPermissions((prev) => ({
                                ...prev,
                                teacherId: e.target.value || undefined,
                              }))
                            }
                            className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500"
                          >
                            <option value="">-- Tự do / Chưa liên kết giáo viên cụ thể --</option>
                            {teachers.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} ({t.id})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </fieldset>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl bg-amber-500 hover:bg-amber-600 px-5 py-2.5 text-xs font-bold text-slate-950 disabled:opacity-50 flex items-center gap-2 shadow-xs cursor-pointer"
                >
                  {isSubmitting ? (
                    <LoaderCircle className="h-4 w-4 animate-spin text-slate-950" />
                  ) : (
                    <ShieldCheck className="h-4 w-4 text-slate-950" />
                  )}
                  Cập nhật cấp quyền
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}
    </DialogFrame>
  );
};
