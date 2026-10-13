# Rà soát BeeZone English — 13/10/2026

Đợt rà soát tập trung vào lỗi có thể mất dữ liệu, sai học phí/lịch sử, quyền truy cập, lỗi giao diện khi chuyển phân hệ và khả năng build trên Windows. Thay đổi được thực hiện trong repository; chưa triển khai lên Vercel hoặc thay đổi Supabase thật.

## Các lỗi và thay đổi đã xử lý

| Nhóm | Vấn đề trước đây | Thay đổi |
| --- | --- | --- |
| Đăng nhập | Thiếu Supabase vẫn tự mở chủ trung tâm; form mật khẩu và chuyển tài khoản mẫu xuất hiện trong bản thật | Xem thử chỉ có trong development; production chỉ dùng Google và đóng truy cập khi thiếu cấu hình |
| Phiên đăng nhập | Closure hydration cũ và callback Auth có thể tải lại dữ liệu đang sửa | Hoãn truy vấn khỏi khóa Auth, chống kết quả của phiên cũ, kiểm tra lại profile mà không tải lại dữ liệu nghiệp vụ |
| Đồng bộ | Nhiều yêu cầu ghi toàn bộ snapshot có thể đảo thứ tự và ghi đè phiên khác; lỗi chỉ nằm trong console | Hàng đợi tuần tự, gộp thay đổi liên tiếp, kiểm tra `updated_at`, báo đang lưu/lỗi/xung đột, thử lại và cảnh báo trước khi đóng trang |
| Dữ liệu cục bộ | Đổi phiên bản schema tự xóa toàn bộ dữ liệu trình duyệt | Giữ dữ liệu cũ; không tự xóa khi mở ứng dụng |
| Tài khoản | API giả báo thành công ở development; phản hồi HTML được xem là thành công; thiếu danh sách sửa/khóa tài khoản | Development dùng API bảo vệ thật; kiểm tra JSON và HTTP status; hiển thị lỗi, danh sách tài khoản, sửa quyền và khóa/mở khóa |
| Bảo mật | Quyền thiếu được cộng từ mặc định rộng; có thể hạ quyền chủ cuối cùng; quyền ghi chủ yếu ở giao diện | Quyền thiếu được từ chối, chặn tự hạ quyền, migration 006 bảo vệ chủ cuối và kiểm tra quyền ghi ở DB; build chặn secret trong `VITE_` |
| Nhập học | Chọn sai chương trình tính phí; tạo phiếu nhập học sai loại hoặc trùng; có thể vào lớp đầy | Dùng chương trình của lớp, phiếu học phí khóa rõ ràng, kiểm tra phiếu đã có và sức chứa đã khai báo |
| Điểm | Không tạo được điểm nếu học viên chưa có dòng điểm; cập nhật theo học viên làm lẫn các lớp | Tạo bản ghi khi nhập điểm lần đầu; tra/cập nhật theo cặp học viên–lớp; giữ điểm của lớp cũ |
| Điểm danh | Sao lưu bỏ dữ liệu; học viên chuyển lớp biến mất khỏi lịch sử; chọn lớp đã bị thu hồi | Sao lưu đầy đủ, giữ học viên/entry lịch sử, kiểm tra lớp được phép và quyền lưu |
| Lịch học | Chuyển ca không cập nhật lịch tóm tắt lớp cũ; sửa lịch trong form lớp bỏ kiểm tra xung đột | Cập nhật cả lớp cũ/mới; kiểm tra giờ, giao nhau của giáo viên/phòng và phòng bảo trì |
| Quan hệ dữ liệu | Xóa phòng/giáo viên/chương trình còn liên kết; công cụ tự sửa có thể chuyển học viên về lớp cũ | Chặn thao tác còn liên kết; sửa roster theo `student.classId`, không chuyển học viên hoặc xóa phiếu thu mồ côi |
| Mã dữ liệu | ID phòng/giáo viên/lớp sinh từ số bản ghi có thể ghi đè sau khi xóa; mã phiếu bị tái sử dụng | UUID cho ID mới và mã phiếu theo số lớn nhất đã có; kiểm tra mã chương trình/lớp/học viên trùng |
| Học phí nhiều đợt | Lịch sử không đầy đủ có thể mất khoản thu ban đầu khi thu tiếp hoặc xuất báo cáo | Giữ phần đã thu chưa có entry; báo cáo theo ngày từng đợt và kiểm tra số tiền không âm |
| Excel | Gán phiếu về lớp hiện tại; gộp phiếu trùng mã của người/lớp khác; mất người thu và điểm cũ | Giữ lớp lịch sử, người thu, các đợt thanh toán và điểm từng lớp; từ chối nhóm phiếu không hợp lệ |
| Macro Excel | Macro cũ xây lại bảng điểm từ danh sách lớp hiện tại, có thể mất điểm lịch sử khi chuyển lớp | Báo cáo mới mặc định XLSX, có công thức và không nhúng VBA; vẫn đọc XLSX/XLSM cũ |
| Khôi phục | Chấp nhận JSON có record thiếu trường, ID trùng hoặc số tiền sai; thiếu dữ liệu trong modal sao lưu | Kiểm tra cấu trúc/ID/số tiền/ngày trước khi thay state; đủ mọi mảng, kể cả điểm danh; giới hạn tệp 25 MB |
| Ngày báo cáo | Dùng ngày UTC khiến lệch ngày/tháng ở Việt Nam; báo cáo tự chọn giao dịch gần nhất | Dùng ngày Việt Nam; chọn ngày báo cáo; tính tuần theo ngày lịch |
| Giao diện | Tìm kiếm chỉ tác động học viên; Ctrl+K chưa làm việc; URL tab lạ tạo trang trống; form cài đặt giữ dữ liệu cũ | Tìm kiếm học viên/lớp/giáo viên không dấu; phím tắt; tab hợp lệ; làm mới form; nhãn truy cập và trạng thái lưu |
| Mobile | Input nhỏ khiến Safari phóng to, tiêu đề/điều khiển dễ chật | Input tối thiểu 16 px trên điện thoại, nút dễ chạm, tiêu đề co giãn, focus rõ và hỗ trợ giảm chuyển động |
| Lỗi hiển thị | Lỗi một phân hệ có thể làm mất cả workspace | Error boundary theo phân hệ giữ khung ứng dụng; thông báo thay cho màn hình trắng |
| PWA | API có thể rơi vào cache fallback; response offline không hợp lệ; xóa cache của app khác | Bỏ qua API/cross-origin, response offline rõ ràng, cache assets và chỉ dọn cache BeeZone |
| Tính năng chưa kết nối | Checkbox tự động email/sao lưu tạo cảm giác dịch vụ đã chạy; thống kê phiên cục bộ ghi là trực tuyến | Tắt điều khiển chưa có dịch vụ; ghi đúng giới hạn phiên cục bộ |
| Build và thư viện | 6 cảnh báo bảo mật; bundle chính khoảng 2,3 MB; thiếu kiểu React; script clean chỉ chạy Unix | Cập nhật dependency, thêm kiểu thật, tách tải phân hệ/Excel/biểu đồ, clean Node trên Windows và dùng `npm ci` |

## Kiểm tra

- TypeScript: `npm run lint`; build gồm kiểm tra kiểu trước khi bundle.
- **`npm run check` đã qua toàn bộ ở lượt cuối**: kiểm tra kiểu, 63 test và production build. TypeScript chỉ quét mã nguồn/config/test, bỏ qua `dist`; build tự kiểm tra bundle không chứa mã xác thực xem thử.
- **82 test / 9 tệp đã qua**, trong đó điều hướng cả 18 phân hệ và 19 test responsive bổ sung. Test trong `tests/`: dữ liệu/sao lưu, tiền và ngày, xác thực, phiên làm mới, xung đột/lỗi lưu, API trả HTML, Excel xuất–nhập, quyền DB, điều hướng, menu/dialog/focus và thay đổi viewport. Xem [UI_REVIEW.md](UI_REVIEW.md) để biết phạm vi kiểm tra đa thiết bị.
- Các migration 001–006 được thực thi trên PostgreSQL cục bộ (PGlite). Kiểm tra RLS tài khoản khóa, quyền ghi, lớp được phân công, dữ liệu không hợp lệ, chủ cuối cùng và cập nhật snapshot cũ.
- Kiểm tra HTTP development: API chưa cấu hình trả lỗi JSON đúng, không trả danh sách giả hoặc báo thành công giả.
- `npm audit`: **0 lỗ hổng**, kiểm tra cả dependency phát triển theo lockfile.
- Build chia bundle chính từ khoảng 2.305 KB xuống khoảng 359 KB sau khi tách phân hệ và bổ sung xử lý responsive/dialog. ExcelJS vẫn có chunk lớn tải riêng khi dùng Excel; đây còn là giới hạn thư viện.

## Phần còn phải xác nhận trước khi vận hành

1. **Kết nối thật:** môi trường local chưa có cấu hình Supabase của trung tâm. Cần đặt biến môi trường, chạy migration 006 trên đúng project, cấu hình Google OAuth và thử owner/staff trên Vercel. Chưa có kiểm thử Google OAuth hoặc Vercel thật trong đợt này.
2. **Quyền đọc chi tiết:** `center_data` vẫn là một tài liệu chung mà mọi tài khoản active có thể đọc ở DB. Migration 006 bảo vệ ghi; việc ẩn công nợ hoặc giới hạn lớp trên giao diện chưa cách ly quyền đọc. Nếu cần tính riêng tư giữa nhân viên/giáo viên, cần tách bảng + read RLS hoặc API lọc dữ liệu; xem `SECURITY.md`.
3. **Giao diện thực tế:** môi trường không có trình duyệt kết nối. Đã kiểm tra DOM và điều hướng tự động, chưa xác nhận bố cục bằng ảnh trên Chrome/Safari/iPhone/Android, bản in A4, chia sẻ ảnh hoặc cài PWA thật.
4. **Dịch vụ tự động:** chưa có máy chủ/credential cho email, lịch backup hoặc Sheets. Các chức năng chưa được cấu hình được ghi rõ; không có thông báo hoạt động giả.
5. **Dữ liệu nhiều người sửa:** khi hai phiên cùng sửa, phiên sau phát hiện xung đột và giữ bản đang sửa để sao lưu. Chưa tự hợp nhất hai snapshot hay tự tải thay đổi của người khác trong lúc đang làm việc.
6. **Nhật ký và Auth:** hoạt động quản lý tài khoản còn dùng hoàn tác bù khi ghi audit thất bại, chưa có transaction nguyên tử bao phủ cả Supabase Auth và DB. Nhật ký nghiệp vụ trong document không phải nhật ký kiểm toán bất biến; nhật ký tài khoản riêng vẫn chỉ máy chủ được ghi.

Không có dữ liệu riêng tư hoặc khóa bí mật nào được đưa vào báo cáo này.
