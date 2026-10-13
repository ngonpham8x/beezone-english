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

Các kiểm tra viewport và cuộn nằm trong bộ kiểm thử toàn dự án. Kết quả mới nhất được ghi tại [PROJECT_REVIEW.md](PROJECT_REVIEW.md). ExcelJS vẫn có cảnh báo kích thước chunk lớn như đợt rà soát trước.

## Bổ sung: lịch cuối tuần và thanh cuộn ngang

Theo ảnh người dùng cung cấp, bảng lịch có tổng chiều rộng cột lớn hơn vùng nội dung; thanh cuộn ở cuối bảng dài và nút cuối tuần chỉ dịch thêm 350 px.

- Bảng thời khóa biểu theo tuần dùng bố cục cột cố định, chiều rộng tối thiểu 980 px và cột giờ 128 px. Các cột ngày chia đều phần còn lại để có thể hiện cả tuần trên vùng nội dung của laptop thông thường; màn hình hẹp vẫn cuộn ngang.
- “Thứ 7 & CN” đi thẳng tới vị trí cuối cùng (`scrollWidth - clientWidth`); “Đầu tuần” quay về đầu bảng. Áp dụng cả lịch giáo viên. Các nút chọn ngày xuống dòng thay vì giấu cuối tuần.
- Các bảng rộng có thanh kéo phía trên khi bị tràn ngang. Thanh trên đồng bộ với cuộn gốc và thay đổi kích thước màn hình; hỗ trợ Home/End khi focus vùng bảng. Điều khiển phụ được ẩn khi in.
- Sáu test bổ sung kiểm tra kéo thanh trên, đồng bộ cuộn, đổi kích thước, phím Home/End không ảnh hưởng ô nhập, hiện đủ bảy tiêu đề ngày và nhảy đúng tới cuối tuần ở hai trang lịch.

Kiểm tra mới dùng kích thước vùng cuộn giả lập trong jsdom; chưa xác nhận ảnh kết quả trên Cốc Cốc/Chrome thật vì trình duyệt chưa kết nối.

## Bổ sung: bố cục gọn ở zoom 100%

Theo ảnh màn hình học phí ở mức 100%, breakpoint 1100 px của vùng nội dung khiến laptop vẫn có hai cột thống kê. Quy tắc CSS xếp biểu tượng thành hàng riêng làm các thẻ cao hơn cần thiết.

- Dùng `StatCard` chung ở Học phí, Tổng quan, Học viên, Tuyển sinh và Báo cáo. Nhãn/biểu tượng nằm cùng dòng, số liệu dùng chữ 20 px trên desktop, khoảng đệm 12 px và viền nhẹ.
- Thống kê học phí gồm cả thu theo buổi trong một nhóm: hai cột ở màn hình hẹp, bốn cột từ chiều rộng nội dung 700 px, năm cột từ 950 px. Không phụ thuộc chiều rộng của toàn cửa sổ nên việc thu gọn/mở menu được tính đến.
- Giảm khoảng đệm nội dung desktop từ 24 xuống 16 px và khoảng cách giữa các phần về 16 px tại các màn hình danh sách. Phần nhắc hạn thanh toán học phí mở khi chọn; các biểu mẫu và luồng thu tiền vẫn hoạt động.
- Bộ lọc học phí xếp cùng một hàng khi vùng nội dung đủ 950 px; ô tìm kiếm chiếm hai phần chiều rộng. Màn hình hẹp tự xuống dòng để giữ ô nhập dễ dùng.
- Thanh kéo ngang dùng màu xám, đường ray 4 px và tay kéo có vùng tương tác 28×20 px. Nút 28 px trên desktop; giữ vùng bấm 44 px trên màn hình nhỏ/thiết bị cảm ứng. Chromium/WebKit chỉ dùng thanh kéo chung cho trục ngang; thanh cuộn dọc vẫn có thể sử dụng. Trình duyệt khác có thanh cuộn gốc mảnh làm phương án tương thích.
- Bỏ bộ nút cuộn chung bị lặp ở Học phí, Học viên, Tuyển sinh, Điểm số và Điểm danh. Giữ nút nhảy Đầu tuần/Thứ 7 & CN ở hai trang lịch.

Có thêm kiểm thử mở nhóm nhắc hạn đang thu gọn rồi sửa đúng phiếu. Các kiểm thử cuộn, bàn phím, đổi kích thước và nghiệp vụ được chạy lại. Công cụ giao diện vẫn trả danh sách trình duyệt trống; ảnh người dùng là căn cứ bố cục, chưa có ảnh kết quả dựng bằng trình duyệt thật.

## Giới hạn cần xác nhận trực quan

Công cụ trình duyệt trả về danh sách kết nối trống (`apps: [], browsers: []`). Chưa thể chụp ảnh, đo tràn ngang bằng trình duyệt thật hoặc xác nhận Chrome/Safari/iOS/Android. Bản in A4, ảnh xuất/chia sẻ và PWA ở chế độ độc lập cũng cần kiểm tra trên trình duyệt/thiết bị thật. Không có cam kết rằng mọi thiết bị và mọi mức zoom đã được kiểm tra trực quan.

## Bổ sung: thứ tự Tổng quan và bố cục từng nhóm mục

- Đưa khung chào mừng lên trước **Việc cần làm hôm nay** theo ảnh đánh dấu. Bỏ nút **Thu học phí** màu xanh trong khung công việc; giữ lối vào học phí ở khung chào mừng.
- Khung chào mừng và công việc dùng khoảng đệm nhỏ hơn, dòng hành động tự xuống hàng. Thẻ công việc không bị kéo cao theo thẻ bên cạnh; lưới một/hai/bốn cột theo chiều rộng nội dung.
- Đưa thông báo xem thử vào header được đo chiều cao, để menu desktop tính cả dòng thông báo khi xác định vùng cuộn. Giữ nguyên cảnh báo dữ liệu chỉ lưu trên trình duyệt; có kiểm thử slot thông báo và cập nhật chiều cao khi resize.
- Dùng tiêu đề trang chung ở 11 màn hình danh sách/lịch, tự xuống dòng giữa tiêu đề và công cụ khi không đủ chỗ. Chữ tiêu đề 18 px, biểu tượng 20 px; ô nhập/nút trên màn hình nhỏ vẫn giữ kích thước thao tác.
- Lưới thẻ chương trình, lớp, giáo viên, phòng và các danh sách ở dạng thẻ dùng `auto-fill` theo chiều rộng nội dung. Thẻ thông thường tối thiểu 18 rem, phòng 15 rem; màn hình hẹp cho thẻ chiếm toàn bộ chiều rộng mà không vượt khung. Thống kê lớp/chương trình và phần thu học phí Tổng quan dùng thẻ gọn chung.
- Biểu đồ Tổng quan chuyển giữa một/hai/ba cột theo vùng nội dung; hai bảng chi tiết chỉ nằm cạnh nhau khi đủ chỗ. Nhãn số liệu và bộ lọc vẫn giữ nghiệp vụ hiện có. Thêm tên truy cập cho nút sửa/xóa phòng.

| Nhóm mục | Bố cục được rà trong mã |
| --- | --- |
| Tổng quan | Chào mừng → công việc → thống kê; biểu đồ/bảng theo chiều rộng nội dung |
| Học viên, Tuyển sinh, Điểm danh, Điểm số | Thẻ trên màn hình hẹp, bảng khi đủ rộng hoặc theo lựa chọn người dùng; công cụ xuống hàng |
| Chương trình, Lớp, Giáo viên, Phòng | Thẻ tự chia cột theo chỗ còn lại sau menu; tiêu đề và hành động gọn |
| Thời khóa biểu, Lịch giáo viên | Xem theo ngày trên điện thoại; lịch tuần và nút nhảy cuối tuần; cuộn dùng chung |
| Học phí, Báo cáo | Thống kê gọn; biểu mẫu theo viewport; bảng có cuộn riêng; nhắc hạn mở khi cần |
| Nhật ký, Kiểm tra dữ liệu | Bảng/cuộn và công cụ tự xuống dòng; giữ phân quyền và xác nhận nghiệp vụ |
| Tài khoản, Sao lưu, Cấu hình và các biểu mẫu | Dialog/vùng nội dung cuộn theo viewport, giữ focus và đóng bằng Esc |

`tests/navigation.test.tsx` chạy 18 mục × 3 chiều rộng 390/820/1366 px (54 trường hợp). `tests/dashboard-layout.test.tsx` kiểm tra thứ tự khung, nút học phí còn lại và thu gọn banner tại các kích thước 320/390/820/1024/1366 px. Toàn bộ **183 test / 15 tệp**, TypeScript và production build qua.

Đã thử truy cập trực tiếp `http://localhost:3000/?tab=dashboard`: HTTP và các module phục vụ bình thường. Công cụ UI vẫn không có browser kết nối; cả thao tác mở browser trong ứng dụng (`iab`) và Chrome đều trả **Browser is not available**. Các kết quả trên là kiểm tra mã/hành vi jsdom, chưa phải xác nhận bố cục pixel trên thiết bị thật.

## Bộ lọc tuyển sinh — 14/10/2026

Ảnh phản hồi cho thấy ô chương trình giãn theo tên lựa chọn dài, vượt khung bộ lọc và làm trang cuộn ngang. Đã tách `AdmissionsFilters` trong module Tuyển sinh và thay nhóm flex có chiều rộng nội tại bằng grid với `minmax(0, ...)`; các wrapper và control có `min-width: 0`, control rộng 100% khung.

- Vùng nội dung dưới 560 px: tìm kiếm, giai đoạn và chương trình xếp dọc, cùng chiều rộng/cao 44 px.
- Từ 560 px: tìm kiếm chiếm một hàng; hai bộ chọn nằm ở hàng tiếp theo.
- Từ 850 px: ba ô cùng một hàng. Bố cục theo vùng nội dung còn lại, gồm trường hợp tab nằm cạnh chat hoặc menu đang mở.
- Tên chương trình dài được thu gọn trong ô đóng; danh sách lựa chọn và tooltip giữ tên đầy đủ. Icon không nhận click; control native giữ thao tác bàn phím và có nhãn đọc rõ ràng.

`tests/admissions-filters.test.tsx` kiểm tra kết hợp bộ lọc ở 320/480/820/1366 px, giữ lựa chọn khi đổi dạng bảng/thẻ, thứ tự focus và tên chương trình dài. Có 5 trường hợp mới; jsdom kiểm tra hành vi, không đo pixel. Browser của phiên công cụ vẫn không cung cấp tab sau khi người dùng chia sẻ/chọn Browser, nên chưa xác nhận ảnh dựng sau sửa trực tiếp.

`npm run check` qua toàn bộ: **200 test / 18 tệp**, TypeScript và build production. Localhost phục vụ module bộ lọc mới và CSS grid với HTTP 200. Giữ nguyên dữ liệu và nghiệp vụ tuyển sinh.
