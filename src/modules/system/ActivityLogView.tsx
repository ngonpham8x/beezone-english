import { History, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import React, { useState } from 'react';
import { HorizontalScroll } from '../../components/HorizontalScroll';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import { maskEmail } from '../../lib/privacy';
import { accountRoleLabel } from '../../lib/accountRoles';
import { AccountAuditLog, ActivityLog } from '../../types';

interface ActivityLogViewProps {
  logs: ActivityLog[];
  accountLogs: AccountAuditLog[];
  isAccountAuditLoading: boolean;
  accountAuditError: string | null;
  onRefreshAccountLogs: () => void;
}

const accountActionLabels: Record<AccountAuditLog['action'], string> = {
  ACCOUNT_PROVISIONED: 'Cấp quyền',
  ACCOUNT_UPDATED: 'Cập nhật quyền',
  ACCOUNT_LOCKED: 'Khóa tài khoản',
  ACCOUNT_UNLOCKED: 'Mở khóa',
};

export const ActivityLogView: React.FC<ActivityLogViewProps> = ({
  logs,
  accountLogs,
  isAccountAuditLoading,
  accountAuditError,
  onRefreshAccountLogs,
}) => {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const filteredLogs = logs.filter(log => {
    const matchesSearch =
      log.userName.toLowerCase().includes(search.toLowerCase()) ||
      log.userEmail.toLowerCase().includes(search.toLowerCase()) ||
      log.details.toLowerCase().includes(search.toLowerCase()) ||
      log.module.toLowerCase().includes(search.toLowerCase());

    const matchesAction = actionFilter === 'all' || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  const filteredAccountLogs = accountLogs.filter((log) => {
    const term = search.toLowerCase();
    return !term || [log.actorName, log.targetName, log.details, accountActionLabels[log.action]]
      .some((value) => value.toLowerCase().includes(term));
  });

  const accountActionClass = (action: AccountAuditLog['action']) => (
    action === 'ACCOUNT_PROVISIONED' || action === 'ACCOUNT_UNLOCKED'
      ? 'bg-emerald-100 text-emerald-800'
      : action === 'ACCOUNT_LOCKED'
        ? 'bg-rose-100 text-rose-800'
        : 'bg-amber-100 text-amber-800'
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-amber-600" />
            Nhật Ký Hệ Thống (Audit Logs)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi thao tác dữ liệu và lịch sử cấp quyền tài khoản. Chỉ Chủ trung tâm được xem.
          </p>
        </div>

        <div className="log-filters">
          <div className="relative min-w-0">
            <Search className="pointer-events-none w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              aria-label="Tìm nhật ký hệ thống"
              type="text"
              placeholder="Tìm kiếm nhật ký..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="filter-control filter-control--search"
            />
          </div>

          <ResponsiveSelect
            label="Lọc hành động nhật ký"
            value={actionFilter}
            onChange={setActionFilter}
            options={[
              { value: 'all', label: 'Tất cả hành động' },
              { value: 'ĐĂNG NHẬP', label: 'Đăng nhập' }, { value: 'THÊM', label: 'Thêm mới' },
              { value: 'SỬA', label: 'Sửa dữ liệu' }, { value: 'XÓA', label: 'Xóa dữ liệu' },
              { value: 'EXPORT', label: 'Export Excel' }, { value: 'IMPORT', label: 'Import Excel' },
              { value: 'BACKUP', label: 'Backup' }, { value: 'RESTORE', label: 'Khôi phục' },
              { value: 'ĐỒNG BỘ', label: 'Đồng bộ' },
            ]}
          />
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><ShieldCheck className="h-4 w-4 text-amber-600" /> Nhật ký tài khoản</h3>
            <p className="mt-1 text-[11px] text-slate-500">Ghi riêng các lần cấp quyền, cập nhật quyền, khóa và mở khóa tài khoản. Email không hiển thị.</p>
          </div>
          <button
            type="button"
            onClick={onRefreshAccountLogs}
            disabled={isAccountAuditLoading}
            className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 sm:self-auto"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isAccountAuditLoading ? 'animate-spin' : ''}`} /> Làm mới
          </button>
        </div>

        {accountAuditError ? (
          <p role="alert" className="m-4 rounded-xl bg-red-50 p-3 text-xs text-red-800">{accountAuditError}</p>
        ) : isAccountAuditLoading && accountLogs.length === 0 ? (
          <p className="p-5 text-center text-xs text-slate-500">Đang tải nhật ký tài khoản…</p>
        ) : filteredAccountLogs.length === 0 ? (
          <p className="p-5 text-center text-xs text-slate-500">Chưa có thay đổi tài khoản nào được ghi nhận.</p>
        ) : (
          <HorizontalScroll label="Nhật ký tài khoản" className="overflow-x-auto custom-scrollbar">
            <table className="w-full min-w-[820px] table-auto text-left text-xs text-slate-700">
              <colgroup>
                <col className="w-[140px] min-w-[140px]" />
                <col className="w-[180px] min-w-[180px]" />
                <col className="w-[120px] min-w-[120px]" />
                <col className="w-[160px] min-w-[160px]" />
                <col className="min-w-[280px]" />
              </colgroup>
              <thead className="bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 min-w-[140px]">Thời gian</th>
                  <th className="whitespace-nowrap px-4 py-3 min-w-[180px]">Tài khoản</th>
                  <th className="whitespace-nowrap px-4 py-3 min-w-[120px]">Thao tác</th>
                  <th className="whitespace-nowrap px-4 py-3 min-w-[160px]">Người thực hiện</th>
                  <th className="whitespace-nowrap px-4 py-3 min-w-[280px]">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccountLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-slate-500 min-w-[140px]">{new Date(log.occurredAt).toLocaleString('vi-VN')}</td>
                    <td className="whitespace-nowrap px-4 py-3 min-w-[180px]">
                      <div className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <b className="text-slate-900">{log.targetName || 'Tài khoản BeeZone'}</b>
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{accountRoleLabel(log.targetRole)}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 min-w-[120px]">
                      <span className={`inline-block whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold ${accountActionClass(log.action)}`}>{accountActionLabels[log.action]}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-slate-800 min-w-[160px]">{log.actorName || 'Chủ trung tâm'}</td>
                    <td className="px-4 py-3 leading-5 text-slate-700 min-w-[280px] break-words">{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </HorizontalScroll>
        )}
      </section>

      {/* Logs Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <HorizontalScroll label="Nhật ký hệ thống" className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[820px] table-auto text-left text-xs text-slate-700">
            <colgroup>
              <col className="w-[140px] min-w-[140px]" />
              <col className="w-[170px] min-w-[170px]" />
              <col className="w-[110px] min-w-[110px]" />
              <col className="w-[130px] min-w-[130px]" />
              <col className="min-w-[280px]" />
            </colgroup>
            <thead className="bg-slate-800 text-slate-200 uppercase text-[11px] font-bold">
              <tr>
                <th className="whitespace-nowrap py-3 px-4 min-w-[140px]">Thời Gian</th>
                <th className="whitespace-nowrap py-3 px-4 min-w-[170px]">Người Thực Hiện</th>
                <th className="whitespace-nowrap py-3 px-4 min-w-[110px]">Hành Động</th>
                <th className="whitespace-nowrap py-3 px-4 min-w-[130px]">Phân Hệ</th>
                <th className="whitespace-nowrap py-3 px-4 min-w-[280px]">Chi Tiết Thao Tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredLogs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-xs font-medium text-slate-500">{isAccountAuditLoading ? 'Đang tải nhật ký hệ thống…' : accountAuditError ? 'Nhật ký tạm thời chưa tải được. Bấm Làm mới để thử lại.' : 'Chưa có thao tác dữ liệu nào được ghi nhận. Hãy thêm, sửa, xóa hoặc nhập/xuất dữ liệu để tạo lịch sử.'}</td></tr>
              ) : filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                  <td className="whitespace-nowrap py-3 px-4 font-mono text-slate-500 min-w-[140px]">{log.timestamp}</td>
                  <td className="whitespace-nowrap py-3 px-4 min-w-[170px]">
                    <div className="inline-block whitespace-nowrap">
                      <div className="font-bold text-slate-900">{log.userName}</div>
                      {log.userEmail && <div className="text-[10px] text-slate-500">{maskEmail(log.userEmail)}</div>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-3 px-4 min-w-[110px]">
                    <span className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      log.action === 'THÊM' ? 'bg-emerald-100 text-emerald-800' :
                      (log.action === 'XÓA' ? 'bg-rose-100 text-rose-800' :
                      (log.action === 'SỬA' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-800'))
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-3 px-4 font-semibold text-slate-800 min-w-[130px]">{log.module}</td>
                  <td className="py-3 px-4 text-slate-700 min-w-[280px] break-words">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </HorizontalScroll>
      </div>
    </div>
  );
};
