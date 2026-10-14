import { createClient } from '@supabase/supabase-js';
import { PRIVATE_ACCOUNT_LABEL } from '../src/lib/accountPrivacy.js';
import { admitAdminRequest, rateLimited } from './rateLimit.js';
import {
  getBearerToken,
  json,
  parseRequestBody,
  requestIsAllowed,
  validateBodyHeaders,
  type ApiRequest,
} from './request.js';

function serverClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, AbortSignal.timeout(8_000)])
            : AbortSignal.timeout(8_000),
        }),
    },
  });
}

async function authorizeOwner(req: ApiRequest, res: any) {
  const token = getBearerToken(req);
  if (!token) {
    json(res, 401, { error: 'Thiếu thông tin xác thực hợp lệ.' });
    return null;
  }
  const client = serverClient();
  if (!client) {
    json(res, 503, { error: 'Dịch vụ quản trị chưa sẵn sàng.' });
    return null;
  }
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) {
    json(res, 401, { error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
    return null;
  }
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError) {
    json(res, 503, { error: 'Chưa thể kiểm tra quyền truy cập.' });
    return null;
  }
  if (!profile || profile.is_active !== true || profile.role !== 'owner') {
    json(res, 403, { error: 'Chỉ Chủ trung tâm đang hoạt động được phép truy cập.' });
    return null;
  }
  return { client, callerId: data.user.id, callerName: profile.is_private === true ? PRIVATE_ACCOUNT_LABEL : profile.full_name || 'Chủ trung tâm' };
}

type AuthorizedOwner = NonNullable<Awaited<ReturnType<typeof authorizeOwner>>>;

/** Shared boundary for every admin route: validate, authenticate, authorize, quota, execute. */
export function adminApi(
  methods: string[],
  action: (
    req: ApiRequest,
    res: any,
    owner: AuthorizedOwner,
    body: Record<string, unknown>,
  ) => Promise<unknown>,
) {
  return async (req: ApiRequest, res: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (!admitAdminRequest(req, res)) return;
    if (!methods.includes(req.method || '')) {
      res.setHeader('Allow', methods.join(', '));
      return json(res, 405, { error: 'Phương thức không được hỗ trợ.' });
    }
    if (!requestIsAllowed(req)) return json(res, 403, { error: 'Nguồn yêu cầu không được phép.' });
    let body: Record<string, unknown> = {};
    if (req.method !== 'GET') {
      const status = validateBodyHeaders(req);
      if (status)
        return json(res, status, { error: 'Định dạng hoặc kích thước yêu cầu không hợp lệ.' });
      const parsed = parseRequestBody(req.body);
      if (!parsed) return json(res, 400, { error: 'Nội dung yêu cầu không hợp lệ.' });
      body = parsed;
    }
    try {
      const owner = await authorizeOwner(req, res);
      if (!owner) return;
      const { data, error } = await owner.client.rpc('consume_admin_request_quota', {
        p_actor_id: owner.callerId,
        p_scope: req.method === 'GET' ? 'admin-read' : 'admin-write',
      });
      const quota = Array.isArray(data) ? data[0] : null;
      if (
        error ||
        typeof quota?.allowed !== 'boolean' ||
        !Number.isInteger(quota.retry_after) ||
        quota.retry_after < 0
      ) {
        return json(res, 503, {
          error: 'Chưa thể kiểm tra giới hạn yêu cầu. Vui lòng thử lại sau.',
        });
      }
      if (!quota.allowed) return rateLimited(res, quota.retry_after);
      return await action(req, res, owner, body);
    } catch {
      // Do not leak SDK exceptions, tokens, SQL, or personal data; no automatic mutation retry.
      if (!res.headersSent)
        return json(res, 503, {
          error: 'Không thể xác nhận kết quả. Hãy kiểm tra danh sách và nhật ký trước khi gửi lại.',
        });
    }
  };
}
