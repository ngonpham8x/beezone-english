# Trung tâm ngoại ngữ BeeZone
**Địa chỉ**: 111 Ngô Quyền, Long Hải, Long Hoa, Tây Ninh  
**Hotline**: 0847563679  

Ứng dụng quản lý nội bộ trung tâm ngoại ngữ, xây dựng bằng React/Vite và sẵn sàng deploy trên Vercel.

## Chạy cục bộ

1. Cài Node.js 20 LTS hoặc mới hơn.
2. Chạy `npm install`.
3. Sao chép `.env.example` thành `.env.local` rồi nhập cấu hình Supabase.
4. Chạy `npm run dev`.

## Đăng nhập và phân quyền

- Chỉ đăng nhập bằng Google OAuth; hệ thống không hiển thị đăng nhập email/mật khẩu.
- Không có tự đăng ký công khai.
- Hai cấp bậc: `owner` (Chủ trung tâm) và `staff` (Nhân viên).
- Chỉ `owner` có thể cấp quyền Google trực tiếp bằng email hoặc khóa tài khoản.

Đọc quy trình thiết lập Supabase trong [SUPABASE_SETUP.md](SUPABASE_SETUP.md) và yêu cầu bảo mật/deploy trong [SECURITY.md](SECURITY.md).
