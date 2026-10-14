# Hướng dẫn cập nhật BeeZone

Đọc `ARCHITECTURE.md` trước khi đổi cấu trúc hoặc thêm chức năng.

- Giữ `App.tsx` là nơi ghép ứng dụng; đặt giao diện và thao tác nghiệp vụ trong module tương ứng.
- Không import `App`, `WorkspaceScreens` hoặc component React vào `actions.ts` và các quy tắc thuần. Không tạo vòng phụ thuộc giữa module.
- Quyền và dữ liệu máy chủ nằm trong `api`/`server`; không import handler máy chủ vào mã trình duyệt. Máy chủ không dùng Supabase client lưu phiên trình duyệt hoặc các thao tác ghi state của giao diện. Chia sẻ type bằng `import type`, chia sẻ quy tắc qua `lib`/model.
- API quản trị dùng `server/admin.ts` để giữ kiểm tra xác thực/quyền/quota nhất quán. Không bỏ qua quota hoặc tự ghi đè khi database không sẵn sàng; không đưa token/payload vào log production.
- Sử dụng `useCenterStore` cho dữ liệu trung tâm dùng chung. Dữ liệu nhập phải được kiểm tra trước khi thay state.
- Giữ nguyên khóa trình duyệt, URL và định dạng sao lưu; nếu đổi schema, hỗ trợ dữ liệu cũ và cập nhật validation/migration cùng lúc.
- Không làm mất lịch sử học viên, đăng ký, thu tiền, điểm danh và đơn giá buổi. Phân quyền giao diện phải có kiểm tra tương ứng ở máy chủ.
- Không thay đồng bộ CAS bằng ghi đè. Không tải lại dữ liệu đang sửa khi refresh token.
- Chạy `npm run check` khi thay mã. Với sửa nghiệp vụ, kiểm tra luồng liên quan; với sửa UI, kiểm tra responsive và thao tác bàn phím.
- Không ghi secret, `.env`, dữ liệu cá nhân hay tệp Excel riêng vào Git. Không tự chạy migration production trong một công việc refactor.
