import { createDailyBackupEmail } from '../../server/dailyBackup.js';
import { header, json, type ApiRequest } from '../../server/request.js';

export default async function handler(req: ApiRequest, res: any) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Phương thức không được hỗ trợ.' });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret || header(req, 'authorization') !== `Bearer ${secret}`) return json(res, 401, { error: 'Không được phép.' });
  try {
    const result = await createDailyBackupEmail();
    return json(res, 200, { ok: true, filename: result.filename, bytes: result.bytes, groups: result.groups, records: result.records });
  } catch {
    // Never expose the recipient, provider response, credentials or backup payload.
    return json(res, 503, { error: 'Không thể tạo hoặc gửi bản sao lưu hằng ngày.' });
  }
}
