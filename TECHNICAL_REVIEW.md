# Kiểm tra kỹ thuật

Xem kết quả rà soát và các thay đổi đã được kiểm tra trong [PROJECT_REVIEW.md](PROJECT_REVIEW.md).

Tài liệu cũ đã được thay vì có hai khuyến nghị sai: React không tạo vòng lặp chỉ vì gọi setter với cùng giá trị primitive, và loại bỏ các dependency dữ liệu khỏi effect đồng bộ sẽ làm thay đổi không được lưu. Các dependency dữ liệu được giữ; quá trình lưu được xử lý bằng hàng đợi, so sánh phiên bản và báo lỗi rõ ràng.

Nguyên nhân thực tế cần khắc phục là callback Auth thực hiện truy vấn trong khóa xác thực, closure giữ trạng thái hydration cũ, cùng việc tải lại snapshot sau các sự kiện phiên đăng nhập. Callback truy vấn đã được hoãn ra ngoài khóa; profile được kiểm tra lại mà không thay dữ liệu nghiệp vụ đang chỉnh sửa.
