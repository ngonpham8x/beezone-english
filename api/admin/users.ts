import { adminApi } from '../../server/admin.js';
import { hiddenAccountsForViewer } from '../../server/accountVisibility.js';
import { json } from '../../server/request.js';
import { createStaffPermissions, normalizeStaffPermissions } from '../../src/lib/permissions.js';

const OWNER_PERMISSIONS = createStaffPermissions(true);

type AccountAuditAction =
  | 'ACCOUNT_PROVISIONED'
  | 'ACCOUNT_UPDATED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_UNLOCKED';

function roleLabel(role: 'owner' | 'staff') {
  return role === 'owner' ? 'Chủ trung tâm' : 'Nhân viên';
}

function permissionSummary(permissions: ReturnType<typeof createStaffPermissions>) {
  const labels: Record<string, Record<string, string>> = {
    student: {
      view: 'xem học viên',
      add: 'thêm học viên',
      edit: 'sửa học viên',
      delete: 'xóa học viên',
      export: 'xuất học viên',
    },
    teacher: { view: 'xem giáo viên', edit: 'thêm / sửa giáo viên', delete: 'xóa giáo viên' },
    tuition: {
      view: 'xem học phí',
      collect: 'thu học phí',
      delete: 'xóa phiếu thu',
      showDebt: 'xem công nợ',
    },
    grade: { view: 'xem điểm', edit: 'sửa điểm' },
    excel: { import: 'nhập Excel', export: 'xuất Excel' },
    report: { view: 'xem báo cáo', revenue: 'xem doanh thu' },
    academic: { programs: 'thêm / sửa / xóa chương trình học', classes: 'thêm / sửa / xóa lớp và lịch học', rooms: 'thêm / sửa / xóa phòng học' },
  };
  const granted = Object.entries(labels).flatMap(([module, actions]) =>
    Object.entries(actions)
      .filter(([action]) => (permissions[module as keyof typeof permissions] as Record<string, boolean>)?.[action] === true)
      .map(([, label]) => label),
  );
  return granted.length > 0 ? `Quyền: ${granted.join(', ')}.` : 'Không cấp quyền riêng.';
}

async function writeAccountAudit(
  client: any,
  entry: {
    action: AccountAuditAction;
    actorId: string;
    actorName: string;
    targetId: string;
    targetName: string;
    targetRole: 'owner' | 'staff';
    details: string;
  },
) {
  try {
    const { error } = await client.from('account_audit_logs').insert({
      action: entry.action,
      actor_id: entry.actorId,
      actor_name: entry.actorName.slice(0, 120),
      target_id: entry.targetId,
      target_name: entry.targetName.slice(0, 120),
      target_role: entry.targetRole,
      details: entry.details.slice(0, 1000),
    });
    return !error;
  } catch {
    return false;
  }
}

async function compensate(operation: () => PromiseLike<{ error: unknown }>): Promise<boolean> {
  try {
    return !(await operation()).error;
  } catch {
    return false;
  }
}

const ROLLBACK_UNCONFIRMED =
  'Thao tác chưa hoàn tất và không thể xác nhận hoàn tác. Hãy kiểm tra tài khoản và nhật ký trước khi thử lại.';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default adminApi(
  ['GET', 'POST', 'PATCH', 'DELETE'],
  async (req, res, { client, callerId, callerName }, body) => {
    const hiddenAccountIds = await hiddenAccountsForViewer(client, callerId);
    if (req.method === 'GET') {
      const { data, error } = await client
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error || !data) return json(res, 500, { error: 'Không thể tải danh sách tài khoản.' });
      return json(res, 200, {
        users: data.filter(user => user.is_private !== true && !hiddenAccountIds.has(user.id)).map(({ id, email, full_name, avatar_url, role, is_active, permissions }) => ({ id, email, full_name, avatar_url, role, is_active, permissions })),
        hiddenAccountIds: [...new Set([...hiddenAccountIds, ...data.filter(user => user.is_private === true).map(user => user.id)])],
      });
    }

    if (req.method === 'POST') {
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const fullName =
        typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
      const role = body.role === 'owner' || body.role === 'staff' ? body.role : null;

      if (
        !EMAIL_PATTERN.test(email) ||
        email.length > 254 ||
        fullName.length < 2 ||
        fullName.length > 120 ||
        !role
      ) {
        return json(res, 400, { error: 'Họ tên, email hoặc cấp bậc không hợp lệ.' });
      }
      if (!process.env.APP_URL?.startsWith('https://')) {
        return json(res, 500, { error: 'APP_URL phải là địa chỉ HTTPS đã cấu hình trên máy chủ.' });
      }

      const permissions =
        role === 'owner' ? OWNER_PERMISSIONS : normalizeStaffPermissions(body.permissions);
      const { data: existing, error: existingError } = await client
        .from('profiles')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      if (existingError) return json(res, 500, { error: 'Không thể kiểm tra tài khoản.' });
      if (existing?.is_private === true || (existing && hiddenAccountIds.has(existing.id))) return json(res, 404, { error: 'Tài khoản không có trong danh sách quản lý.' });

      // A known Google user can be promoted without an email invitation or password.
      if (existing) {
        if (existing.id === callerId && role !== 'owner')
          return json(res, 400, { error: 'Bạn không thể tự hạ quyền Chủ trung tâm.' });
        if (existing.role === 'owner' && existing.is_active && role !== 'owner') {
          const { count, error } = await client
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('role', 'owner')
            .eq('is_active', true);
          if (error || (count ?? 0) <= 1)
            return json(res, 400, { error: 'Không thể hạ quyền Chủ trung tâm cuối cùng.' });
        }
        const { error: profileUpdateError } = await client
          .from('profiles')
          .update({
            full_name: fullName,
            role,
            is_active: true,
            permissions,
          })
          .eq('id', existing.id);
        if (profileUpdateError)
          return json(res, 500, { error: 'Không thể cập nhật quyền cho tài khoản.' });
        const details = `Cập nhật cấp bậc: ${roleLabel(existing.role)} → ${roleLabel(role)}. ${role === 'owner' ? 'Cấp toàn quyền Chủ trung tâm.' : permissionSummary(permissions)}`;
        const auditRecorded = await writeAccountAudit(client, {
          action: 'ACCOUNT_UPDATED',
          actorId: callerId,
          actorName: callerName,
          targetId: existing.id,
          targetName:
            fullName || existing.full_name || existing.email || email || 'Tài khoản BeeZone',
          targetRole: role,
          details,
        });
        if (!auditRecorded) {
          const restored = await compensate(() =>
            client
              .from('profiles')
              .update({
                full_name: existing.full_name,
                role: existing.role,
                is_active: existing.is_active,
                permissions: existing.permissions,
              })
              .eq('id', existing.id),
          );
          return json(res, 500, {
            error: restored
              ? 'Không thể ghi nhật ký tài khoản; thay đổi đã được hoàn tác.'
              : ROLLBACK_UNCONFIRMED,
          });
        }
        return json(res, 200, { user: { id: existing.id, role }, provisioned: false });
      }

      // This creates no password and sends no email. Supabase links Google later.
      const { data: provisionedUser, error: provisionError } = await client.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (provisionError || !provisionedUser.user) {
        return json(res, 400, {
          error: 'Không thể cấp quyền Google. Email có thể đã tồn tại hoặc chưa sẵn sàng.',
        });
      }

      const { error: profileWriteError } = await client.from('profiles').upsert({
        id: provisionedUser.user.id,
        email,
        full_name: fullName,
        role,
        is_active: true,
        permissions,
      });
      if (profileWriteError) {
        // Do not leave a partly provisioned Google account active.
        const removed = await compensate(() =>
          client.auth.admin.deleteUser(provisionedUser.user.id),
        );
        return json(res, 500, {
          error: removed
            ? 'Không thể hoàn tất việc cấp quyền cho tài khoản.'
            : ROLLBACK_UNCONFIRMED,
        });
      }

      const auditRecorded = await writeAccountAudit(client, {
        action: 'ACCOUNT_PROVISIONED',
        actorId: callerId,
        actorName: callerName,
        targetId: provisionedUser.user.id,
        targetName: fullName,
        targetRole: role,
        details: `Cấp quyền Google mới: ${roleLabel(role)}. ${role === 'owner' ? 'Cấp toàn quyền Chủ trung tâm.' : permissionSummary(permissions)}`,
      });
      if (!auditRecorded) {
        const removed = await compensate(() =>
          client.auth.admin.deleteUser(provisionedUser.user.id),
        );
        return json(res, 500, {
          error: removed
            ? 'Không thể ghi nhật ký tài khoản; tài khoản chưa được cấp quyền.'
            : ROLLBACK_UNCONFIRMED,
        });
      }

      return json(res, 201, { user: { id: provisionedUser.user.id, role }, provisioned: true });
    }

    const userId = typeof body.userId === 'string' ? body.userId : '';

    if (req.method === 'DELETE' || body.action === 'delete') {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        return json(res, 400, { error: 'ID tài khoản không hợp lệ.' });
      }
      if (userId === callerId) {
        return json(res, 400, { error: 'Bạn không thể tự xóa tài khoản của mình.' });
      }

      const { data: target, error: targetError } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (targetError || !target) return json(res, 404, { error: 'Không tìm thấy tài khoản.' });
      if (target.is_private === true || hiddenAccountIds.has(target.id)) return json(res, 404, { error: 'Tài khoản không có trong danh sách quản lý.' });

      if (target.role === 'owner' && target.is_active) {
        const { count, error: ownerCountError } = await client
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'owner')
          .eq('is_active', true);
        if (ownerCountError || (count ?? 0) <= 1) {
          return json(res, 400, { error: 'Không thể xóa Chủ trung tâm cuối cùng đang hoạt động.' });
        }
      }

      const targetName = target.full_name || target.email || 'Tài khoản BeeZone';
      const auditRecorded = await writeAccountAudit(client, {
        action: 'ACCOUNT_UPDATED',
        actorId: callerId,
        actorName: callerName,
        targetId: target.id,
        targetName,
        targetRole: target.role,
        details: `Xóa vĩnh viễn tài khoản: ${targetName} (${target.email || target.id}).`,
      });
      if (!auditRecorded) {
        return json(res, 500, { error: 'Không thể ghi nhật ký; thao tác xóa chưa được thực hiện.' });
      }

      const { error: profileDeleteError } = await client
        .from('profiles')
        .delete()
        .eq('id', userId);
      if (profileDeleteError) {
        return json(res, 500, { error: 'Không thể xóa hồ sơ tài khoản.' });
      }

      try {
        await client.auth.admin.deleteUser(userId);
      } catch {
        // Tiếp tục nếu tài khoản auth đã bị xóa trước đó
      }

      if (target.email) {
        try {
          await client.from('owner_bootstrap_allowlist').delete().eq('email', target.email.toLowerCase());
        } catch {
          // Bỏ qua nếu email không có trong danh sách khởi tạo
        }
      }

      return json(res, 200, { success: true });
    }

    if (body.action === 'updatePermissions') {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
        return json(res, 400, { error: 'ID tài khoản không hợp lệ.' });
      }
      const newRole = body.role === 'owner' || body.role === 'staff' ? body.role : null;
      const permissions =
        newRole === 'owner' ? OWNER_PERMISSIONS : normalizeStaffPermissions(body.permissions);
      const { data: target, error: targetError } = await client
        .from('profiles')
        .select('id, full_name, role, is_active, permissions, is_private')
        .eq('id', userId)
        .maybeSingle();
      if (targetError || !target) return json(res, 404, { error: 'Không tìm thấy tài khoản.' });
      if (target.is_private === true || hiddenAccountIds.has(target.id))
        return json(res, 404, { error: 'Tài khoản không có trong danh sách quản lý.' });

      const finalRole = newRole || target.role;
      if (userId === callerId && finalRole !== 'owner') {
        return json(res, 400, { error: 'Bạn không thể tự hạ quyền Chủ trung tâm.' });
      }
      if (target.role === 'owner' && target.is_active && finalRole !== 'owner') {
        const { count, error } = await client
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role', 'owner')
          .eq('is_active', true);
        if (error || (count ?? 0) <= 1) {
          return json(res, 400, { error: 'Không thể hạ quyền Chủ trung tâm cuối cùng.' });
        }
      }

      const updates: any = {
        permissions: finalRole === 'owner' ? OWNER_PERMISSIONS : permissions,
      };
      if (newRole) updates.role = newRole;

      const { error: updatePermsError } = await client
        .from('profiles')
        .update(updates)
        .eq('id', userId);
      if (updatePermsError) return json(res, 500, { error: 'Không thể cập nhật quyền.' });

      const auditRecorded = await writeAccountAudit(client, {
        action: 'ACCOUNT_UPDATED',
        actorId: callerId,
        actorName: callerName,
        targetId: userId,
        targetName: target.full_name || 'Tài khoản BeeZone',
        targetRole: finalRole,
        details: `Cập nhật cấp bậc và quyền: ${finalRole === 'owner' ? 'Toàn quyền Chủ trung tâm.' : permissionSummary(permissions)}`,
      });
      if (!auditRecorded) {
        const restored = await compensate(() =>
          client
            .from('profiles')
            .update({ permissions: target.permissions, role: target.role })
            .eq('id', userId),
        );
        return json(res, 500, {
          error: restored
            ? 'Không thể ghi nhật ký; thay đổi quyền đã được hoàn tác.'
            : ROLLBACK_UNCONFIRMED,
        });
      }

      return json(res, 200, { success: true });
    }

    const active = body.active;
    if (
      body.action !== 'setActive' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ||
      typeof active !== 'boolean'
    ) {
      return json(res, 400, { error: 'Yêu cầu cập nhật không hợp lệ.' });
    }
    if (userId === callerId)
      return json(res, 400, { error: 'Bạn không thể tự khóa tài khoản của mình.' });

    const { data: target, error: targetError } = await client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (targetError || !target) return json(res, 404, { error: 'Không tìm thấy tài khoản.' });
    if (target.is_private === true || hiddenAccountIds.has(target.id)) return json(res, 404, { error: 'Tài khoản không có trong danh sách quản lý.' });

    if (!active && target.role === 'owner' && target.is_active) {
      const { count, error: ownerCountError } = await client
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'owner')
        .eq('is_active', true);
      if (ownerCountError || (count ?? 0) <= 1) {
        return json(res, 400, { error: 'Không thể khóa Chủ trung tâm cuối cùng.' });
      }
    }

    const { error: updateError } = await client
      .from('profiles')
      .update({ is_active: active })
      .eq('id', userId);
    if (updateError) return json(res, 500, { error: 'Không thể cập nhật trạng thái tài khoản.' });
    const auditRecorded = await writeAccountAudit(client, {
      action: active ? 'ACCOUNT_UNLOCKED' : 'ACCOUNT_LOCKED',
      actorId: callerId,
      actorName: callerName,
      targetId: target.id,
      targetName: target.full_name || target.email || 'Tài khoản BeeZone',
      targetRole: target.role,
      details: active
        ? 'Mở khóa tài khoản; có thể đăng nhập Google.'
        : 'Khóa tài khoản; không thể truy cập hệ thống.',
    });
    if (!auditRecorded) {
      const restored = await compensate(() =>
        client.from('profiles').update({ is_active: target.is_active }).eq('id', userId),
      );
      return json(res, 500, {
        error: restored
          ? 'Không thể ghi nhật ký tài khoản; thay đổi đã được hoàn tác.'
          : ROLLBACK_UNCONFIRMED,
      });
    }
    return json(res, 200, { success: true });
  },
);
