# Rà soát BeeZone — 16/10/2026

Phạm vi gồm mã nguồn, ranh giới module, xác thực và đồng bộ, học phí theo buổi, kiểm thử nghiệp vụ/giao diện, dependency và kiểm tra HTTP local/Vercel. Không thay đổi database production, quyền tài khoản hoặc lịch sử dữ liệu trong lần rà soát này.

## Lỗi đã tái hiện và sửa

1. **Mất thay đổi chưa lưu sau lỗi kiểm tra quyền.** Khi refresh token gặp lỗi mạng lúc đọc profile, bấm Thử lại trước đây có thể tải payload cũ từ máy chủ đè lên bản đang sửa. `useCenterConnection` hiện giữ dấu vết dữ liệu đã tải theo tài khoản qua lần thử lại, kiểm tra lại profile trước khi tiếp tục và nối lại hàng đợi với revision CAS đang có. Hồ sơ bị khóa vẫn bị chặn; lần tải đầu thất bại vẫn tải lại từ máy chủ.
2. **Phản hồi đăng nhập cũ ghi đè phiên đang hoạt động.** `getSession` ban đầu có thể bị reject sau khi một sự kiện Auth mới đã mở workspace. Nhánh bắt lỗi hiện bỏ qua kết quả cũ giống nhánh thành công.

Hai tình huống đều làm kiểm thử mới thất bại trên mã cũ. Kiểm thử xác nhận sửa đúng lỗi, tiếp tục lưu bản sửa, không đọc lại payload khi refresh cùng tài khoản, và vẫn chặn profile bị khóa.

Các sửa đăng nhập local trước đó được giữ: chuyển sang loopback đã cấu hình trước OAuth, dùng PKCE cùng origin và yêu cầu Google hiện bước chọn tài khoản khi bấm đăng nhập. Workspace đang hoạt động không tự đổi địa chỉ.

## Kết quả kiểm tra trực tiếp

- Lượt `npm run check` cuối đã qua: TypeScript, **382 kiểm thử / 29 tệp**, production build và kiểm tra bundle/CSP. Trong đó có **108 tình huống mở 18 mục menu** ở 320, 390, 480, 820, 1024 và 1366 px, cùng các kiểm thử responsive/bàn phím khác. Lượt đầu bị timeout bước biên dịch module của nhóm điều hướng; tăng ngân sách riêng bước chuẩn bị từ 60 lên 120 giây, giữ nguyên giới hạn 10 giây cho từng kiểm tra điều hướng và chạy lại toàn bộ thành công.
- `npm audit`: 0 lỗ hổng đã biết tại thời điểm kiểm tra.
- Local: HTML, Vite client và module chính trả 200; API quản trị chưa xác thực trả 401. Các request module ban đầu từng timeout; lần kiểm tra lại sau đó tải được, nên cần giữ kiểm tra cả JavaScript/API thay vì chỉ HTML khi chẩn đoán trang trắng.
- File giả không chứa dữ liệu riêng trong `.env.*` và `.vercel` đều bị Vite chặn 403 qua đường dẫn thường và `/@fs`. Các file giả được xóa sau kiểm tra.
- Domain Vercel chính trả 200, có CSP chặn script inline và header chống nhúng trang. Hai API quản trị trả 401 khi không có token. Đây là kiểm tra bản production hiện có, không phải xác nhận các thay đổi local đã được deploy.
- Supabase public Auth settings trả 200, Google provider bật. Các truy vấn không yêu cầu bản ghi (`limit=0`) xác nhận `profiles` và `center_data` trả 200; `account_audit_logs` từ chối người chưa đăng nhập bằng 401. Không đọc hồ sơ hoặc dữ liệu trung tâm riêng để kiểm tra.

## Giới hạn cần giữ rõ

- Kiểm thử responsive/bàn phím dùng jsdom không xác nhận bố cục pixel trên thiết bị thật. Chưa có công cụ trình duyệt kết nối để kiểm tra trực quan từng mục menu hoặc hoàn tất đăng nhập Google bằng tài khoản của người dùng.
- `center_data` vẫn là tài liệu chung mà các tài khoản đang hoạt động có thể đọc. Phân quyền menu và kiểm tra ghi không cách ly quyền đọc theo lớp hoặc học phí. Cần tách bảng với read RLS hoặc bổ sung API đọc có lọc trước khi cấp tài khoản cho người không được phép đọc toàn bộ dữ liệu. Xem `SECURITY.md`.
- Kết quả HTTP/kiểm thử không xác nhận cấu hình WAF, MFA, quota thực tế hoặc khả năng chống mọi bot/DDoS. Không chạy thử tải production và không tự chạy migration.

Đọc `ARCHITECTURE.md` trước khi bổ sung module; giữ nguyên khóa lưu trình duyệt, URL `?tab=`, định dạng sao lưu, lịch sử học phí và CAS.

---

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
- **`npm run check` đã qua toàn bộ ở lượt cuối**: kiểm tra kiểu, 274 test / 20 tệp và production build. TypeScript chỉ quét mã nguồn/config/test, bỏ qua `dist`; build tự kiểm tra bundle không chứa mã xác thực xem thử.
- Lượt kiểm tra giao diện đầu tiên có **88 test / 10 tệp**, trong đó điều hướng cả 18 phân hệ, 19 test responsive và 6 test cuộn ngang/cuối tuần. Test trong `tests/`: dữ liệu/sao lưu, tiền và ngày, xác thực, phiên làm mới, xung đột/lỗi lưu, API trả HTML, Excel xuất–nhập, quyền DB, điều hướng, menu/dialog/focus, thay đổi viewport và các điều khiển cuộn bảng. Xem [UI_REVIEW.md](UI_REVIEW.md) để biết phạm vi kiểm tra đa thiết bị.
- Các migration 001–006 được thực thi trên PostgreSQL cục bộ (PGlite). Kiểm tra RLS tài khoản khóa, quyền ghi, lớp được phân công, dữ liệu không hợp lệ, chủ cuối cùng và cập nhật snapshot cũ.
- Kiểm tra HTTP development: API chưa cấu hình trả lỗi JSON đúng, không trả danh sách giả hoặc báo thành công giả.
- `npm audit`: **0 lỗ hổng**, kiểm tra cả dependency phát triển theo lockfile.
- Build chia bundle chính từ khoảng 2.305 KB xuống khoảng 362 KB sau khi tách phân hệ và bổ sung xử lý responsive/dialog/cuộn ngang. ExcelJS vẫn có chunk lớn tải riêng khi dùng Excel; đây còn là giới hạn thư viện.

## Phần còn phải xác nhận trước khi vận hành

1. **Kết nối thật:** môi trường local chưa có cấu hình Supabase của trung tâm. Cần đặt biến môi trường, chạy migration 006 trên đúng project, cấu hình Google OAuth và thử owner/staff trên Vercel. Chưa có kiểm thử Google OAuth hoặc Vercel thật trong đợt này.
2. **Quyền đọc chi tiết:** `center_data` vẫn là một tài liệu chung mà mọi tài khoản active có thể đọc ở DB. Migration 006 bảo vệ ghi; việc ẩn công nợ hoặc giới hạn lớp trên giao diện chưa cách ly quyền đọc. Nếu cần tính riêng tư giữa nhân viên/giáo viên, cần tách bảng + read RLS hoặc API lọc dữ liệu; xem `SECURITY.md`.
3. **Giao diện thực tế:** môi trường không có trình duyệt kết nối. Đã kiểm tra DOM và điều hướng tự động, chưa xác nhận bố cục bằng ảnh trên Chrome/Safari/iPhone/Android, bản in A4, chia sẻ ảnh hoặc cài PWA thật.
4. **Dịch vụ tự động:** chưa có máy chủ/credential cho email, lịch backup hoặc Sheets. Các chức năng chưa được cấu hình được ghi rõ; không có thông báo hoạt động giả.
5. **Dữ liệu nhiều người sửa:** khi hai phiên cùng sửa, phiên sau phát hiện xung đột và giữ bản đang sửa để sao lưu. Chưa tự hợp nhất hai snapshot hay tự tải thay đổi của người khác trong lúc đang làm việc.
6. **Nhật ký và Auth:** hoạt động quản lý tài khoản còn dùng hoàn tác bù khi ghi audit thất bại, chưa có transaction nguyên tử bao phủ cả Supabase Auth và DB. Nhật ký nghiệp vụ trong document không phải nhật ký kiểm toán bất biến; nhật ký tài khoản riêng vẫn chỉ máy chủ được ghi.

Không có dữ liệu riêng tư hoặc khóa bí mật nào được đưa vào báo cáo này.

## Bổ sung vận hành trung tâm nhỏ

Đã thêm đợt học có ngày/số buổi/trạng thái, lịch sử đăng ký và thao tác học đợt tiếp; hạn học phí và nội dung nhắc phụ huynh; lịch nghỉ/đổi/học bù theo ngày; việc cần làm hôm nay mở đúng lớp/ngày hoặc phiếu. Điểm danh sử dụng lịch thực tế và lịch sử đăng ký theo ngày. JSON giữ dữ liệu mới; Excel có các trường ngày/số buổi/hạn thanh toán. Xem [SMALL_CENTER_GUIDE.md](SMALL_CENTER_GUIDE.md).

Đã bổ sung học phí theo buổi: cấu hình giá/ngày áp dụng theo lớp, lưu giá và quy tắc khi điểm danh, thu một hoặc nhiều buổi, thu từng phần, phiếu có ngày học/đơn giá, công nợ gồm buổi chưa lập phiếu. Mặc định chỉ có mặt/đi trễ tính phí theo lựa chọn của trung tâm. Giá cũ giữ nguyên khi thay cấu hình; điểm danh trước khi bật tính phí không tự phát sinh khoản thu. Excel giữ nguồn điểm danh và chi tiết phiếu, JSON giữ toàn bộ lịch sử.

Lượt kiểm tra trước refactor: **183 test / 15 tệp**, TypeScript và production build đều qua bằng `npm run check`. Bao gồm migration 001–008 trong PostgreSQL cục bộ; quyền giáo viên/thu ngân, giá lịch sử, người học đúng lớp/ngày, tham chiếu phiếu, khoản thu, tính phí trùng, client cũ, quy tắc vắng, công nợ/doanh thu, luồng thu theo buổi và Excel/JSON. Điều hướng 18 mục được kiểm tra ở 390/820/1366 px; có kiểm tra thứ tự khung Tổng quan, bỏ nút học phí lặp và chiều cao header gồm thông báo xem thử. Bundle chính khoảng 381 KB, Excel tải riêng khoảng 940 KB.

Theo phản hồi giao diện ở zoom 100%, đã dùng thẻ thống kê gọn chung cho Học phí, Tổng quan, Học viên, Tuyển sinh và Báo cáo; điều chỉnh số cột theo chiều rộng nội dung, bộ lọc học phí cùng hàng khi đủ chỗ, giảm khoảng đệm và bỏ bộ nút cuộn lặp. Thanh cuộn xám nhẹ vẫn hỗ trợ kéo, nút điều hướng, bàn phím và vùng bấm lớn trên thiết bị cảm ứng. Nhóm nhắc hạn học phí mở khi cần; đã kiểm thử mở nhóm rồi sửa phiếu. Chi tiết: [UI_REVIEW.md](UI_REVIEW.md).

Đã đổi vị trí khung chào mừng/công việc theo ảnh, xóa nút thu học phí xanh bị lặp, thống nhất tiêu đề trang, lưới thẻ, biểu đồ và bảng theo vùng nội dung. Thông báo xem thử nằm trong chiều cao header được đo để menu không tính thiếu dòng này. Kiểm tra link localhost trả HTTP 200; việc mở browser qua công cụ UI không thực hiện được vì browser chưa kết nối. Chưa xác nhận trực quan từng thiết bị.

Không có trình duyệt kết nối để xác minh ảnh giao diện. Chưa áp dụng migration 006/007/008 lên Supabase thật và chưa kiểm thử đăng nhập Google bằng tài khoản thật. Vercel Production vẫn thiếu secret key máy chủ; domain chính chỉ chuyển khi các điều kiện này được xác nhận. Kiến trúc quyền đọc tài liệu chung vẫn cần xử lý như phần giới hạn nêu trên. Trạng thái triển khai hiện tại xem [DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md).

## Refactor module và kiểm tra cập nhật

`App.tsx` giảm từ 1.713 xuống 163 dòng, chỉ ghép bộ điều khiển và khung giao diện. Màn hình và thao tác nghiệp vụ nằm trong `src/modules` theo từng phần; `src/app` ghép trang/dialog và dùng chung quy tắc quyền điều hướng. Hồ sơ học viên và bản in phiếu thu được tách khỏi màn hình lớn. Dịch vụ Excel giữ API công khai 11 dòng và chia phần xử lý thành các bước nhập, công thức, định dạng và từng sheet xuất.

Tải cloud, nhập Excel và khôi phục JSON dùng chung chuẩn hóa quan hệ dữ liệu. Công nợ, roster và phân công giáo viên dùng chỉ mục theo ID để giảm các lượt quét lặp; không thay chính sách tính phí hoặc xóa lịch sử. Tất cả khóa trình duyệt, URL, định dạng sao lưu, API và migration được giữ tương thích. Không thay schema hoặc dữ liệu production trong lần refactor.

Kiểm tra mới nhất: **195 test / 17 tệp**, TypeScript và build production qua. Bổ sung kiểm tra vòng phụ thuộc và hướng phụ thuộc module; kiểm thử thao tác với store gồm chuyển lớp, đổi giáo viên, công nợ buổi chưa thu, chống lập phiếu hai lần/sửa đơn giá đã thu, khôi phục JSON cũ, chặn nhập thay thế mất lịch sử, quyền thu tiền và lỗi lưu trình duyệt. GitHub Actions chạy cùng bộ kiểm tra khi push/PR. Hướng dẫn bổ sung chức năng: [ARCHITECTURE.md](ARCHITECTURE.md).

Nhật ký và công cụ kiểm tra dữ liệu được tải khi mở mục tương ứng. Bundle chính sau refactor khoảng **364 KB** (trước đó 381 KB); thư viện Excel khoảng 940 KB vẫn tải riêng khi cần. Dev server ở `localhost:3000` trả HTTP 200 cho trang và các module Học viên/Học phí sau khi đổi cấu trúc.

## Rà lại ranh giới module — 14/10/2026

Đã kiểm tra 15 thư mục module, 10 nhóm `actions.ts`, điểm ghép `App`/`createCenterActions`, store/đồng bộ, quy tắc dùng chung, dịch vụ Excel và API máy chủ. Dữ liệu trung tâm tiếp tục do `useCenterStore` sở hữu; các module thao tác trên những phần state được khai báo qua `Context`. Tuyển sinh dùng các thao tác ghi danh/học viên chung để giữ cùng lịch sử; các màn hình chỉ đọc không cần có thêm một bản `actions.ts`.

Phát hiện bộ kiểm tra kiến trúc cũ chưa theo alias và phụ thuộc gián tiếp, đồng thời bỏ sót import React trực tiếp trong tệp `.ts`. Helper debug `src/lib/reloadDebugger.ts` chứa hook React và các thao tác chặn reload cũ; không có import hoặc nơi gọi trong dự án. Đã bỏ tệp không dùng này và nâng kiểm tra kiến trúc để không đưa UI/hook vào lớp quy tắc ở các lần cập nhật sau.

Kiểm tra mới quét cả frontend và API/server, theo resolver TypeScript, bỏ qua type-only imports/re-exports, theo lazy import và `require` dạng literal. Có 13 ca kiến trúc: 5 kiểm tra dự án thực và 8 ca giả lập lỗi/đường dẫn/type để chứng minh guard bắt được lỗi. Không phát hiện vòng phụ thuộc runtime hoặc vi phạm ranh giới trong mã còn lại.

Đã rà lại luồng tải dữ liệu có `parseCenterData`, import/khôi phục có validation tại luồng nhập, refresh phiên không thay bản đang sửa và lưu cloud có đối chiếu `updated_at`. Test luồng liên module giữ điểm/phiếu thu cũ khi chuyển lớp, giữ đơn giá buổi đã lập phiếu, tránh thu trùng, đọc sao lưu cũ và kiểm tra quyền. Toàn bộ **274 test / 20 tệp**, TypeScript và production build qua.

Hướng dẫn cập nhật có bảng nơi sửa–phần ảnh hưởng–nhóm test trong [ARCHITECTURE.md](ARCHITECTURE.md). Một số form Học viên, Tuyển sinh, Học phí và phiếu điểm vẫn lớn; đã ở đúng module, nên khi thêm luồng mới cần tách form/hook theo trách nhiệm. Việc chia module và kiểm thử giúp phát hiện lỗi lan sang phần khác, không bảo đảm mọi chức năng bổ sung tương lai sẽ không có lỗi. Lượt này không đổi schema, khóa lưu trình duyệt, URL, định dạng sao lưu hoặc chạy migration production.

## Bảo mật, debug, spam và bot — 14/10/2026

Giới hạn API cũ chỉ áp dụng sau xác thực cho POST/PATCH và giữ trong bộ nhớ từng process; GET tài khoản/nhật ký chưa có giới hạn. Đã ghép kiểm tra API vào `server/admin.ts`, loại mã xác thực/origin trùng giữa hai endpoint, kiểm tra nguồn từ cấu hình thay vì Host của người gọi, kiểm tra định dạng JWT trước khi gọi Supabase, giới hạn JSON theo byte UTF-8 và chặn kiểu nội dung/encoding sai. Mỗi thao tác vẫn xác thực phiên thật và hồ sơ owner đang hoạt động; lỗi SDK không trả token/stack/SQL. Có timeout cho truy vấn, không tự gửi lại thao tác sửa tài khoản khi chưa rõ kết quả.

Migration `009_request_quotas.sql` tạo bộ đếm riêng được bảo vệ, cập nhật nguyên tử theo tài khoản/phạm vi. API đọc và ghi dùng quota chung giữa máy chủ; trigger giới hạn ghi trực tiếp và kích thước tài liệu trước kiểm tra nghiệp vụ. Test kiểm tra quyền gọi RPC, nhiều lần gọi, hết hạn, từng tài khoản, giới hạn ghi, CAS và giữ revision khi bị từ chối. Mã đồng bộ giữ bản đang nhập khi gặp quota, không retry liên tục hoặc tải dữ liệu ghi đè. Không đổi schema payload, khóa trình duyệt, giá buổi hoặc lịch sử giao dịch.

Đã xuất bản trực tiếp quy tắc WAF cho API quản trị trên Vercel: 60 yêu cầu/phút/IP, vượt ngưỡng 429; đọc lại cấu hình active xác nhận enabled. Không tạo tải thử trên production. Mã CSP đã bỏ script inline, build kiểm tra HTML tương thích, bỏ debugger và log ứng dụng production chỉ ghi mã sự kiện. CI kiểm tra dependency khi push/PR và mỗi tuần. `npm audit`: 0 lỗ hổng đã biết. **318 test / 22 tệp**, TypeScript và production build qua.

Production vẫn thiếu secret Supabase máy chủ theo kiểm tra tên biến Vercel ngày 14/10. Agent chưa áp dụng migration 009 hoặc các migration còn thiếu vào Supabase thật, chưa triển khai thủ công bản API mới hoặc chuyển domain. Quyền đọc dữ liệu trực tiếp vẫn cấp toàn bộ `center_data` cho tài khoản đang hoạt động; chưa có cách ly đọc theo lớp/tài chính. Đây là vấn đề cần giải quyết nếu nhân viên/giáo viên chỉ được xem một phần dữ liệu. Chi tiết phạm vi, ngưỡng và triển khai tại [SECURITY.md](SECURITY.md).

## Trang trắng localhost — 14/10/2026

Người dùng báo trang Tuyển sinh trắng. Kiểm tra HTTP thấy HTML trả 200 nhưng `/@vite/client`, `/src/main.tsx`, `/src/App.tsx` và module khác trả 504. Log Vite cho thấy nhiều lần khởi động lại đồng thời khi API/helper được sửa, sau đó báo cổng 3000 đã được dùng; tiến trình vẫn phục vụ HTML nhưng không còn tải được JavaScript.

Đã nạp API/helper bằng `server.ssrLoadModule` trong middleware phát triển, thay cho import vào cấu hình Vite. Thay đổi API được xử lý trong cache/graph SSR, tránh yêu cầu khởi động lại toàn bộ máy chủ. Đã dừng đúng tiến trình Vite của dự án và chạy lại ở cổng 3000. Trang Tuyển sinh và 133 module phụ thuộc trả 200; API chưa xác thực trả 401 JSON. Khi phát sinh thay đổi metadata helper, main/App vẫn trả 200 và API vẫn trả 401. Không xóa cache dữ liệu, localStorage hoặc lịch sử; không đổi cách chạy API trên Vercel. Người dùng tải lại trang và xác nhận đã hiển thị.
