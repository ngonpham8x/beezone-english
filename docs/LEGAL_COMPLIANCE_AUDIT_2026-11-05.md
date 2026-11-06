# Rà soát tuân thủ BeeZone — 05/11/2026

> Đây là bản lưu lịch sử của lần rà soát ngày 05/11. Kết quả cập nhật sau khi đối chiếu lại repo và bổ sung hồ sơ đồng ý phụ huynh nằm tại `LEGAL_COMPLIANCE_AUDIT_2026-11-06.md`.

> Báo cáo kỹ thuật sơ bộ, không phải ý kiến pháp lý và không chứng nhận hệ thống “tuân thủ 100%”. Chủ trung tâm cần đối chiếu hoạt động thực tế và nhờ chuyên gia pháp lý xác nhận các hồ sơ bắt buộc.

## Phạm vi và phương pháp

- Đối chiếu mã nguồn với `vn-law-check` của `mhfed` tại bản đang công khai ngày 05/11/2026.
- Quét mã ứng dụng, sau đó kiểm tra thủ công để loại kết quả giả do workflow GitHub/Vercel.
- Đọc luồng đăng nhập, phân quyền, dữ liệu học viên/phụ huynh, điểm danh, điểm số, học phí, sao lưu, liên hệ phụ huynh và các nhà cung cấp bên ngoài.
- Không kiểm tra hợp đồng thực tế, hồ sơ thuế/kế toán, văn bản đồng ý giấy, cấu hình tài khoản Supabase/Vercel/Google/Resend hoặc việc nhân viên sử dụng dữ liệu ngoài ứng dụng.

## Phân loại hệ thống

BeeZone là hệ thống quản trị nội bộ có đăng nhập, xử lý dữ liệu học viên nhỏ tuổi, phụ huynh, nhân sự, học tập và tài chính. Đây không phải cửa hàng trực tuyến công khai: mã nguồn không có giỏ hàng, cổng thanh toán hay luồng đặt mua công khai. Từ khóa “thanh toán” là nghiệp vụ ghi nhận phiếu thu nội bộ, nên không tự động kết luận đây là website thương mại điện tử.

## Kết quả

| Mức | Vấn đề | Tình trạng sau lần sửa này |
| --- | --- | --- |
| 🔴 | Không có thông báo quyền riêng tư và xác nhận rõ trước khi tài khoản truy cập dữ liệu | Đã thêm chính sách, xác nhận trước OAuth và bản ghi đồng ý/thu hồi có thời gian máy chủ trong migration 033. Dữ liệu trung tâm không được tải trước khi có bản ghi hiện hành. |
| 🔴 | Sao lưu đầy đủ học viên, phụ huynh, học phí và Giao việc bị ép gửi qua Resend/email | Đã chuyển sang chủ động bật. Cờ `autoBackup` cũ không còn được coi là phê duyệt; địa chỉ nhận phải khớp địa chỉ đã xác nhận. |
| 🟢 | Mọi tài khoản đang hoạt động có thể đọc toàn bộ tài liệu JSON `center_data` ở tầng cơ sở dữ liệu | Migration 034 thu hồi quyền đọc/ghi trực tiếp, bỏ `center_data` khỏi Realtime và chuyển sang RPC có kiểm tra consent + phạm vi vai trò. Giáo viên chỉ nhận lớp được gán; Đào tạo không nhận học phí, nhật ký hay thông tin liên hệ học viên; Chủ trung tâm/Hành chính giữ phạm vi quản trị. CAS và các trigger quyền/validation cũ vẫn là lớp bảo vệ khi lưu. |
| 🟡 | Dữ liệu trẻ em có thể được nhập từ Excel nhưng chưa có trường chứng minh đồng ý của phụ huynh/người đại diện | Cần đối chiếu hồ sơ giấy/điện tử thực tế và bổ sung quy trình hoặc trường theo dõi riêng trước khi coi là hoàn tất. Đồng ý của nhân viên đăng nhập không thay thế đồng ý của phụ huynh/học viên. |
| 🟡 | Google, Supabase, Vercel và có thể Resend xử lý dữ liệu trên hạ tầng bên ngoài Việt Nam | Chính sách đã công khai nhà cung cấp; chủ trung tâm vẫn phải lập/duy trì hồ sơ đánh giá xử lý và chuyển dữ liệu theo yêu cầu áp dụng, kiểm tra khu vực lưu trữ và hợp đồng nhà cung cấp. |
| 🟡 | Chưa có lịch lưu giữ cụ thể cho từng nhóm hồ sơ và chưa có màn hình xử lý yêu cầu truy cập/xóa | Đã có quy trình vận hành tối thiểu trong `docs/PRIVACY_OPERATIONS.md`; cần chủ trung tâm chốt thời hạn theo nghĩa vụ giáo dục, kế toán và tranh chấp trước khi áp dụng. |
| 🟡 | Chưa có bằng chứng diễn tập ứng phó sự cố và phân công người báo cáo | Đã thêm runbook; cần điền người phụ trách, đầu mối pháp lý và diễn tập. |
| 🟢 | Không phát hiện Google Analytics, Meta/TikTok Pixel, SDK quảng cáo hoặc chatbot AI trong mã chạy | Không cần banner cookie quảng cáo ở trạng thái hiện tại. Phải rà soát lại nếu thêm tracking/AI/ads. |
| 🟢 | Có Google Auth, profile máy chủ, RLS, kiểm tra quyền ghi, quota, CSP, kiểm tra payload, CAS và nhật ký | Giữ nguyên; migration 034 bổ sung phạm vi đọc ở máy chủ và đồng bộ bằng snapshot đã lọc. |
| ⚪ | Quảng cáo, sàn/marketplace, AI và ứng dụng mobile native | Không áp dụng với phạm vi mã hiện tại. |

## Thay đổi mã đã thực hiện

1. Chính sách quyền riêng tư có thể mở trước đăng nhập và trong cửa sổ tài khoản.
2. Checkbox không tích sẵn; nút Google chỉ hoạt động sau xác nhận rõ.
3. Migration `033_privacy_consents.sql` lưu phiên bản chính sách, mục đích, thời gian đồng ý/thu hồi theo thời gian máy chủ và RLS theo đúng tài khoản.
4. Tài khoản thiếu hoặc đã rút đồng ý không tải `center_data`; người dùng có thể rút đồng ý và đăng xuất.
5. Sao lưu email mặc định tắt, có mô tả chính xác loại dữ liệu và nhà cung cấp. Máy chủ bỏ qua cờ cũ nếu chưa có thời gian + địa chỉ phê duyệt.
6. Thu hồi truy cập trực tiếp `center_data`; snapshot đọc/lưu qua RPC theo vai trò, consent hiện hành và CAS. Đồng bộ nhiều máy chuyển sang tải snapshot đã lọc định kỳ, khi lấy lại mạng hoặc quay lại cửa sổ.
7. Bổ sung kiểm thử cho consent gate, RLS/RPC đồng ý, phạm vi dữ liệu giáo viên, lưu điểm theo lớp và chế độ sao lưu tắt.

## Việc bắt buộc trước khi triển khai

1. Sao lưu cơ sở dữ liệu, thử migration 033 rồi 034 trên môi trường thử trước khi áp dụng production. Không triển khai frontend mới trước cả hai migration vì đăng nhập sẽ dừng an toàn khi thiếu bảng/RPC.
2. Chủ trung tâm xác nhận tên pháp lý, địa chỉ, điện thoại, email trong chính sách và các nhà cung cấp đang dùng thực tế.
3. Giữ sao lưu email ở trạng thái tắt cho đến khi địa chỉ nhận, quyền truy cập hộp thư, thời hạn lưu và quy trình xóa đã được phê duyệt.
4. Sau khi áp dụng migration 034, thử riêng tài khoản Chủ trung tâm, Hành chính, Đào tạo và Giáo viên; xác nhận dữ liệu hiển thị/lưu đúng lớp và quyền trước khi mở lại cho toàn bộ nhân sự.
5. Kiểm kê căn cứ/đồng ý cho dữ liệu của từng học viên, nhất là trẻ em, dữ liệu hình ảnh và thông tin liên hệ phụ huynh.
6. Hoàn tất hồ sơ đánh giá tác động, chuyển dữ liệu ra nước ngoài, đầu mối tiếp nhận yêu cầu và ứng phó sự cố theo tư vấn pháp lý áp dụng cho trung tâm.

## Kết luận

Repo `vn-law-check` áp dụng tốt như checklist phát hiện sớm, nhưng không nên đóng gói vào bản production và không thể tự chứng nhận pháp lý. Lần sửa này xử lý ba rủi ro kỹ thuật trực tiếp (đồng ý trước truy cập, sao lưu email mặc định và phạm vi đọc `center_data`). BeeZone vẫn chưa nên được mô tả là “không vi phạm” cho đến khi migration được thử/áp dụng và các hồ sơ, căn cứ, thời hạn lưu, chuyển dữ liệu cùng quy trình ngoài mã nguồn được người có thẩm quyền xác nhận.
