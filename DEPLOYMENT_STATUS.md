# Trạng thái triển khai — 14/10/2026

## Vercel đang sử dụng

Đã deploy và chuyển domain chính sang project người dùng cung cấp: [ngonpham/beezone-english](https://vercel.com/ngonpham/beezone-english). Project nối GitHub [ngonpham8x/beezone-english](https://github.com/ngonpham8x/beezone-english), nhánh `main`. Scope `ngonpham8x` trong các ghi nhận cũ không phải project đang sử dụng.

- Domain chính: https://beezone-english.vercel.app
- Deployment đã kiểm tra: https://beezone-english-9mv2ikiui-ngonpham.vercel.app
- Inspector: https://vercel.com/ngonpham/beezone-english/DqjahykZEpaxwUpvCrzBiFyazwr2
- Deployment ID: `dpl_DqjahykZEpaxwUpvCrzBiFyazwr2`, trạng thái **READY**.
- Bản nguồn: `364437cdedaa929e7f79c150c2af3b19a553415b`, gồm sửa localhost trắng, module, responsive, học phí theo buổi và bảo mật API.

Build TypeScript/Vite và kiểm tra bundle/CSP trên Vercel thành công. Kiểm tra HTTP domain chính: HTML Tuyển sinh, JavaScript chính `index-SZTcuuz_.js`, CSS `index-mytMBd8j.css` và ba vendor JS đều trả 200. Bundle dùng Supabase mới, không còn URL Supabase cũ. API quản trị không có token trả 401; token giả đúng định dạng cũng bị từ chối 401 sau bước xác thực Supabase. Kết quả này xác minh cấu hình máy chủ đã nạp, chưa xác minh thao tác của tài khoản thật.

## Cấu hình đã hoàn thành

Người dùng chọn Supabase [deiohgeljdlxtecbeosu](https://supabase.com/dashboard/project/deiohgeljdlxtecbeosu). Không sao chép dữ liệu hoặc tài khoản từ project cũ `cqsxdltjpyqxjijuwdbq`.

Integration Vercel đã có `SUPABASE_URL`, `SUPABASE_SECRET_KEY` và khóa legacy. Đã thêm Production `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `APP_URL` rồi redeploy. Biến `NEXT_PUBLIC_` do integration tạo không thay thế biến `VITE_` của ứng dụng này. Khóa máy chủ không được đưa vào biến `VITE_`, Git hoặc bundle.

WAF của project mới đã bật và publish **BeeZone admin API rate limit**: đường dẫn bắt đầu `/api/admin/`, 60 yêu cầu/60 giây/IP, vượt ngưỡng trả 429. Đọc lại trạng thái: một quy tắc active, không có draft. Định nghĩa tại [ops/admin-api-rate-limit.json](ops/admin-api-rate-limit.json). Chưa bật Bot Management/challenge toàn trang, không chạy thử tải production.

## Phần còn thiếu ở Supabase mới

Kiểm tra REST với public key không lấy dữ liệu cá nhân: `profiles`, `center_data`, `account_audit_logs` trả 404/PGRST205; RPC quota trả 404/PGRST202. Auth settings trả 200 và Google provider đang tắt. Chưa áp dụng migration trên Supabase mới.

1. Khởi tạo migration **001–009** trong đúng project mới. Có thể tạo file SQL ghép bằng `node scripts/create-supabase-setup.mjs`; file nằm tại `.vercel/setup-new-project.sql`, không được commit/upload. Bộ tạo không kết nối database. File có kiểm tra schema trống, transaction và không nhúng email/secret/dữ liệu trung tâm.
2. Bật Google provider, thiết lập OAuth callback của Supabase mới và Site URL/Redirect URL của domain chính theo [SUPABASE_SETUP.md](SUPABASE_SETUP.md).
3. Thêm email Chủ trung tâm vào allowlist riêng trên Dashboard, bootstrap đăng nhập rồi tắt đăng ký mới. Sau đó kiểm tra cấp quyền, API, lưu/CAS và sao lưu với tài khoản thật.

Sau bổ sung bộ tạo SQL, **321 test / 23 tệp đã qua** khi chạy tuần tự trên máy local; TypeScript và production build đã qua, kiểm tra bundle/CSP thành công. Lần `npm run check` ban đầu được dừng ở bước test vì chạy lâu trên máy local, rồi chạy lại toàn bộ test với `--maxWorkers=1` và chạy `npm run build`. CI tiếp tục chạy `npm run check` cho commit được push. Chưa kiểm thử Google thật hoặc xác nhận hình ảnh giao diện trên browser kết nối.

Kiểm tra file giả cho thấy localhost trước đây có phục vụ `.vercel` qua đường dẫn thường và `/@fs`. Đã chuyển auth CLI ra ngoài workspace và thêm `.vercel` vào danh sách chặn Vite, giữ các chặn mặc định cho `.env`, khóa PEM/CRT và `.git`. Kiểm tra lại đường dẫn thường, `/@fs`, chữ hoa và đường dẫn mã hóa đều chặn `.vercel` với 403. Trang Tuyển sinh, Vite client và module chính vẫn trả 200. File giả không chứa credential; không truy xuất hoặc in token qua HTTP. CLI sau khi chuyển vị trí vẫn truy cập đúng project Vercel.

`.env`, auth CLI, SQL ghép và dữ liệu riêng được loại khỏi Git/upload. Hai mẫu Excel macro cũ không được ứng dụng dùng cũng bị loại khỏi deployment bằng `.vercelignore`.
