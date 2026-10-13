# Trạng thái triển khai Vercel — 13/10/2026

Bản mã ứng dụng `0d131f0` đã build và deploy thành công với trạng thái **Ready**:

- Deployment: https://beezone-english-l2hq1npk7-ngonpham8x.vercel.app
- Trang quản lý: https://vercel.com/ngonpham8x/beezone-english/8YBvrzqfbq45JCFV41itZL8FWnhB
- Domain chính `https://beezone-english.vercel.app` vẫn đang chạy bản cũ. Deployment được tạo với `--prod --skip-domain` để kiểm tra trước khi chuyển domain.

Đã cấu hình Production: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `APP_URL`, `ALLOWED_ORIGINS`. Đã xác nhận Google provider của Supabase đang bật. Chưa kiểm thử đăng nhập Google bằng tài khoản thật.

Kiểm tra: 88 test và build local qua; build Vercel qua; HTML/JS/CSS của bản mới trả HTTP 200 khi truy cập bằng tài khoản Vercel; CSS có các sửa thanh cuộn và dialog; JS có kết nối Supabase và không có xác thực xem thử. Lỗi ESM của API quản lý tài khoản đã được sửa; API nạp được và trả lỗi JSON cấu hình vì chưa có secret key.

## Hai bước còn thiếu trước khi chuyển domain

1. Trong [Vercel Environment Variables](https://vercel.com/ngonpham8x/beezone-english/settings/environment-variables), thêm `SUPABASE_SECRET_KEY` từ đúng project Supabase, chọn **Production**. Có thể dùng `SUPABASE_SERVICE_ROLE_KEY` nếu dùng khóa legacy. Không dùng tiền tố `VITE_` cho khóa máy chủ, không đưa khóa vào GitHub hoặc chat.
2. Chạy [migration 006](https://github.com/ngonpham8x/beezone-english/blob/main/supabase/migrations/006_enforce_business_permissions.sql) trong Supabase SQL Editor. Kết nối MCP hiện chỉ đọc; lần chạy thử trả `cannot execute CREATE FUNCTION in a read-only transaction`, và hai trigger bảo vệ vẫn chưa tồn tại. Không có thay đổi schema nào được áp dụng trong lần chạy bị từ chối.

Sau khi hoàn tất, kiểm tra lại sự tồn tại của `center_data_guard_permissions` và `profiles_guard_final_owner`, redeploy để nạp secret key mới, kiểm tra API, rồi chuyển domain chính sang bản mới. Kiểm tra Site URL/Redirect URLs của Supabase có `https://beezone-english.vercel.app` trước khi thử đăng nhập Google.

Các tệp môi trường, dữ liệu Excel riêng tư và thư mục `.vercel` được loại khỏi upload bằng `.vercelignore`. Không có secret key hoặc dữ liệu học viên trong tài liệu này.
