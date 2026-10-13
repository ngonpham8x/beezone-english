# Trạng thái triển khai Vercel — 13/10/2026

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
