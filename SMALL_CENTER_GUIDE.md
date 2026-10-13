# Vận hành một trung tâm nhỏ

## Đợt học và học tiếp

- Trong **Lớp học & Điểm danh**, tạo một lớp với mã riêng cho mỗi đợt. Nhập ngày khai giảng, kết thúc, số buổi dự kiến và trạng thái.
- Lớp cũ chưa có các trường này vẫn dùng được. Không tự gán ngày hoặc số buổi cho dữ liệu cũ.
- Thẻ lớp hiển thị số buổi đã ghi nhận điểm danh. Khi chọn **Đã kết thúc**, hệ thống giữ lớp, điểm, học phí và lịch sử đăng ký.
- Trong **Học viên**, chọn **Học đợt tiếp** để chuyển sang một đợt đang mở. Sau đó lập phiếu học phí của đợt mới tại **Học phí**. Xem các đợt đã học trong chi tiết học viên.
- Danh sách điểm danh lấy lịch sử đăng ký theo ngày, nên chuyển sang đợt tương lai vẫn giữ học viên trong đợt cũ trước ngày chuyển. Mỗi học viên có một lớp chính; học nhiều lớp đồng thời chưa nằm trong đợt bổ sung này.

## Hạn học phí

- Đặt **Hạn thanh toán** khi lập hoặc sửa phiếu thu. Việc đặt hạn không tự ghi nhận tiền đã thu.
- Phân biệt **Quá hạn**, **Đến hạn trong 7 ngày**, **Chưa đặt hạn**. Phiếu đã đóng đủ không nằm trong danh sách nhắc.
- Chọn **Soạn lời nhắc**, kiểm tra nội dung, rồi sao chép gửi phụ huynh. Đây là thao tác chuẩn bị nội dung; chưa gửi tự động qua Zalo/email.
- Ngày khai giảng/kết thúc, số buổi, trạng thái đợt và hạn học phí được đưa vào báo cáo Excel và đọc lại khi nhập báo cáo.

## Lịch nghỉ, đổi lịch và học bù

- Trong **Thời khóa biểu**, phần **Lịch thực tế** cho chọn ngày cụ thể. Lịch tuần bên dưới là lịch lặp lại.
- Chủ trung tâm chọn **Nghỉ / đổi / học bù**, chọn lớp, buổi gốc và lý do. Buổi đổi/học bù có ngày, giờ, giáo viên và phòng riêng.
- Một điều chỉnh chỉ ảnh hưởng buổi đã chọn. Hệ thống kiểm tra trùng giáo viên/phòng trên ngày mới, bảo vệ buổi đã điểm danh và ngăn sửa lịch tuần làm mất buổi gốc hoặc trùng buổi học bù.
- Mỗi lớp có tối đa một buổi điểm danh mỗi ngày trong luồng này. Buổi bị hủy không được tạo điểm danh mới; lịch sử đã lưu vẫn chỉnh sửa được.
- **Lịch giáo viên** có phần lịch thực tế theo ngày. Giáo viên dạy thay cần được chủ trung tâm cấp quyền lớp tương ứng trước khi nhập điểm danh.

## Việc cần làm hôm nay

Trang Tổng quan hiển thị lớp hôm nay, lớp chưa điểm danh, khoản học phí cần nhắc, học viên nghỉ hai buổi liên tiếp và đợt học sắp kết thúc trong 14 ngày. Bấm vào mục để mở lớp/ngày hoặc phiếu cần xử lý. Thông tin công nợ chỉ hiển thị khi người dùng có quyền xem công nợ.

## Dữ liệu, sao lưu và triển khai

- Sao lưu JSON giữ đầy đủ các trường mới, lịch sử đăng ký và lịch nghỉ/học bù. Bản sao lưu cũ vẫn khôi phục được; các danh sách mới bắt đầu rỗng.
- Excel là báo cáo. Khi đã có lịch sử đăng ký hoặc lịch điều chỉnh, hệ thống chặn thay toàn bộ dữ liệu bằng Excel để tránh mất lịch sử; vẫn nhập thêm học viên được. Dùng JSON để khôi phục toàn bộ.
- Chạy migration **006 rồi 007** trên Supabase trước khi đưa bản này lên domain chính. 007 bổ sung kiểm tra dữ liệu và quyền ghi cho các phần mới, đồng thời chặn ứng dụng cũ ghi đè làm mất các danh sách mới. Migration không thay dữ liệu hiện có.
- Vercel Production vẫn cần `SUPABASE_SECRET_KEY` cho API quản lý tài khoản. Khóa này không được đặt trong `VITE_`, GitHub hoặc chat.
- Quyền đọc chi tiết vẫn cần hoàn thiện theo `SECURITY.md`; các phần mới không thay đổi giới hạn kiến trúc của tài liệu dữ liệu chung.
