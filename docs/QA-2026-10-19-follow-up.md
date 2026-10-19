# Rà soát bổ sung dự án BeeZone — 19/10/2026

Đối chiếu trên mã nguồn sau commit `8f036be`. Các thay đổi phân quyền, học phí và thanh cuộn trước đó đã có trên `origin/main`; GitHub Actions và Vercel báo thành công cho commit này.

## Lỗi được sửa

- Xóa lớp: trước đây Chủ trung tâm có thể xóa lớp còn điểm hoặc điểm danh không tính phí theo buổi. Nay mọi tài khoản đều phải giữ lớp có lịch sử và chuyển trạng thái kết thúc; lớp trống vẫn có thể xóa. Kiểm tra cả hai loại lịch sử bằng thao tác thực qua store/actions.
- Phân loại chương trình: dấu phẩy trong `Cambridge (Starters, KET, PET)` bị hiểu thành nhiều nhóm, khiến mở sửa và lọc không khớp. Bộ đọc dùng chung giữ dấu phẩy trong ngoặc, hỗ trợ nhóm cũ và loại mục lặp, không đổi schema chuỗi.
- Bàn phím: Escape trong bộ chọn phân loại chỉ đóng danh sách và trả focus về nút mở; Escape tiếp theo mới đóng hộp thoại.
- Nhật ký lỗi đồng bộ: dùng bộ chẩn đoán chung; production chỉ ghi mã sự kiện, không ghi nguyên đối tượng lỗi máy chủ.

## Kiểm tra

- `npm run check`: TypeScript, 406 kiểm thử trong 31 tệp, build production và kiểm tra CSP/mã xác thực xem thử.
- `npm audit --audit-level=high`: 0 lỗ hổng.
- 108 lượt hiển thị: 18 màn hình × 3 kích thước (320, 820, 1366 px) × Chrome/WebKit. Kiểm tra tràn ngang và lỗi runtime.
- 6 lượt thao tác mở chương trình, mở danh sách phân loại, Escape, giữ hộp thoại, trả focus, Escape đóng hộp thoại.
- `git diff --check`.

## Phạm vi xác minh

Kiểm tra trình duyệt dùng dữ liệu giả lập và chặn API/cloud; WebKit chạy trên Windows, chưa phải Safari trên iPhone thật. Không thay dữ liệu production hay chạy migration. Lần sửa này không thêm migration. Quyền quản lý đào tạo trước đó vẫn cần migration 011 và quyền do Chủ trung tâm cấp.

Chưa có nguồn dữ liệu xác định cho yêu cầu nhập lại các lớp học trước đây; không đưa lớp mẫu vào dữ liệu thật. Cần đối chiếu bản sao lưu hoặc danh sách lớp người dùng cung cấp trước khi nhập.
