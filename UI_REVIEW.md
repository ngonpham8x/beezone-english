# Rà soát giao diện đa thiết bị

Đợt kiểm tra bổ sung ngày 13/10/2026. Đã đọc bố cục của 18 phân hệ và 31 cửa sổ biểu mẫu/xác nhận, sửa mã responsive và kiểm tra hành vi tự động.

## Kích thước kiểm tra hành vi

| Nhóm | Kích thước viewport (px) | Hành vi đã kiểm tra tự động |
| --- | --- | --- |
| Điện thoại dọc | 320×568, 360×800, 390×844, 414×896 | Mở menu, khóa cuộn nền, chọn phân hệ và đóng menu, tìm kiếm Ctrl+K |
| Điện thoại ngang | 640×360 | Menu phủ và tìm kiếm trên màn hình hẹp |
| Máy tính bảng dọc | 768×1024, 820×1180 | Menu phủ để dành chiều rộng cho nội dung, điều hướng và tìm kiếm |
| Máy tính bảng ngang / laptop nhỏ | 1024×768 | Menu thu gọn, tìm kiếm trên thanh đầu trang |
| Laptop / desktop | 1280×800, 1440×900, 1920×1080 | Menu bên cạnh nội dung, điều hướng và tìm kiếm |

Đây là mô phỏng viewport trong **jsdom**, kiểm tra trạng thái React, focus và sự kiện. jsdom không dựng bố cục pixel; bảng trên không phải kết quả chụp ảnh hay kiểm tra thiết bị vật lý.

## Các thay đổi

- Cho phép phóng to trang; thêm vùng đệm an toàn cho màn hình có tai thỏ và thanh điều hướng.
- Điện thoại và tablet dưới 1024 px dùng menu mở phủ. Menu tự đóng khi chọn trang; Tab giữ focus trong menu, Esc đóng và trả focus. Khi đổi sang bố cục desktop, khóa cuộn được gỡ bỏ.
- Menu desktop dùng chiều cao thanh đầu trang đo thực tế, thay giá trị cố định 52 px. Laptop nhỏ mặc định thu gọn menu.
- Giới hạn chiều rộng tên tài khoản/slogan; thu gọn logo ở 320 px; tìm kiếm trên tablet dùng ô mở riêng.
- Bổ sung lối vào quản lý tài khoản/phân quyền từ cửa sổ tài khoản của Chủ trung tâm trên điện thoại.
- Danh sách học viên, tuyển sinh, điểm danh, điểm số tự chọn dạng thẻ dưới 768 px và thay đổi theo kích thước cho đến khi người dùng chọn kiểu xem. Lựa chọn của người dùng được giữ khi xoay màn hình.
- Thời khóa biểu mặc định xem theo ngày trên điện thoại; lịch giáo viên mặc định ngày hiện tại.
- Số cột của các thẻ học viên, giáo viên, lớp, phòng và chương trình theo chiều rộng nội dung, có tính đến menu. Điều chỉnh thẻ tổng quan/học phí và chú giải biểu đồ để tránh chèn số tiền vào biểu tượng.
- Giảm số cột cố định trong bảng trên màn hình nhỏ; giữ các bảng rộng trong vùng cuộn ngang.
- Chuẩn hóa 31 dialog bằng `DialogFrame`: giới hạn theo viewport động/bàn phím, cuộn riêng, khóa nền, giữ focus, Esc đóng, trả focus sau khi đóng. Dialog lồng nhau chỉ đóng cửa sổ trên cùng.
- Biểu mẫu nhiều cột chuyển về một cột ở màn hình nhỏ; chỉnh tạo phòng nhanh và nhập ca học; thanh nút kiểm tra dữ liệu/nhật ký/lịch được xuống dòng khi cần.
- Rút gọn thanh nút in/chia sẻ báo điểm; chỉnh tab chia sẻ và khoảng đệm trong cửa sổ PWA.
- Nút và ô nhập trên thiết bị dưới 1024 px có chiều cao tối thiểu 44 px; chữ nhập 16 px. Giữ hỗ trợ giảm chuyển động và focus bàn phím.

## Kiểm tra bổ sung

`tests/responsive.test.tsx` kiểm tra 11 viewport, xoay/đổi kích thước, lựa chọn dạng thẻ/bảng, màn hình điểm số thực, dialog trong StrictMode, dialog lồng nhau, viewport thu nhỏ khi mở bàn phím, truy cập phân quyền trên điện thoại và hủy xóa phiếu thu bằng Esc. Các kiểm tra phân hệ, xác thực và nghiệp vụ cũ được chạy lại bằng `npm run check`.

Kết quả mới nhất: TypeScript qua; **88 test / 10 tệp qua** (19 test responsive và 6 test cuộn ngang); Vite production build qua; kiểm tra bundle production không chứa xác thực xem thử qua. ExcelJS vẫn có cảnh báo kích thước chunk lớn như đợt rà soát trước.

## Bổ sung: lịch cuối tuần và thanh cuộn ngang

Theo ảnh người dùng cung cấp, bảng lịch có tổng chiều rộng cột lớn hơn vùng nội dung; thanh cuộn ở cuối bảng dài và nút cuối tuần chỉ dịch thêm 350 px.

- Bảng thời khóa biểu theo tuần dùng bố cục cột cố định, chiều rộng tối thiểu 980 px và cột giờ 128 px. Các cột ngày chia đều phần còn lại để có thể hiện cả tuần trên vùng nội dung của laptop thông thường; màn hình hẹp vẫn cuộn ngang.
- “Thứ 7 & CN” đi thẳng tới vị trí cuối cùng (`scrollWidth - clientWidth`); “Đầu tuần” quay về đầu bảng. Áp dụng cả lịch giáo viên. Các nút chọn ngày xuống dòng thay vì giấu cuối tuần.
- Thanh cuộn ngang đặt cao 20 px, bỏ chế độ `thin`. Với Chromium/WebKit, đặt lại màu chuẩn về `auto` để quy tắc thanh cuộn 20 px có hiệu lực; thuộc tính màu/chiều rộng chuẩn có thể ghi đè kiểu WebKit. Tham khảo [MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::-webkit-scrollbar).
- 14 vùng bảng có thêm thanh kéo phía trên khi bị tràn ngang, tay kéo 30×28 px và nút 44×44 px. Không cần xuống cuối bảng để xem cột bên phải. Thanh trên đồng bộ với cuộn gốc, nút cuộn hiện có và thay đổi kích thước màn hình; hỗ trợ Home/End khi focus vùng bảng. Điều khiển phụ được ẩn khi in.
- Sáu test bổ sung kiểm tra kéo thanh trên, đồng bộ cuộn, đổi kích thước, phím Home/End không ảnh hưởng ô nhập, hiện đủ bảy tiêu đề ngày và nhảy đúng tới cuối tuần ở hai trang lịch.

Kiểm tra mới dùng kích thước vùng cuộn giả lập trong jsdom; chưa xác nhận ảnh kết quả trên Cốc Cốc/Chrome thật vì trình duyệt chưa kết nối.

## Giới hạn cần xác nhận trực quan

Công cụ trình duyệt trả về danh sách kết nối trống (`apps: [], browsers: []`). Chưa thể chụp ảnh, đo tràn ngang bằng trình duyệt thật hoặc xác nhận Chrome/Safari/iOS/Android. Bản in A4, ảnh xuất/chia sẻ và PWA ở chế độ độc lập cũng cần kiểm tra trên trình duyệt/thiết bị thật. Không có cam kết rằng mọi thiết bị và mọi mức zoom đã được kiểm tra trực quan.
