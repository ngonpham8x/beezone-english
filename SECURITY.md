# Production and security checklist

The application now uses Supabase Auth with Google OAuth for identity. The browser only receives a Supabase publishable key; the key that provisions Google accounts is used exclusively by `api/admin/users.ts` on Vercel.

## 1. Create and configure Supabase

1. Create a Supabase project and run [`supabase/migrations/001_auth_profiles.sql`](supabase/migrations/001_auth_profiles.sql) in **SQL Editor**.
2. In **Authentication → Providers**, enable Google. Create Google OAuth credentials in Google Cloud and copy the client ID and secret to the Google provider configuration.
3. In **Authentication → URL configuration**, set Site URL to the final HTTPS Vercel URL and add both the final URL and any preview URL that will be used to the Redirect URLs allow-list.
4. Disable public sign-ups and unused email/password/anonymous providers. Accounts are provisioned only by an active owner through the protected server endpoint and can then sign in with the matching Google email. Verify Google sign-in with a provisioned account after changing these settings.
5. Run migrations `001` through `012`. Apply 009 in staging and verify quotas before releasing the API that requires it. Migration 006 enforces business write permissions and protects the final active owner. Migration 007 validates operational dates, enrollments and dated schedule changes; restricts schedule writes to owners or explicitly delegated academic managers after migration 011; and prevents older clients from dropping the new arrays. Migration 008 protects historical per-lesson prices, validates student/session invoice references and integer payment amounts, rejects double billing and future billable attendance, and includes unbilled lessons in derived student debt. New staff-created lesson prices must match the class configuration and date roster; enabling billing on legacy attendance requires an owner. Migration 011 delegates programs, classes/schedules and rooms through explicit academic grants; missing grants deny writes, and linked records/history cannot be removed by delegated managers. It does not change existing profiles or grant account administration, finance or assigned-class attendance/grade access. Apply and verify 011 before releasing the corresponding UI/API. Add initial-owner emails directly to the private Supabase allowlist table; do not commit them to GitHub. Future owners are provisioned by an existing owner in the app; no public endpoint can create arbitrary owners. See `SUPABASE_SETUP.md` for the precise Dashboard flow.

Migration 012 adds optional additional student memberships, validates their types, uniqueness and class references, and derives rosters from all memberships. Student add/edit permissions still govern these changes; extra classes grant no academic, finance or grade permissions. Old clients cannot discard stored membership arrays or overwrite multi-class rosters. Apply and verify 012 before releasing the multi-class UI. Catalog-only Excel import is owner-only and adds missing class codes without replacing students, receipts, scores or enrollment history.

## 2. Vercel environment variables

Set the following separately for Production and Preview where relevant. Values prefixed `VITE_` are public browser configuration; all other values are server-only secrets.

| Variable | Where used |
| --- | --- |
| `VITE_SUPABASE_URL` | Browser and build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser and build |
| `SUPABASE_URL` | Protected Vercel API |
| `SUPABASE_SECRET_KEY` | Protected Vercel API only. Never use a `VITE_` prefix. |
| `APP_URL` | Exact production HTTPS URL accepted as a protected API origin |
| `ALLOWED_ORIGINS` | Optional comma-separated production/preview URL allow-list |

Use `SUPABASE_SERVICE_ROLE_KEY` only for legacy Supabase projects that do not provide `SUPABASE_SECRET_KEY`.

## 3. What is protected

- Google OAuth sessions are checked against the active `profiles` record before the app renders.
- Accounts not explicitly provisioned by a centre owner are inactive and cannot enter the app, including a Google user who knows the URL.
- Creating, listing, and locking users requires a live Supabase JWT and an active `owner` profile; this is checked again on the Vercel server, not only in the UI.
- The shared `server/admin.ts` boundary validates methods, exact configured origins, JWT shape and UTF-8 body size before authentication; checks the live user and active owner profile; enforces durable quotas; and does not cache responses. Caller-controlled Host/IP headers are not trusted. The database protects the final active owner.
- RLS permits the browser to read only its own active profile. Browser clients cannot grant roles, activate profiles, or provision Google accounts.
- Account provisioning, role changes, and lock/unlock operations write to a separate RLS-protected audit table. Only the protected server endpoint can write it and only active owners can read it through the API.
- The audit display API omits entire business/account entries authored by, targeting, or identifying a server-marked private account. It uses trusted profile IDs, emails and names; it does not erase stored events, rewrite backups or grant roles. The shared-document read-access limitation below still applies.
- Vercel headers add CSP, clickjacking, MIME-sniffing, referrer, and device-permission protections.

No internet-facing application can be guaranteed to be “unhackable”. Keep dependencies updated, require a password manager and MFA for owner Google accounts, review Supabase/Vercel audit logs, and rotate the server secret immediately if it is ever exposed.

## Storage and access boundaries

Production business data is stored in the RLS-protected `center_data` document. Only the development preview uses local browser storage. Production never falls back to preview accounts, sample datasets or sample audit history after configuration/network errors. Builds reject a Supabase secret or legacy service-role key placed in a `VITE_` variable.

**The shared document still grants every active account database read access to the entire document.** UI permissions hide modules and migration 006 enforces writes, but neither provides column/class-level read isolation. Do not treat hidden finance panels or assigned-class filters as a confidentiality boundary. If teachers/staff must be unable to read other classes, contacts or financial records, split business entities into tables with read RLS, or introduce an authenticated API that filters reads and merges authorized writes. This remains an architectural requirement before using that stricter permission model with real data.

Account management uses compensating rollback if audit insertion fails; Supabase Auth and database audit changes do not share one atomic transaction. Rollback results are checked; an unconfirmed rollback asks the owner to inspect the account and audit history instead of claiming it succeeded. Inspect failed account-management operations rather than assuming no external change occurred.

Use JSON backups for complete recovery. Excel exports contain reporting data and formulas; legacy VBA templates remain historical assets and are no longer embedded in newly generated reports. Do not use preview storage for operational data.

## Chống spam, bot và quá tải — 14/10/2026

Đã xuất bản và đọc lại cấu hình active trên project Vercel `beezone-english`: WAF bật, quy tắc **BeeZone admin API rate limit** bật cho đường dẫn bắt đầu `/api/admin/`, fixed window 60 yêu cầu/60 giây/IP, vượt ngưỡng trả 429. Không bật chế độ challenge toàn trang. Định nghĩa quy tắc để rà soát/tái tạo nằm trong [ops/admin-api-rate-limit.json](ops/admin-api-rate-limit.json). Khi sửa quy tắc, kiểm tra draft đang có trước khi publish để không đưa thay đổi của người khác lên cùng.

[Vercel có chống DDoS tự động](https://vercel.com/docs/vercel-firewall/ddos-mitigation). [Bộ đếm WAF theo từng vùng](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting), nên giới hạn trên không phải tổng toàn cầu. Quy tắc này bảo vệ API quản trị, không đi qua đường dẫn Supabase mà trình duyệt gọi trực tiếp. Chưa cấu hình managed bot challenge hoặc xác nhận thiết lập Auth thật; không thể coi mọi bot hoặc cuộc tấn công là đã bị chặn.

| Lớp | Giới hạn trong mã mới | Trạng thái |
| --- | --- | --- |
| Trước xác thực | 60 yêu cầu/phút/IP, 300/phút/process; bộ nhớ có giới hạn số khóa | Đã kiểm thử; bổ sung cho WAF, không thay thế giới hạn dùng chung |
| Đọc quản trị | 60 yêu cầu/phút/chủ trung tâm, dùng chung danh sách tài khoản và nhật ký | Cần migration 009 và triển khai API mới |
| Ghi quản trị | 10 yêu cầu/15 phút/chủ trung tâm, dùng chung POST/PATCH | Cần migration 009 và triển khai API mới |
| Ghi dữ liệu trung tâm trực tiếp | 60 lần ghi thành công/phút/tài khoản đang hoạt động | Trigger 009, chạy trước validation nghiệp vụ |
| Kích thước | API quản trị 10.000 byte UTF-8; tài liệu trung tâm 32 MB | Kiểm tra API/trigger, không xóa lịch sử để giảm kích thước |

Quota SQL cập nhật nguyên tử theo khóa tài khoản/phạm vi, không phụ thuộc token hoặc số máy chủ. Bảng không chứa IP/email/token và chỉ giữ tối đa ba dòng mỗi hồ sơ. Browser không có quyền đọc/sửa bảng hoặc gọi hàm quota; RPC quản trị chỉ cho service role và kiểm tra lại chủ trung tâm đang hoạt động. Khi thiếu RPC hoặc database lỗi, API trả 503 và không tiếp tục thao tác. Không hạ xuống bộ đếm trong bộ nhớ. Ghi bị từ chối không đổi payload/revision; CAS và bản đang nhập được giữ, đồng bộ dừng để người dùng thử lại.

Log do ứng dụng ghi chỉ có mã sự kiện cố định trên production; exception đầy đủ chỉ dùng khi phát triển. API không trả stack/SQL/token. Build bỏ `debugger`, kiểm tra không có tài khoản preview trong bundle và không có script thực thi inline trong HTML. CSP đã bỏ `unsafe-inline` khỏi `script-src`; CSS vẫn cho inline styles phục vụ React/thư viện. Thư viện bên thứ ba có cơ chế log riêng, không thuộc cam kết này.

GitHub Actions kiểm tra dependency ở mỗi push/PR và theo lịch tuần. `npm audit` hiện báo 0 lỗ hổng đã biết; đây không phải chứng minh mã ứng dụng không có lỗi bảo mật. Kiểm thử không tạo tải lớn hoặc tấn công production.

Trước khi triển khai API mới: áp dụng migration 009 **sau 001–008**, thử quota, quyền staff/owner, CAS và lưu/thu tiền trong staging; cấu hình secret máy chủ trực tiếp trên Vercel; sau đó mới redeploy. Agent chưa áp dụng migration trên Supabase production. Kiểm tra [Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits), tắt đăng ký công khai và provider không dùng, thử tài khoản đã cấp quyền. MFA của tài khoản Google/Vercel/Supabase cần thiết lập ở tài khoản quản trị. Giới hạn đọc dữ liệu trực tiếp và tách quyền đọc từng lớp/tài chính vẫn là phần cần nâng cấp ở kiến trúc, như mô tả ở trên.
