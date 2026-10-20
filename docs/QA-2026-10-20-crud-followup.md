# Rà soát quyền và luồng nhập dữ liệu — 20/10/2026

- Tách quyền thêm/sửa/xóa chương trình, lớp/lịch, phòng; tách thêm và sửa giáo viên. UI, chuẩn hóa profile, API quản trị và guard database cùng đọc các khóa mới. Khóa cũ giữ tương thích; quyền mới false/null/chuỗi không được tự nâng quyền.
- Người dùng đã xác nhận áp dụng `013_independent_crud_permissions.sql` thành công trong SQL Editor. Không chạy migration production tự động, không đổi CAS hoặc quota.
- Tạo học viên đã đăng ký trước khi có lớp/chương trình; tạo lớp trước khi xếp lịch/giáo viên/phòng; tạo giáo viên trước phân công. Kiểm tra cả sáu thứ tự tạo rồi liên kết hai lớp cho cùng học viên và giáo viên.
- Form chỉnh sửa xác nhận trước khi lưu, hủy giữ nguyên nháp; xóa có xác nhận và chỉ báo thành công khi thao tác thực hiện. Phân công nhiều lớp của giáo viên dùng danh sách checkbox và cập nhật liên kết lớp thực.
- Giữ lịch sử điểm danh khi sửa học viên, gồm cả buổi vắng toàn bộ hoặc đi muộn. Bỏ quy tắc tự xóa theo ngày cố định. Chặn xóa buổi có entries; chỉ chủ trung tâm đang hoạt động được xóa buổi trống chưa có phiếu thu.
- Giữ chương trình vừa tạo thủ công khi lưu hồ sơ học viên. Mã học viên mới dựa trên số lớn nhất, không dựa số hồ sơ còn lại sau xóa.
- `npm run check`: TypeScript, 454 kiểm thử trong 38 tệp, build production và CSP; thêm hồi quy cho lịch sử điểm danh và mã học viên. Kiểm thử đồng bộ xác minh không ghi bản sửa đang chờ kiểm tra profile, đồng thời cho phép nhật ký đăng nhập đã đồng bộ trước đó.
- Trình duyệt dùng fixture và chặn API/cloud: 18 màn hình × Chrome/WebKit × 320/820/1366 px; kiểm tra tạo hồ sơ, checkbox nhiều lớp, hủy xác nhận, cập nhật và xóa phòng với một thông báo cho mỗi thao tác. Không ghi dữ liệu thử vào tài khoản thật.
- Kiểm tra WebKit mô phỏng không thay thế kiểm tra Safari trên iPhone thật.
