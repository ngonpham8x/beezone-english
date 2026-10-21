# Cập nhật cấp bậc và hiển thị tài khoản

## Lỗi và thay đổi

Hộp sửa quyền dùng `z-60`, trong khi xác nhận của `ConfirmedForm` dùng `z-50`. Cả hai portal ra body nên xác nhận nằm sau cửa sổ sửa: người dùng bấm cập nhật nhưng không thấy bước xác nhận. `useOverlay` nay xếp lớp dialog mới phía trên các dialog đang mở và khôi phục style khi đóng. Focus, Escape và bản nháp khi hủy vẫn được giữ.

Lỗi API xuất hiện ngay trong cửa sổ sửa quyền và qua toast. Thành công hiển thị ngay khi API xác nhận cập nhật, trước khi tải lại danh sách. Có giới hạn thời gian chờ; khi chưa xác định kết quả, hướng dẫn làm mới danh sách thay vì tự gửi lại thao tác. Toast trên điện thoại giữ đủ lề trái/phải.

Migration 014 và `server/accountVisibility.ts` bổ sung hạn chế hiển thị theo ID người xem do database quản lý. Áp dụng ở danh sách tài khoản, truy cập tài khoản bằng ID/email và bản hiển thị nhật ký. Người xem vẫn phải là Chủ trung tâm đang hoạt động qua `server/admin.ts`; không cấp thêm vai trò từ cấu hình hiển thị. Cơ chế `is_private` cũ tiếp tục hoạt động.

Email cấu hình thật chỉ nằm trong SQL được sinh tại `.vercel` (Git bỏ qua). Người dùng xác nhận chạy SQL thành công với `visibility_configured = true`. Không tự thực hiện thay đổi quyền của tài khoản thật trong quá trình kiểm thử.

## Kiểm tra

`npm run check` đạt: TypeScript, 472/472 test (40 tệp), build production và kiểm tra CSP/loại mã đăng nhập xem thử.

- Kiểm thử giao diện: hủy xác nhận giữ cửa sổ sửa; xác nhận gửi đúng vai trò owner; thành công đóng cửa sổ và báo kết quả; API lỗi giữ cửa sổ và hiển thị lỗi tại đó.
- Kiểm thử API: chỉ người xem được cấu hình nhận danh tính tài khoản; chặn cập nhật qua ID đoán được; giữ quota/xác thực; lỗi đọc quy tắc đóng truy cập; dữ liệu cũ trước migration 014 vẫn giữ quy tắc private cũ.
- PGlite chạy toàn bộ migration và cấu hình mẫu: không đổi role/permissions, chạy lại cấu hình không tạo bản ghi trùng, tài khoản authenticated không được đọc hoặc sửa bảng quy tắc.
- Chrome và WebKit: 320/820/1366 px, cả hai kết quả API (12 luồng), nhấn trực tiếp nút xác nhận không bị cửa sổ cha che, Tab/Escape đúng dialog, không tràn ngang và thông báo nằm trong viewport. Dùng dữ liệu mẫu, không gửi API tới hệ thống thật. WebKit không thay thế kiểm tra trên iPhone thật.
