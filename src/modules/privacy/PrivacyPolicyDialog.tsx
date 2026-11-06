import { ShieldCheck, X } from 'lucide-react';
import { DialogFrame } from '../../components/DialogFrame';
import type { CenterSettings } from '../../types';
import { PRIVACY_POLICY_EFFECTIVE_DATE, PRIVACY_POLICY_VERSION } from './privacyPolicy';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  settings: Pick<CenterSettings, 'name' | 'address' | 'phone' | 'email'>;
}

export function PrivacyPolicyDialog({ isOpen, onClose, settings }: Props) {
  if (!isOpen) return null;
  return (
    <DialogFrame label="Chính sách bảo vệ dữ liệu cá nhân" onClose={onClose} className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-6">
      <article className="dialog-panel max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 text-sm leading-6 text-slate-700 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800"><ShieldCheck className="h-4 w-4" /> BẢO VỆ DỮ LIỆU CÁ NHÂN</div>
            <h2 className="text-xl font-black text-slate-950">Chính sách quyền riêng tư của {settings.name}</h2>
            <p className="mt-1 text-xs text-slate-500">Phiên bản {PRIVACY_POLICY_VERSION} • hiệu lực {PRIVACY_POLICY_EFFECTIVE_DATE}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng chính sách" className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="mt-5 space-y-5">
          <section>
            <h3 className="font-extrabold text-slate-950">1. Đơn vị kiểm soát dữ liệu</h3>
            <p>{settings.name}; địa chỉ: {settings.address}; điện thoại: {settings.phone}; email tiếp nhận yêu cầu: <a className="font-bold text-blue-700 underline" href={`mailto:${settings.email}`}>{settings.email}</a>.</p>
          </section>
          <section>
            <h3 className="font-extrabold text-slate-950">2. Dữ liệu được xử lý</h3>
            <p>Hệ thống có thể lưu thông tin tài khoản nhân sự; hồ sơ học viên và phụ huynh; ngày sinh, giới tính, trường/lớp, địa chỉ và thông tin liên hệ; đăng ký học, điểm danh, nhận xét, điểm số; học phí, phiếu thu; trạng thái và mã tham chiếu hồ sơ đồng ý của người đại diện; nội dung nhập từ Excel; lịch sử thao tác, đăng nhập và sao lưu. Không nhập dữ liệu không cần thiết vào ô ghi chú.</p>
            <p className="mt-2">BeeZone không được thiết kế để lưu bản chụp giấy tờ tùy thân, chữ ký, sinh trắc học, hồ sơ sức khỏe, mật khẩu, số thẻ hoặc tài khoản ngân hàng. Nếu trung tâm thật sự cần một nhóm dữ liệu nhạy cảm, phải đánh giá riêng về sự cần thiết, căn cứ xử lý, giới hạn người xem, thời hạn lưu và thông báo/đồng ý trước khi nhập.</p>
          </section>
          <section>
            <h3 className="font-extrabold text-slate-950">3. Mục đích và phạm vi sử dụng</h3>
            <p>Dữ liệu chỉ được dùng để xác thực và phân quyền; quản lý tuyển sinh, lớp học, lịch học, học vụ, liên hệ phụ huynh, học phí; bảo đảm an toàn, ghi nhật ký, xử lý sự cố và sao lưu. BeeZone không bán dữ liệu cá nhân và không dùng hệ thống này để chạy quảng cáo theo hành vi.</p>
          </section>
          <section>
            <h3 className="font-extrabold text-slate-950">4. Dịch vụ hỗ trợ xử lý</h3>
            <p>Đăng nhập có thể đi qua Google; dữ liệu ứng dụng được lưu trên Supabase và ứng dụng được vận hành trên Vercel. Resend/email chỉ nhận bản sao toàn hệ thống khi Chủ trung tâm chủ động bật. Nút Zalo, SMS, Facebook hoặc Messenger chỉ mở kênh do người dùng lựa chọn; người dùng phải kiểm tra nội dung trước khi gửi. Các nhà cung cấp này có thể xử lý dữ liệu ngoài Việt Nam theo hạ tầng của họ.</p>
          </section>
          <section>
            <h3 className="font-extrabold text-slate-950">5. Thời hạn lưu giữ và an toàn</h3>
            <p>Hồ sơ được giữ trong thời gian cần thiết cho quan hệ học tập, vận hành trung tâm, giải quyết yêu cầu và nghĩa vụ kế toán/pháp luật áp dụng; sau đó phải được xóa hoặc ẩn danh theo quy trình của trung tâm. Hệ thống dùng đăng nhập, phân quyền, mã hóa đường truyền, kiểm tra dữ liệu, nhật ký và cơ chế chống ghi đè đồng thời. Không có hệ thống nào loại bỏ hoàn toàn rủi ro.</p>
          </section>
          <section>
            <h3 className="font-extrabold text-slate-950">6. Dữ liệu trẻ em</h3>
            <p>Phụ huynh/người giám hộ và nhân sự được ủy quyền chỉ cung cấp dữ liệu cần thiết cho việc học. Trung tâm phải kiểm tra thẩm quyền và sự đồng ý/căn cứ phù hợp trước khi nhập, chia sẻ hình ảnh, nhận xét hoặc thông tin riêng tư của trẻ; các yêu cầu liên quan quyền của trẻ được xử lý cùng người đại diện theo pháp luật theo quy định áp dụng.</p>
            <p className="mt-2">Hồ sơ học viên có mục ghi trạng thái, ngày, hình thức và mã tham chiếu bằng chứng. Mục này chỉ là chỉ mục đối soát, không thay thế văn bản/bằng chứng gốc và không tự chứng minh sự đồng ý hợp lệ. Khi phụ huynh rút lại, nhân sự phải cập nhật trạng thái và chuyển yêu cầu cho người phụ trách dữ liệu.</p>
          </section>
          <section>
            <h3 className="font-extrabold text-slate-950">7. Quyền và cách gửi yêu cầu</h3>
            <p>Chủ thể dữ liệu có thể yêu cầu được biết, truy cập, sửa, hạn chế, phản đối, rút lại sự đồng ý hoặc xóa dữ liệu trong phạm vi pháp luật cho phép. Gửi yêu cầu tới email ở mục 1, nêu rõ danh tính, quan hệ với học viên và nội dung cần xử lý. Việc rút lại sự đồng ý không làm mất tính hợp pháp của xử lý đã thực hiện trước đó; một số chức năng cần thiết có thể không tiếp tục sử dụng được.</p>
            <p className="mt-2">Trung tâm ghi nhận và hướng dẫn xác minh trong tối đa 02 ngày làm việc. Mốc xử lý nội bộ thông thường là 10 ngày cho truy cập/cung cấp/chỉnh sửa, 15 ngày cho rút lại/hạn chế/phản đối và 20 ngày cho xóa; trường hợp có bên thứ ba, được gia hạn hợp pháp hoặc phải giữ hồ sơ theo nghĩa vụ khác sẽ được thông báo kèm lý do và thời hạn áp dụng.</p>
          </section>
          <section>
            <h3 className="font-extrabold text-slate-950">8. Lưu trữ trên thiết bị</h3>
            <p>Ứng dụng chỉ dùng phiên đăng nhập, bộ nhớ cục bộ và bộ nhớ đệm kỹ thuật cần thiết để duy trì phiên, giao diện và bản xem thử. Hiện không tích hợp công cụ phân tích hành vi, pixel quảng cáo hoặc quảng cáo SDK; vì vậy không đặt lựa chọn quảng cáo vào cùng sự đồng ý sử dụng hệ thống.</p>
          </section>
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">Khi thay đổi mục đích, loại dữ liệu hoặc nhà cung cấp, trung tâm phải cập nhật chính sách và xin lại sự đồng ý khi pháp luật yêu cầu.</p>
        </div>
      </article>
    </DialogFrame>
  );
}
