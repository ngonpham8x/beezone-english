# Trung tâm ngoại ngữ BeeZone
**Địa chỉ**: 111 Ngô Quyền, Long Hải, Long Hoa, Tây Ninh  
**Hotline**: 0847563679  

Ứng dụng quản lý nội bộ trung tâm ngoại ngữ, xây dựng bằng React/Vite và sẵn sàng deploy trên Vercel.

## Chạy cục bộ

1. Cài Node.js 22.22.2+ hoặc 24.15.0+ (phù hợp yêu cầu của bộ kiểm thử).
2. Chạy `npm ci` để cài đúng các phiên bản trong `package-lock.json`.
3. Chạy `npm run dev`. Khi chưa có Supabase, ứng dụng mở **bản xem thử cục bộ**; dữ liệu chỉ lưu trên trình duyệt này.
4. Để dùng dữ liệu thật, nhập cấu hình Supabase trong `.env.local` theo `.env.example`, chạy các migration theo thứ tự `001`–`009`, rồi khởi động lại server. Với project mới, có thể ghép SQL bằng `node scripts/create-supabase-setup.mjs`; xem [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## Kiểm tra và build

```sh
npm run lint
npm run test
npm run build
```

`npm run check` chạy cả ba bước. `npm run clean` dọn thư mục build và hoạt động trên Windows. Bản production không cho dùng tài khoản xem thử; thiếu cấu hình Supabase sẽ hiển thị thông báo chưa cấu hình.

## Cấu trúc và cập nhật mã

Giao diện và nghiệp vụ được chia theo thư mục trong `src/modules`; `src/app` ghép các màn hình, còn dịch vụ Excel tách theo bước nhập và từng sheet. Đọc [ARCHITECTURE.md](ARCHITECTURE.md) để biết nơi sửa từng chức năng, quy tắc dữ liệu và cách bổ sung module. GitHub Actions tự chạy `npm run check` khi push `main` hoặc mở PR, bao gồm kiểm tra vòng phụ thuộc và các luồng nghiệp vụ liên quan.

## Dữ liệu và sao lưu

Hướng dẫn khóa học theo đợt, thu học phí theo buổi, hạn thanh toán, lịch nghỉ/học bù và việc cần làm hôm nay: [SMALL_CENTER_GUIDE.md](SMALL_CENTER_GUIDE.md).

- Dữ liệu thật lưu trong `public.center_data`; thay đổi được lưu tuần tự và kiểm tra phiên bản để tránh ghi đè dữ liệu của người khác. Khi có lỗi hoặc xung đột, xem thông báo và sao lưu trước khi tải lại.
- Sao lưu **JSON** giữ đầy đủ cài đặt, học viên, lớp, giáo viên, phòng, lịch học, học phí, điểm, điểm danh và nhật ký.
- Báo cáo Excel mặc định là **XLSX**, có công thức và giữ lịch sử các lớp/đợt đóng tiền; không chạy macro cũ. Có thể nhập báo cáo XLSX/XLSM cũ, nhưng Excel không thay thế sao lưu JSON.
- Gửi email, sao lưu máy chủ theo lịch và Google Sheets chưa có dịch vụ thực thi được cấu hình. Ứng dụng không báo các chức năng này đang hoạt động.

Chi tiết các lỗi đã sửa, bằng chứng kiểm tra và những phần còn cần xác nhận trước khi dùng thật: [PROJECT_REVIEW.md](PROJECT_REVIEW.md).

## Đăng nhập và phân quyền

- Chỉ đăng nhập bằng Google OAuth; hệ thống không hiển thị đăng nhập email/mật khẩu.
- Không có tự đăng ký công khai.
- Hai cấp bậc: `owner` (Chủ trung tâm) và `staff` (Nhân viên).
- Chỉ `owner` có thể cấp quyền Google trực tiếp bằng email hoặc khóa tài khoản.

Đọc quy trình thiết lập Supabase trong [SUPABASE_SETUP.md](SUPABASE_SETUP.md) và yêu cầu bảo mật/deploy trong [SECURITY.md](SECURITY.md).
