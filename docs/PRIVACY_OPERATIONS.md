# Quy trình vận hành bảo vệ dữ liệu cá nhân

Tài liệu này là checklist vận hành tối thiểu. Chủ trung tâm phải điền người phụ trách và thời hạn lưu sau khi được tư vấn pháp lý/kế toán; không tự đoán thời hạn bằng mã nguồn.

## 1. Danh mục và người phụ trách

| Nhóm dữ liệu | Mục đích | Hệ thống/nhà cung cấp | Người được xem | Thời hạn đã phê duyệt |
| --- | --- | --- | --- | --- |
| Tài khoản nhân sự, quyền, nhật ký | Xác thực, phân quyền, an toàn | Google, Supabase, Vercel |  |  |
| Học viên/phụ huynh | Tuyển sinh, xếp lớp, liên hệ | Supabase, tệp Excel nhập |  |  |
| Điểm danh, nhận xét, điểm số | Dạy và đánh giá | Supabase |  |  |
| Học phí, phiếu thu | Thu phí, kế toán, đối soát | Supabase, bản xuất |  |  |
| Bản sao toàn hệ thống | Khôi phục sự cố | Supabase; Resend/email nếu bật |  |  |

Ghi rõ người chịu trách nhiệm chính, người thay thế, email tiếp nhận quyền dữ liệu và đầu mối pháp lý. Rà soát bảng này mỗi khi thêm trường dữ liệu, nhà cung cấp hoặc mục đích.

## 2. Trước khi nhập học viên

1. Xác nhận người cung cấp dữ liệu là phụ huynh/người giám hộ hoặc người được ủy quyền.
2. Cung cấp chính sách, giải thích mục đích, loại dữ liệu, người nhận, thời hạn và quyền rút lại.
3. Lưu bằng chứng phù hợp của phụ huynh/người đại diện; với dữ liệu/hành vi cần ý kiến của trẻ, thực hiện theo độ tuổi và quy định áp dụng.
4. Không nhập thông tin sức khỏe, hoàn cảnh gia đình hoặc dữ liệu nhạy cảm vào ghi chú nếu không thật sự cần và chưa có căn cứ/quy trình riêng.
5. Excel nguồn chứa dữ liệu thật không được đưa lên Git; sau nhập phải chuyển vào nơi lưu được kiểm soát và xóa bản tạm không còn cần thiết.
6. Khối đồng ý được ẩn khỏi giao diện học viên. Nếu trung tâm dùng các cột hồ sơ đồng ý trong tệp Excel quản trị, chỉ ghi **Đã xác nhận** sau khi đối chiếu bằng chứng thật; ghi người đại diện, ngày, hình thức và mã tham chiếu nơi lưu, không nhúng ảnh CCCD/chữ ký/giấy tờ. Nếu không có bằng chứng, để trống.
7. Khi nhận rút lại, cập nhật **Đã rút lại** trong sổ/Excel được kiểm soát, ghi ngày và chuyển ngay cho người phụ trách. Không tự xóa hồ sơ học tập/tài chính nếu còn nghĩa vụ lưu giữ; phải ghi quyết định và căn cứ xử lý.

## 3. Xử lý yêu cầu của chủ thể dữ liệu

1. Ghi số yêu cầu, thời gian nhận, người yêu cầu, học viên liên quan và phạm vi.
2. Xác minh danh tính và quyền đại diện qua kênh đã đăng ký; không gửi hồ sơ chỉ dựa trên email/số điện thoại mới cung cấp.
3. Khóa thay đổi không liên quan nếu cần bảo toàn bằng chứng; xuất đúng phạm vi, che dữ liệu của người khác.
4. Khi sửa/xóa, kiểm tra điểm danh, điểm số, đăng ký, phiếu thu, kế toán và nghĩa vụ lưu giữ. Không xóa lịch sử tài chính/học tập một cách âm thầm.
5. Trả lời bằng kênh an toàn, ghi quyết định, căn cứ từ chối/hạn chế nếu có và người phê duyệt.
6. Rút lại đồng ý tài khoản trong cửa sổ Tài khoản sẽ khóa lần truy cập tiếp theo; yêu cầu liên quan học viên vẫn phải xử lý theo quy trình riêng.

### Mốc theo dõi nội bộ

| Loại yêu cầu | Mốc thông thường | Người xử lý | Ngày hoàn tất |
| --- | --- | --- | --- |
| Ghi nhận và hướng dẫn xác minh | Tối đa 02 ngày làm việc |  |  |
| Truy cập/cung cấp/chỉnh sửa | 10 ngày |  |  |
| Rút lại/hạn chế/phản đối | 15 ngày |  |  |
| Xóa dữ liệu | 20 ngày |  |  |

Nếu có bên thứ ba, nghĩa vụ giữ hồ sơ hoặc căn cứ gia hạn hợp pháp, người phụ trách phải ghi lý do, mốc mới và thông báo cho người yêu cầu. Không dùng bảng này để tự bỏ qua thời hạn ngắn hơn nếu văn bản áp dụng quy định khác.

## 4. Sao lưu và chia sẻ

- Mặc định tắt sao lưu qua email. Chỉ Chủ trung tâm bật sau khi kiểm tra đúng địa chỉ nhận, MFA hộp thư, người truy cập, thời hạn lưu và quy trình xóa.
- Không chuyển tiếp tệp JSON/Excel qua nhóm chat cá nhân. Tệp xuất thủ công phải được mã hóa/lưu trong vùng được kiểm soát khi rời thiết bị.
- Trước khi mở Zalo/SMS/Facebook/Messenger, kiểm tra người nhận và chỉ gửi nội dung cần thiết. Nhật ký “đã mở/đã sao chép” không phải bằng chứng bên kia đã nhận.
- Thu hồi tài khoản ngay khi nhân sự nghỉ việc hoặc đổi nhiệm vụ; kiểm tra lại quyền theo lớp/nghiệp vụ.

## 5. Ứng phó sự cố

1. Ghi nhận ngay: thời gian, người phát hiện, thiết bị/tài khoản, loại dữ liệu, số người có thể bị ảnh hưởng.
2. Cô lập nhưng không phá bằng chứng: khóa tài khoản/token, thu hồi link/tệp, đổi secret liên quan, giữ log và bản chụp trạng thái.
3. Đánh giá tác động tới trẻ em, tài chính, danh tính, quyền lợi và khả năng dữ liệu đã ra ngoài.
4. Báo Chủ trung tâm, người phụ trách dữ liệu và tư vấn pháp lý ngay; xác định nghĩa vụ/thời hạn thông báo cho cơ quan và chủ thể theo văn bản đang áp dụng. Không chờ đủ mọi chi tiết mới bắt đầu quy trình.
5. Khôi phục từ bản sao đã kiểm tra, theo dõi truy cập bất thường, ghi nguyên nhân và biện pháp ngăn lặp lại.
6. Diễn tập ít nhất theo lịch nội bộ đã phê duyệt và lưu biên bản.

## 6. Kiểm tra định kỳ

- Hằng tháng: tài khoản đang hoạt động, người nghỉ/đổi vai trò, file xuất còn lưu, hộp thư nhận sao lưu.
- Khi phát hành tính năng: dữ liệu mới, mục đích mới, quyền máy chủ, nhà cung cấp, chính sách và phiên bản consent.
- Khi đổi nhà cung cấp/khu vực lưu trữ: cập nhật đánh giá tác động/chuyển dữ liệu và thông báo/đồng ý khi cần.
- Khi thêm analytics, pixel, quảng cáo hoặc AI: dừng triển khai cho đến khi rà soát lại cookie/tracking, chia sẻ dữ liệu và tính minh bạch.
