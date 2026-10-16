# Thiết lập Supabase cho BeeZone

Project đang dùng: [deiohgeljdlxtecbeosu](https://supabase.com/dashboard/project/deiohgeljdlxtecbeosu). Domain chính: https://beezone-english.vercel.app. Không đưa khóa, Google Client Secret, email quản trị hoặc dữ liệu trung tâm vào GitHub.

## 1. Khởi tạo database mới

Trong thư mục dự án, chạy:

```sh
node scripts/create-supabase-setup.mjs
```

Lệnh chỉ tạo `.vercel/setup-new-project.sql` từ các migration hiện có, không kết nối hoặc thay đổi database. File ghép chứa migration **001–010** theo thứ tự, chạy trong một transaction và từ chối schema `public` đã có bảng/view hoặc các đối tượng BeeZone. Nó không nhúng email, khóa hay dữ liệu mẫu. Tài khoản Auth có trước lúc khởi tạo được thêm profile **staff chưa kích hoạt**, không tin quyền trong metadata.

1. Mở đúng project mới → **SQL Editor** → **New query**.
2. Sao chép toàn bộ file SQL vừa tạo, chọn **Run** một lần.
3. Kết quả cuối phải có năm bảng bật RLS: `profiles`, `owner_bootstrap_allowlist`, `center_data`, `account_audit_logs`, `request_quotas`.

Nếu script báo schema đã tồn tại, dừng và kiểm tra migration đã áp dụng. Không xóa bảng hoặc chạy lại script để xử lý lỗi. Nếu một câu lệnh thất bại, transaction không commit; chạy `ROLLBACK;` trước lần thử tiếp theo nếu SQL Editor giữ phiên transaction lỗi.

Với project đã có BeeZone, không dùng file khởi tạo mới: đối chiếu schema/backup và áp dụng riêng các migration còn thiếu theo thứ tự. 006 kiểm tra quyền và bảo vệ Chủ trung tâm cuối cùng; 007 kiểm tra học vụ; 008 giữ lịch sử và học phí theo buổi; 009 tạo quota dùng chung và RPC quản trị. Thiếu quota, API trả 503 và chặn thao tác.

010 thêm cờ `is_private` cho profile và allowlist, mặc định `false` để giữ cách hiển thị tài khoản cũ. Tài khoản riêng không xuất hiện trong API danh sách tài khoản/phiên cục bộ; quyền vẫn lấy từ profile đang hoạt động và thao tác vẫn có nhật ký. SQL cấu hình riêng chỉ chạy sau khi schema đã có 010.

## 2. Bật đăng nhập Google

Thiết lập theo [hướng dẫn Google OAuth của Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google):

1. Trong Google Cloud → **Google Auth Platform**, thiết lập Branding/Audience và scope `openid`, email, profile. Nếu ứng dụng ở chế độ Testing, thêm các tài khoản sẽ đăng nhập vào Test users.
2. Tạo/chọn OAuth client loại **Web application**. Authorized JavaScript origin: `https://beezone-english.vercel.app`.
3. Authorized redirect URI: `https://deiohgeljdlxtecbeosu.supabase.co/auth/v1/callback`. Kiểm tra khớp callback URL hiển thị trong Google provider của project mới.
4. Supabase → **Authentication** → **Sign In / Providers** → **Google**: bật provider, nhập Client ID/Client Secret riêng tại Dashboard và lưu. Không gửi Client Secret trong chat.
5. **Authentication** → **URL Configuration**: Site URL và Redirect URL là `https://beezone-english.vercel.app`. Với phát triển local, thêm riêng `http://localhost:3000` vào Redirect URLs; ứng dụng chuyển về `window.location.origin`.

Không bật bỏ qua nonce. Ứng dụng chỉ có giao diện đăng nhập Google; provider email/password không cần cho luồng này.

Nút đăng nhập gửi `prompt=select_account` để Google hiện bước chọn tài khoản khi bắt đầu OAuth. Phiên BeeZone còn hợp lệ vẫn được khôi phục khi mở lại trang; muốn chọn tài khoản khác, đăng xuất BeeZone rồi bấm đăng nhập Google. Google quyết định khi nào cần nhập lại mật khẩu hoặc xác minh hai bước theo trạng thái và chính sách bảo mật của tài khoản.

Nếu Supabase vẫn chuyển `localhost` về Site URL trên Vercel, có thể đặt `VITE_LOCAL_AUTH_ORIGIN="http://127.0.0.1:3000"` trong `.env.local` rồi chạy lại Vite. Màn hình chưa đăng nhập sẽ chuyển sang địa chỉ loopback đã cấu hình trước khi bắt đầu OAuth; Google và Supabase quay về cùng origin để đổi mã PKCE. Biến chỉ có tác dụng khi chạy chế độ development, chỉ chấp nhận HTTP trên loopback cùng cổng và không chuyển phiên/verifier giữa các origin. Workspace đang đăng nhập không bị tự điều hướng. Đường dẫn và `?tab=` được giữ, còn tham số callback cũ được bỏ khi đổi origin. Khi đã cấu hình đúng Redirect URLs cho `localhost`, có thể bỏ biến này để đăng nhập trực tiếp tại `localhost`.

## 3. Kích hoạt Chủ trung tâm

1. **Table Editor** → `public.owner_bootstrap_allowlist` → **Insert**: điền email Google Chủ trung tâm bằng chữ thường. Chọn tài khoản do trung tâm quản lý; không đưa email này vào file SQL trong Git.
2. Bật tạm **Allow new users to sign up**, đăng nhập lần đầu trên domain chính bằng email đã thêm.
3. Kiểm tra trong Dashboard rằng user có profile `owner`, `is_active = true`, rồi tắt lại **Allow new users to sign up**.

Trong thời gian bootstrap, email ngoài allowlist chỉ có profile inactive và không vào được trung tâm. Nếu user Auth đã tồn tại trước khi setup, file khởi tạo đã thêm profile inactive; thêm allowlist sẽ kích hoạt profile đó. Sau bootstrap, owner cấp quyền Google cho người mới qua **Phân quyền nhân viên**; không cần mật khẩu hoặc email mời.

### Tài khoản quản trị không hiển thị trong danh sách

- Cấu hình riêng tại Dashboard: thêm/cập nhật email trong `owner_bootstrap_allowlist` với `is_private = true`. Chỉ Dashboard hoặc máy chủ có quyền truy cập bảng này; không đặt email trong JavaScript, biến `VITE_` hay SQL được commit.
- Có thể truyền email qua stdin cho `node scripts/create-private-owner-setup.mjs`. Script tạo `.vercel/setup-private-owner.sql` đã được Git/Vite/Vercel bỏ qua, không kết nối database. Chạy file đó trên đúng project sau migration 010, rồi đăng nhập Google bằng tài khoản đã chỉ định.
- Nếu Auth user đã có, trigger kích hoạt profile ngay và thêm nhật ký. Nếu chưa có, cấu hình chờ lần đăng nhập Google đầu tiên. Lặp lại file riêng không tạo thêm bản ghi hoặc nhật ký khi cấu hình không đổi.
- Giao diện chung dùng nhãn “Quản trị hệ thống”; tài khoản riêng không xuất hiện trong danh sách thành viên/phiên cục bộ. Khi mở hộp **Tài khoản**, chính người đăng nhập nhìn thấy tên và email Google của mình để nhận biết đúng phiên; chỉ đọc danh tính khi ID phiên khớp ID profile hiện tại. Danh tính này không thay đổi vai trò, quyền hoặc nhãn trong nhật ký. Danh tính Auth vẫn tồn tại trên Supabase; đây là ẩn giao diện, không xóa tài khoản hoặc nhật ký. Quản lý/thu hồi tài khoản riêng qua Dashboard.

## 4. Kiểm tra môi trường Vercel

Trong [Production Environment Variables](https://vercel.com/ngonpham/beezone-english/settings/environment-variables), ứng dụng cần:

| Biến | Nội dung |
| --- | --- |
| `VITE_SUPABASE_URL` | Project URL của Supabase mới |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key hoặc anon key, quyền client |
| `SUPABASE_URL` | Cùng Project URL, cho máy chủ |
| `SUPABASE_SECRET_KEY` | Secret key chỉ cho máy chủ; có thể dùng `SUPABASE_SERVICE_ROLE_KEY` legacy |
| `APP_URL` | `https://beezone-english.vercel.app` |

Các biến này đã được cấu hình trong đợt deploy 14/10/2026. Integration có `NEXT_PUBLIC_` chưa đủ cho Vite; khóa máy chủ không bao giờ có tiền tố `VITE_`. Nếu đổi biến Vercel, redeploy để nạp giá trị mới. Không cần redeploy chỉ vì vừa chạy SQL hoặc bật provider trong Supabase.

## 5. Kiểm tra trước khi nhập dữ liệu thật

- Owner đăng nhập được, mở được phân quyền và nhật ký tài khoản; người chưa cấp quyền không vào ứng dụng.
- Cấp một tài khoản staff thử, xác minh API từ chối quản trị và database từ chối ghi ngoài quyền.
- Lưu một thay đổi kiểm tra, tải lại và thử xung đột từ hai phiên; không tự ghi đè dữ liệu.
- Với học phí theo buổi, có mặt/đi trễ mới tính tiền; buổi đã lập phiếu giữ nguyên đơn giá lịch sử và không bị thu hai lần.
- Khôi phục JSON/nhập Excel riêng trong ứng dụng sau khi xem bản kiểm tra; không đưa file riêng lên Git. Tạo sao lưu trước khi nhập hoặc đổi dữ liệu đang sử dụng.

`center_data` lưu chung một tài liệu: user active có thể đọc toàn bộ tài liệu theo RLS. Ẩn tài chính/lọc lớp ở giao diện chưa cách ly quyền đọc database. Đọc [SECURITY.md](SECURITY.md) trước khi cấp tài khoản cho người không được phép đọc toàn bộ dữ liệu trung tâm.

Trạng thái deployment và các phần chưa hoàn tất: [DEPLOYMENT_STATUS.md](DEPLOYMENT_STATUS.md).
