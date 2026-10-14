# Trạng thái triển khai Vercel — 14/10/2026

## Bản mới nhất

Đã đẩy mã và cấu hình upload lên GitHub `main`, bản nguồn deployment là `64f202b` (gồm sửa trang trắng `673d903` và bảo mật `154e5df`). GitHub Actions của bản nguồn đã qua: https://github.com/ngonpham8x/beezone-english/actions/runs/38510722731. Bộ kiểm tra hiện có 318 test / 22 tệp; không thay mã ứng dụng trong lần deploy này.

Đã deploy Vercel với môi trường Production và `--skip-domain`; build TypeScript/Vite và kiểm tra bundle/CSP thành công, deployment **READY**:

- Deployment mới: https://beezone-english-gp650w0qt-ngonpham8x.vercel.app
- Trang quản lý: https://vercel.com/ngonpham8x/beezone-english/2GaRTE5VY6dcCFLrpEDmAAfvFX2b
- Alias mặc định: https://beezone-english-ngonpham8x.vercel.app
- Deployment ID: `dpl_2GaRTE5VY6dcCFLrpEDmAAfvFX2b`.

Đã xác minh qua Vercel CLI có quyền truy cập deployment được bảo vệ: trang Tuyển sinh trả 200, main JS `index-DcHpxBLc.js`, CSS `index-mytMBd8j.css` và các vendor JS trả 200. API không xác thực trả 401 JSON; yêu cầu kiểm tra cấu hình trả 503 “Dịch vụ quản trị chưa sẵn sàng.” Production vẫn chưa có secret Supabase máy chủ. Hai mẫu Excel macro cũ không được mã ứng dụng dùng đã được loại khỏi source upload bằng `.vercelignore`; xác nhận không phục vụ file macro ở deployment mới. Không upload `.env`, dữ liệu Excel riêng hoặc secret.

Bản mới và alias mặc định có bảo vệ bằng tài khoản Vercel. Domain người dùng `https://beezone-english.vercel.app` chưa chuyển: đã đọc lại HTML, vẫn dùng main JS `index-CgEysNMR.js` và CSS `index-D6DviX8x.css` cũ. Cần cấu hình `SUPABASE_SECRET_KEY`/khóa legacy trong Dashboard, áp dụng các migration 006–009 còn thiếu và kiểm tra API/đồng bộ trước khi đưa bản mới vào sử dụng trên domain chính. Agent chưa chạy migration Supabase production; đã yêu cầu người dùng hoàn tất phần Dashboard. Chưa kiểm thử đăng nhập Google thật hoặc xác nhận hình ảnh giao diện của deployment mới.

## Lịch sử triển khai trước

Bản mã ứng dụng `1b3269e09921bc21bc4ef80f33f7ffd795e352fa` đã build và deploy thành công với trạng thái **Ready**, gồm học phí theo buổi gắn với điểm danh, đơn giá lịch sử, chọn buổi để thu, thu từng phần, công nợ/báo cáo và sao lưu. Các phần đợt học, hạn học phí, lịch nghỉ/học bù và việc cần làm hôm nay vẫn được giữ:

- Deployment: https://beezone-english-q3tfayl5h-ngonpham8x.vercel.app
- Trang quản lý: https://vercel.com/ngonpham8x/beezone-english/5f7L1jGxcRb4uf4WCmpBNMb2PATc
- Domain chính `https://beezone-english.vercel.app` vẫn đang chạy bản cũ. Deployment được tạo với `--prod --skip-domain` để kiểm tra trước khi chuyển domain.

Đã cấu hình Production: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `APP_URL`, `ALLOWED_ORIGINS`. Đã xác nhận Google provider của Supabase đang bật. Chưa kiểm thử đăng nhập Google bằng tài khoản thật.

Kiểm tra: **139 test / 14 tệp**, TypeScript và build local qua; build Vercel qua; HTML, JS chính `index-at3sEi4X.js`, CSS `index-tdfvtVbm.css` và module `TuitionManager-eAXkBB0m.js` trả HTTP 200 khi truy cập bằng tài khoản Vercel. Module học phí có chức năng chọn buổi/lưu phiếu mới. Build xác nhận không có xác thực xem thử trong production. API quản lý tài khoản nạp được nhưng trả HTTP 500 JSON “Máy chủ chưa được cấu hình Supabase.” vì chưa có secret key. Đã kiểm tra lại công cụ giao diện: không có app/trình duyệt kết nối, nên chưa xác minh ảnh giao diện hoặc đăng nhập thật.

Domain chính đã được kiểm tra lại: HTTP 200, vẫn dùng CSS cũ `index-D6DviX8x.css`. Alias `beezone-english-ngonpham8x.vercel.app` trỏ tới bản staged và có bảo vệ bằng tài khoản Vercel; domain chính chưa được chuyển.

Đợt chỉnh giao diện đã chạy tại `localhost:3000` và cập nhật trong GitHub: thẻ thống kê gọn, bộ lọc theo chiều rộng nội dung, thanh cuộn tối giản, khung chào mừng trước công việc, bỏ nút thu học phí xanh lặp, thống nhất tiêu đề/lưới thẻ và chiều cao header gồm thông báo xem thử. 183 kiểm thử và build local qua; chưa đưa thay đổi giao diện này vào deployment Vercel nêu trên. Công cụ chưa có browser để xác nhận trực quan. Chi tiết tại [UI_REVIEW.md](UI_REVIEW.md).

Đợt refactor tiếp theo chia giao diện/nghiệp vụ thành module, tách dịch vụ Excel và thêm CI/kiểm tra phụ thuộc; 195 test / 17 tệp và build local qua. Mã refactor chưa nằm trong deployment Vercel nêu trên. Không chạy migration hoặc thay dữ liệu Supabase trong đợt này. Chi tiết tại [ARCHITECTURE.md](ARCHITECTURE.md).

## Hai bước còn thiếu trước khi chuyển domain

1. Trong [Vercel Environment Variables](https://vercel.com/ngonpham8x/beezone-english/settings/environment-variables), thêm `SUPABASE_SECRET_KEY` từ đúng project Supabase, chọn **Production**. Có thể dùng `SUPABASE_SERVICE_ROLE_KEY` nếu dùng khóa legacy. Không dùng tiền tố `VITE_` cho khóa máy chủ, không đưa khóa vào GitHub hoặc chat.
2. Chạy [migration 006](https://github.com/ngonpham8x/beezone-english/blob/main/supabase/migrations/006_enforce_business_permissions.sql), rồi [migration 007](https://github.com/ngonpham8x/beezone-english/blob/main/supabase/migrations/007_small_center_operations.sql), rồi [migration 008](https://github.com/ngonpham8x/beezone-english/blob/main/supabase/migrations/008_session_tuition.sql) trong Supabase SQL Editor nếu chưa chạy. Kết nối MCP trước đó chỉ đọc, lần chạy 006 bị từ chối và không thay đổi schema. Lần kiểm tra đầu đợt bổ sung chưa thấy hai trigger của 006; lần kiểm tra hiện tại tiếp tục bị lỗi OAuth token refresh nên chưa xác nhận được schema thật. Toàn bộ migration 001–008 đã được thử thành công trong PostgreSQL cục bộ; chưa được agent áp dụng migration 006/007/008 lên Supabase thật.

Sau khi hoàn tất, kiểm tra `center_data_guard_permissions`, `profiles_guard_final_owner`, `center_data_guard_operations` và `center_data_guard_billing`; redeploy để nạp secret key mới; kiểm tra API, rồi chuyển domain chính sang bản mới. Kiểm tra Site URL/Redirect URLs của Supabase có `https://beezone-english.vercel.app` trước khi thử đăng nhập Google. Hướng dẫn chức năng: [SMALL_CENTER_GUIDE.md](SMALL_CENTER_GUIDE.md).

Các tệp môi trường, dữ liệu Excel riêng tư và thư mục `.vercel` được loại khỏi upload bằng `.vercelignore`. Không có secret key hoặc dữ liệu học viên trong tài liệu này.

## Cập nhật bảo mật — 14/10/2026

WAF tùy chỉnh trước đó chưa được cấu hình. Đã tạo và publish **BeeZone admin API rate limit**, bật firewall và đọc lại config active: đường dẫn bắt đầu `/api/admin/`, 60 yêu cầu/60 giây/IP, fixed window, vượt ngưỡng trả 429. Không có draft của người khác khi thực hiện, không bật challenge toàn trang, không chạy thử tải trên production. Quy tắc đang có hiệu lực độc lập với việc deploy mã ứng dụng.

Mã mới có module bảo vệ API dùng chung, quota SQL dùng chung máy chủ, giới hạn ghi trực tiếp, kiểm tra byte UTF-8, CSP script chặt hơn và log debug đã giảm thông tin trên production. **318 test / 22 tệp**, TypeScript/build production qua; audit dependency không báo lỗ hổng đã biết. Định nghĩa WAF: [ops/admin-api-rate-limit.json](ops/admin-api-rate-limit.json).

Đã kiểm tra lại tên biến Production: chưa có `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY`. Migration [009_request_quotas.sql](supabase/migrations/009_request_quotas.sql) mới được kiểm thử cục bộ, chưa áp dụng trên Supabase thật. Cần thử staging, áp dụng sau các migration 001–008 còn thiếu, rồi mới triển khai API mới; thiếu RPC sẽ trả 503 và chặn thao tác quản trị. Agent không chạy migration production, không triển khai thủ công mã mới hoặc chuyển domain trong lượt này. Hướng dẫn triển khai/bảo mật: [SECURITY.md](SECURITY.md).
