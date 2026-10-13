# Trạng thái triển khai Vercel — 13/10/2026

Bản mã ứng dụng `ad9114f` đã build và deploy thành công với trạng thái **Ready**, gồm đợt học, hạn học phí, lịch nghỉ/học bù và việc cần làm hôm nay:

- Deployment: https://beezone-english-g2olt5xru-ngonpham8x.vercel.app
- Trang quản lý: https://vercel.com/ngonpham8x/beezone-english/4XKBLpUU5NZgVjWJXKcUw1p1YUPA
- Domain chính `https://beezone-english.vercel.app` vẫn đang chạy bản cũ. Deployment được tạo với `--prod --skip-domain` để kiểm tra trước khi chuyển domain.

Đã cấu hình Production: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `APP_URL`, `ALLOWED_ORIGINS`. Đã xác nhận Google provider của Supabase đang bật. Chưa kiểm thử đăng nhập Google bằng tài khoản thật.

Kiểm tra: **116 test / 12 tệp**, TypeScript và build local qua; build Vercel qua; HTML/JS/CSS của bản mới trả HTTP 200 khi truy cập bằng tài khoản Vercel. CSS `index-CfkjOqaT.css` có thanh cuộn ngang 20px và bố cục các phần mới. JS `index-BzgIqleG.js` có cấu hình Supabase và không có xác thực xem thử. API quản lý tài khoản nạp được nhưng trả HTTP 500 JSON “Máy chủ chưa được cấu hình Supabase.” vì chưa có secret key. Không có trình duyệt kết nối để kiểm tra ảnh giao diện hoặc đăng nhập thật.

Domain chính đã được kiểm tra lại: HTTP 200, vẫn dùng CSS cũ `index-D6DviX8x.css`. Alias `beezone-english-ngonpham8x.vercel.app` trỏ tới bản staged và có bảo vệ bằng tài khoản Vercel; domain chính chưa được chuyển.

## Hai bước còn thiếu trước khi chuyển domain

1. Trong [Vercel Environment Variables](https://vercel.com/ngonpham8x/beezone-english/settings/environment-variables), thêm `SUPABASE_SECRET_KEY` từ đúng project Supabase, chọn **Production**. Có thể dùng `SUPABASE_SERVICE_ROLE_KEY` nếu dùng khóa legacy. Không dùng tiền tố `VITE_` cho khóa máy chủ, không đưa khóa vào GitHub hoặc chat.
2. Chạy [migration 006](https://github.com/ngonpham8x/beezone-english/blob/main/supabase/migrations/006_enforce_business_permissions.sql), rồi [migration 007](https://github.com/ngonpham8x/beezone-english/blob/main/supabase/migrations/007_small_center_operations.sql) trong Supabase SQL Editor. Kết nối MCP trước đó chỉ đọc, lần chạy 006 bị từ chối và không thay đổi schema. Lần kiểm tra đầu đợt bổ sung vẫn chưa thấy hai trigger của 006; lần kiểm tra cuối bị lỗi OAuth token refresh, nên chưa xác nhận được các migration đã được áp dụng. Migration 007 đã được thử thành công trong PostgreSQL cục bộ, chưa được agent áp dụng lên Supabase thật.

Sau khi hoàn tất, kiểm tra `center_data_guard_permissions`, `profiles_guard_final_owner` và `center_data_guard_operations`; redeploy để nạp secret key mới; kiểm tra API, rồi chuyển domain chính sang bản mới. Kiểm tra Site URL/Redirect URLs của Supabase có `https://beezone-english.vercel.app` trước khi thử đăng nhập Google. Hướng dẫn chức năng: [SMALL_CENTER_GUIDE.md](SMALL_CENTER_GUIDE.md).

Các tệp môi trường, dữ liệu Excel riêng tư và thư mục `.vercel` được loại khỏi upload bằng `.vercelignore`. Không có secret key hoặc dữ liệu học viên trong tài liệu này.
