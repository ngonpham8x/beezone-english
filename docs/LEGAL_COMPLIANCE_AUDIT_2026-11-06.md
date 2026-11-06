# Rà soát tuân thủ BeeZone — cập nhật 06/11/2026

> Đây là rà soát kỹ thuật theo mã nguồn và checklist, không phải ý kiến pháp lý, giấy chứng nhận hay cam kết “tuân thủ 100%”. Việc tuân thủ còn phụ thuộc hoạt động thật, hợp đồng nhà cung cấp, hồ sơ đồng ý/căn cứ xử lý, thời hạn lưu và cách nhân sự sử dụng dữ liệu.

## Kết quả đối chiếu `vn-law-check`

- Đã đối chiếu bản công khai mới nhất tại commit `c6391e04702a79c692592e1dbcfc720dfe3bb909` ngày 05/11/2026.
- Repo này phát hành phần mã/cấu trúc theo MIT nhưng chính README và DISCLAIMER xác định đây là công cụ hỗ trợ, không thay thế tư vấn luật sư và kết quả phải được kiểm tra thủ công.
- Quét thô nhận đúng BeeZone có đăng nhập và dùng hạ tầng nước ngoài. Cảnh báo “commerce” là dương tính giả: từ `checkout` trong GitHub Actions và chữ “thanh toán” trong tài liệu/QA. BeeZone không có giỏ hàng, cổng thanh toán hay quy trình đặt mua công khai; học phí là nghiệp vụ phiếu thu nội bộ.
- Phạm vi áp dụng thực tế: bảo vệ dữ liệu cá nhân/trẻ em, an toàn hệ thống, giao dịch điện tử nội bộ và nghĩa vụ lưu hồ sơ liên quan. Quảng cáo, marketplace, AI và mobile native không xuất hiện trong mã chạy hiện tại.

## Thay đổi kỹ thuật đã hoàn tất

| Hạng mục | Kết quả |
| --- | --- |
| Thông báo và đồng ý của tài khoản nhân sự | Chính sách mở được trước đăng nhập; checkbox không tích sẵn; migration 033 lưu đồng ý/rút lại bằng thời gian máy chủ; không tải dữ liệu trung tâm khi chưa có bản ghi hiện hành. |
| Phạm vi dữ liệu theo vai trò | Migration 034 chặn đọc/ghi trực tiếp tài liệu `center_data`, dùng RPC có consent, phạm vi vai trò và CAS. Giáo viên/Đào tạo không nhận thông tin liên hệ hoặc học phí ngoài quyền. |
| Sao lưu email chứa dữ liệu đầy đủ | Mặc định tắt; chỉ Chủ trung tâm chủ động bật với địa chỉ đã xác nhận. |
| Dữ liệu trẻ em/phụ huynh | Cấu trúc dữ liệu có trạng thái đã xác nhận/đã rút lại, ngày, hình thức, người đại diện và mã tham chiếu bằng chứng. Khối này được ẩn khỏi giao diện học viên theo yêu cầu vận hành; dữ liệu cũ vẫn đọc được và có thể đối soát qua Excel. Không lưu ảnh giấy tờ hoặc chữ ký trong trường này. Dữ liệu cũ/Excel không tự được đánh dấu là đã đồng ý. |
| Kiểm tra dữ liệu đồng ý | Trình duyệt, nhập Excel và migration 035 cùng kiểm tra ngày, trạng thái, hình thức, độ dài; bản xem của giáo viên/đào tạo bị loại trường này ở máy chủ. |
| Quyền của chủ thể dữ liệu | Chính sách nêu kênh tiếp nhận, bước xác minh và mốc xử lý nội bộ; quy trình vận hành giữ lịch sử quyết định, không xóa âm thầm học tập/tài chính. |
| Dữ liệu nhạy cảm | Chính sách nêu rõ hệ thống không được thiết kế để lưu bản chụp giấy tờ, chữ ký, sinh trắc học, sức khỏe, mật khẩu, số thẻ hoặc tài khoản ngân hàng. |
| Tracking/quảng cáo/AI | Không phát hiện analytics hành vi, pixel quảng cáo, SDK quảng cáo hoặc chatbot AI trong mã chạy. Không cần banner quảng cáo/cookie ở trạng thái hiện tại. |

## Việc mã nguồn không thể tự hoàn tất

| Việc phải có người phê duyệt | Trạng thái |
| --- | --- |
| Điền tên pháp lý, địa chỉ, email tiếp nhận và người phụ trách dữ liệu | Cần Chủ trung tâm xác nhận trong Cài đặt và bảng vận hành. |
| Xác minh bằng chứng thật của từng học viên | Trường theo dõi đã có nhưng bản Excel hiện tại không chứa bằng chứng; nhân sự phải đối chiếu giấy/email thực tế rồi cập nhật, không được tích hàng loạt theo suy đoán. |
| Lịch lưu giữ từng nhóm hồ sơ | Chưa được tự đặt bằng mã; cần chốt với kế toán/pháp lý và điền vào `PRIVACY_OPERATIONS.md`. |
| Đánh giá xử lý/chuyển dữ liệu qua Google, Supabase, Vercel, Resend | Cần kiểm tra hợp đồng, vùng lưu trữ và cấu hình tài khoản thực tế; việc chỉ liệt kê nhà cung cấp trong chính sách chưa đủ. |
| Hồ sơ đánh giá tác động, đầu mối báo cáo và diễn tập sự cố | Cần người có thẩm quyền lập, ký/phê duyệt và lưu bằng chứng ngoài Git. |
| Nghĩa vụ kế toán, giáo dục, thuế và bảo vệ người tiêu dùng cụ thể | Cần đối chiếu mô hình kinh doanh/hợp đồng thật; không suy ra chỉ từ mã nguồn. |

## Điều kiện phát hành phần cập nhật này

1. Sao lưu và thử migration `035_guardian_privacy_consent.sql` trên môi trường thử sau 034; không chạy lại bộ khởi tạo trên database đang dùng.
2. Kiểm tra Đào tạo/Giáo viên không nhận trường đồng ý trong snapshot bị che; giao diện học viên không hiển thị khối này cho bất kỳ cấp bậc nào.
3. Kiểm tra xuất rồi nhập lại Excel giữ nguyên hồ sơ đã ghi; dòng trống vẫn là “Chưa ghi nhận”, không tự chuyển thành “Đã xác nhận”. Việc cập nhật bằng chứng thực hiện trong quy trình hồ sơ/Excel được kiểm soát, không tích hàng loạt theo suy đoán.
4. Chính sách đổi sang phiên bản `2026-11-06.1`, vì vậy mọi tài khoản phải xác nhận lại sau phát hành.
5. Điền bảng thời hạn/người phụ trách và hoàn tất đánh giá nhà cung cấp trước khi tuyên bố hệ thống đã tuân thủ.

## Nguồn pháp lý/đối chiếu chính

- Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, hiệu lực 01/01/2026.
- Nghị định 356/2025/NĐ-CP, hiệu lực 01/01/2026.
- Nghị định 333/2026/NĐ-CP hướng dẫn Luật An ninh mạng, hiệu lực 19/08/2026.
- Repo `https://github.com/mhfed/vn-law-check` chỉ được dùng như checklist tham khảo; không đưa repo/script này vào bundle production và không coi kết quả quét là kết luận pháp lý.

## Kết luận

Có thể áp dụng cách rà soát của `vn-law-check` cho BeeZone, nhưng chỉ ở vai trò checklist. Các lỗ hổng kỹ thuật trực tiếp đã được giảm đáng kể; không thể trung thực kết luận “không vi phạm” cho tới khi migration 035 được áp dụng đúng thứ tự và các hồ sơ/quy trình ngoài mã ở trên được phê duyệt, thực hiện và lưu bằng chứng.
