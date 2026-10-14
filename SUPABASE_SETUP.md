# Thiết lập Supabase Dashboard

Thực hiện trực tiếp trong project Supabase của trung tâm. Không đưa secret key, SMTP password hoặc email quản trị viên vào GitHub, file `.env`, hoặc chat.

## 1. Tạo cấu trúc bảo mật và thêm owner riêng tư

1. Vào **SQL Editor** → **New query**.
2. Mở file `supabase/migrations/001_auth_profiles.sql` trong repository, sao chép toàn bộ nội dung vào SQL Editor, rồi chọn **Run**.
3. Tạo query mới, chạy tiếp toàn bộ `supabase/migrations/002_bootstrap_owners.sql`.
4. Tạo query mới, chạy tiếp toàn bộ `supabase/migrations/003_center_data.sql`. Migration này tạo kho dữ liệu trung tâm có RLS; tuyệt đối không dán danh sách học sinh/học phí vào SQL Editor hay GitHub.
5. Tạo query mới, chạy tiếp toàn bộ `supabase/migrations/004_account_audit_logs.sql`. Migration này tạo nhật ký tài khoản chỉ Chủ trung tâm xem được.
6. Tạo query mới, chạy tiếp toàn bộ `supabase/migrations/005_backfill_owner_account_audit_logs.sql` để khởi tạo lịch sử cho các Chủ trung tâm hiện có mà không hiển thị email.
7. Vào **Table Editor** → schema `public` → bảng `owner_bootstrap_allowlist` → **Insert**.
8. Thêm một dòng cho mỗi trong hai email Chủ trung tâm đã trao đổi, chỉ điền cột `email`; không cần điền `created_at`.
9. Không chia sẻ ảnh màn hình hoặc export của bảng này. Bảng đã bật RLS và browser không có quyền đọc nó.

Nếu một trong hai chủ đã đăng nhập trước khi được thêm vào allowlist, trigger của migration sẽ tự chuyển profile tương ứng thành `owner` và kích hoạt tài khoản ngay khi bạn lưu dòng đó.

## 2. Chỉ dùng đăng nhập Google

Với bản bảo mật mới, sau migration 001–008 cần chạy [009_request_quotas.sql](supabase/migrations/009_request_quotas.sql) trong staging, thử quyền/quota/lưu dữ liệu rồi áp dụng lên project sử dụng trước khi redeploy API. 009 tạo bảng quota riêng, giới hạn API quản trị và ghi trực tiếp, không sửa lịch sử học viên/học phí. Kiểm tra thêm trigger `center_data_00_request_guard` và RPC `consume_admin_request_quota`; RPC chỉ cấp cho service role. Thiếu migration này, API mới trả 503 thay vì bỏ qua chống spam. Agent chưa áp dụng migration production. Xem [SECURITY.md](SECURITY.md).

Trước khi đưa ứng dụng vào sử dụng, chạy thêm `supabase/migrations/006_enforce_business_permissions.sql` sau migration 005, rồi `supabase/migrations/007_small_center_operations.sql`, rồi `supabase/migrations/008_session_tuition.sql`. Migration 006 kiểm tra quyền ghi và bảo vệ Chủ trung tâm cuối cùng. Migration 007 kiểm tra ngày/số buổi, lịch sử đăng ký, hạn học phí và quyền đổi lịch. Migration 008 giữ giá lịch sử, kiểm tra nguồn điểm danh/phiếu thu, ngăn một buổi bị thu hai lần và cộng buổi chưa lập phiếu vào công nợ. Client cũ bị chặn nếu bỏ các trường mới. Các migration giữ nguyên dữ liệu và được kiểm thử bằng PostgreSQL cục bộ; chưa được agent áp dụng lên project Supabase thật. Kiểm tra đủ trigger `center_data_guard_permissions`, `profiles_guard_final_owner`, `center_data_guard_operations`, `center_data_guard_billing` trước khi chuyển domain.

Mô hình `center_data` hiện lưu chung một tài liệu. Quyền xem theo từng lớp và ẩn tài chính trên giao diện chưa phải cách ly quyền đọc ở cơ sở dữ liệu; xem giới hạn và hướng nâng cấp trong `SECURITY.md` trước khi cấp quyền cho người không được phép đọc toàn bộ dữ liệu trung tâm.

1. Vào **Authentication** → **Providers** → **Email** và tắt provider nếu không cần dùng ngoài hệ thống.
2. Tắt **Allow new users to sign up** sau khi hoàn thành bước bootstrap ở phần 4 bên dưới.
3. Vào **Authentication** → **URL Configuration**. Tạm thời có thể để Site URL là `http://localhost:3000`; sau khi Vercel deploy, thay bằng HTTPS domain thật.

Hệ thống chỉ hiển thị đăng nhập Google; không dùng màn hình đăng nhập email/mật khẩu.

## 3. Thiết lập Google OAuth

1. Trong Google Cloud Console, tạo/chọn project → **Google Auth Platform**.
2. Hoàn thành **Branding**, **Audience** và **Data Access**. Các scope cần có là `openid`, email và profile.
3. Tạo **OAuth client ID** loại **Web application**.
4. Ở **Authorized JavaScript origins**, thêm `http://localhost:3000` và sau đó thêm Vercel HTTPS domain.
5. Ở **Authorized redirect URIs**, dùng chính callback URL hiển thị trong trang Google provider của Supabase (không dùng URL ứng dụng Vercel ở ô này).
6. Quay lại Supabase → **Authentication** → **Providers** → **Google**, bật provider và dán Client ID/Client Secret từ Google Cloud → Save.

## 4. Bootstrap hai Chủ trung tâm

Để hai tài khoản Google đầu tiên được tạo một cách có kiểm soát:

1. Sau khi allowlist ở phần 1 đã có đủ hai dòng, bật tạm **Allow new users to sign up**.
2. Mở ứng dụng local hoặc Vercel preview, đăng nhập Google một lần bằng từng email Chủ trung tâm đã được allowlist.
3. Vào **Authentication** → **Users** để kiểm tra đã có đúng hai user cần thiết.
4. Tắt lại **Allow new users to sign up**.

Trong thời gian bootstrap, bất kỳ email không nằm trong allowlist vẫn chỉ tạo profile `staff` **inactive** và không thể vào ứng dụng. Sau khi tắt signup, Chủ trung tâm hiện có cấp quyền Google cho user mới tại màn hình **Quản lý tài khoản**.

## 5. Lấy khóa và cấu hình Vercel

1. Vào **Project Settings** → **API**.
2. Sao chép Project URL và publishable key để dùng làm `VITE_SUPABASE_URL` và `VITE_SUPABASE_PUBLISHABLE_KEY` trên Vercel.
3. Sao chép secret key (hoặc legacy service-role key) chỉ để dùng làm `SUPABASE_SECRET_KEY` trên Vercel. Không bao giờ dùng tiền tố `VITE_` cho key này.
4. Sau khi Vercel tạo domain, cập nhật Site URL, Redirect URLs và `APP_URL` bằng domain HTTPS đó.

## 6. Cấp quyền Google trong ứng dụng

1. Đăng nhập bằng tài khoản Chủ trung tâm.
2. Chọn **Phân quyền nhân viên** → nhập họ tên và email → chọn cấp bậc.
3. Với nhân viên, tick đúng các quyền cần thiết. Với Chủ trung tâm, hệ thống cấp toàn quyền.
4. Chọn **Cấp quyền Google**. Người được cấp chỉ cần đăng nhập Google bằng đúng email; không nhận email mời và không cần đặt mật khẩu.
5. Mở **Nhật ký hệ thống** để kiểm tra lịch sử cấp quyền, chỉnh sửa quyền, khóa hoặc mở khóa tài khoản. Nhật ký không hiển thị email.

## 7. Nhập dữ liệu Excel riêng tư

1. Đăng nhập bằng tài khoản Chủ trung tâm.
2. Vào **Excel Import / Export** → tab **Nhập**.
3. Chọn file `PhucPhucThinh_BaoCaoToanHeThong_2026-08-10_DaChuanHoa.xlsx` được cung cấp riêng, không commit file này lên GitHub.
4. Khi ứng dụng hiện số lớp, học sinh và phiếu thu, chọn **Xác nhận nhập toàn bộ dữ liệu**.
5. Chờ thông báo thành công. Dữ liệu sẽ lưu ở `public.center_data` trong Supabase, chỉ người dùng đã được kích hoạt mới đọc/ghi được theo RLS.

## 8. Kiểm tra cuối

1. Đăng nhập Google bằng một owner và kiểm tra có nút quản lý tài khoản.
2. Cấp quyền Google cho một email thử nghiệm role `staff`; người đó đăng nhập Google bằng đúng email mà không cần đặt mật khẩu.
3. Xác nhận staff không mở được phần quản lý tài khoản.
4. Đăng xuất, thử một email chưa được cấp quyền; ứng dụng phải hiển thị trạng thái chưa được cấp quyền.
5. Mở Excel Import / Export và xác nhận báo cáo tổng quan có tổng thu theo tháng/từng lớp; thêm một dòng ở sheet `HỌC PHÍ` của file xuất để kiểm tra công thức tự cộng.
