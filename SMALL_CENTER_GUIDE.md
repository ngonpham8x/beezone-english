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

## Học và thu tiền theo buổi

1. Trong **Lớp học**, sửa lớp → **Hình thức học phí** → **Theo buổi học**. Nhập đơn giá mỗi buổi và ngày bắt đầu áp dụng. Quy tắc mặc định theo lựa chọn của trung tâm: **có mặt hoặc đi trễ mới tính phí**; vắng có phép và không phép đều không thu. Chủ trung tâm có thể cấu hình quy tắc khác cho lớp có thỏa thuận riêng.
2. Lưu điểm danh sau buổi học. Hệ thống lưu đơn giá và quy tắc tại thời điểm này; đổi giá của lớp chỉ ảnh hưởng buổi mới. Điểm danh cũ chưa có cấu hình tính phí giữ nguyên, trừ khi Chủ trung tâm chọn rõ **Ghi nhận học phí cho buổi cũ này theo đơn giá hiện tại**.
3. Vào **Học phí → Học phí theo buổi**, chọn học viên, chọn một hoặc nhiều buổi, nhập tiền thực nhận, giảm giá, ngày thu và hạn thanh toán. Có thể lập phiếu với số đã thu bằng 0 để theo dõi khoản phải thu, hoặc thu một phần.
4. Với phiếu còn thiếu, dùng **Thu đợt tiếp**. Doanh thu ghi nhận theo ngày nhận tiền của từng đợt, giữ nguyên danh sách buổi và đơn giá. Phiếu in có chi tiết ngày học và giá từng buổi; sửa phiếu theo buổi chỉ điều chỉnh hạn thanh toán.
5. Công nợ học viên, lớp, Tổng quan và Báo cáo gồm cả buổi đã điểm danh nhưng chưa lập phiếu. Một buổi của một học viên chỉ có một phiếu học phí; khoản còn thiếu trên phiếu được theo dõi riêng. Muốn sửa trạng thái điểm danh làm thay đổi phí của buổi đã có phiếu, cần xử lý phiếu liên quan trước.

Lớp theo buổi không tự tạo học phí khóa khi nhập học. Buổi hủy không tạo điểm danh mới; buổi học bù tính phí khi thực sự tham gia theo quy tắc lớp. Chưa hỗ trợ gói trả trước/số dư buổi; luồng này thu cho các buổi đã ghi nhận điểm danh.

Excel có cấu hình giá lớp, chi tiết phiếu theo buổi, sheet **ĐIỂM DANH BUỔI** để giữ nguồn tính phí và **BUỔI CHƯA THU** chốt tại thời điểm xuất. JSON vẫn là bản sao lưu toàn bộ được khuyến nghị.

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
- Excel là báo cáo. Khi đã có lịch sử đăng ký, lịch điều chỉnh hoặc giá buổi đã ghi nhận, hệ thống chặn thay toàn bộ dữ liệu bằng Excel để tránh mất lịch sử; vẫn nhập thêm học viên được. Dùng JSON để khôi phục toàn bộ.
- Chạy migration **006 → 007 → 008 → 009** trên Supabase trước khi đưa bản mới lên domain chính, sau khi đã thử trong staging. 008 bảo vệ giá buổi đã lưu, tham chiếu phiếu và khoản thu, chặn tính phí trùng, kiểm tra quyền ghi và công nợ suy ra từ điểm danh. 009 bổ sung quota chống spam API và ghi dữ liệu trực tiếp. Các migration không thay lịch sử hiện có.
- Vercel Production vẫn cần `SUPABASE_SECRET_KEY` cho API quản lý tài khoản. Khóa này không được đặt trong `VITE_`, GitHub hoặc chat.
- Quyền đọc chi tiết vẫn cần hoàn thiện theo `SECURITY.md`; các phần mới không thay đổi giới hạn kiến trúc của tài liệu dữ liệu chung.
