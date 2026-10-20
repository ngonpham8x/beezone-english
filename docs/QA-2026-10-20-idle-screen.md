# Trang Học viên sau thời gian không hoạt động

Người dùng gặp màn hình lỗi tại mục Học viên sau khi để ứng dụng không hoạt động; tải lại trang thì mở được. Chưa có stack trace của phiên đó, nên chưa thể xác định chắc chắn nguyên nhân.

Đã kiểm tra domain gốc, www và Vercel: HTML cùng module Học viên hiện tại đều trả 200 với đúng kiểu JavaScript. Có một lỗi xác định được trong service worker: HTTP lỗi của asset không dùng bản cache, dù bản cache đúng URL đã tồn tại. Sau deployment, tab cũ có thể vẫn tham chiếu URL hash cũ.

Bản sửa dùng lại đúng asset đã cache khi mạng trả HTTP lỗi, không thay JavaScript bằng HTML, không can thiệp API. Module chưa từng được cache vẫn cần tải lại phiên bản hiện tại nếu deployment cũ đã mất.

ErrorBoundary phân biệt lỗi tải module (`UI-MODULE`) và lỗi render (`UI-RENDER`), không đưa thông tin exception/dữ liệu cá nhân ra giao diện. Lỗi render có nút mở lại riêng mục đó, giữ state bên ngoài boundary. Không tự reload, không xóa dữ liệu hay đổi cơ chế đồng bộ khi quay lại tab.

Regression test kiểm tra fallback asset 404, asset không có cache, API không bị chặn/cache, phục hồi render giữ bản nháp bên ngoài và thông báo lỗi module không lộ URL.

Kết quả: 461/461 test đạt. Chrome và WebKit chạy component production tại 320/820/1366 px, cả hai loại thông báo không tràn ngang và nút truy cập được bằng Tab. Trên cả hai engine, service worker thật đã trả đúng asset cache (200) sau khi máy chủ chuyển asset đó sang 404. Đây là kiểm tra WebKit trên Windows, không phải Safari trên iPhone thật.
