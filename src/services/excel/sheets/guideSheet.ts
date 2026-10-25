import { COLOR, styleData, styleTitle } from '../styles';

import type { ExportContext } from '../exportContext';
export function writeGuideSheet(context: ExportContext) {
  const { data, workbook } = context;
  const guide = workbook.addWorksheet('HƯỚNG DẪN');
  styleTitle(guide, 'A1:H2', `${data.centerName.toUpperCase()}\nHƯỚNG DẪN NHẬP VÀ CÔNG THỨC EXCEL`);
  const guideRows = [
    [
      '1. Hồ sơ học sinh',
      'Danh sách nằm ở sheet HỌC SINH. Để thêm hoặc chuyển lớp, thực hiện trong ứng dụng rồi xuất báo cáo mới. Mã học sinh phải duy nhất.',
    ],
    [
      '2. Thu trực tiếp cùng học sinh',
      'Nếu thu ngay khi thêm học sinh, nhập số tiền ở cột “Đã thu nhập trực tiếp”; có thể điền thêm Số tiền còn lại, Khoản thu, Kỳ/Mốc khóa, Ngày thu và Hình thức. Các sheet lớp, TỔNG QUAN và tổng HỌC PHÍ tự cập nhật.',
    ],
    [
      '3. Phiếu thu chi tiết',
      'Sheet HỌC PHÍ giữ lớp và ngày thu của từng giao dịch, kể cả học viên đã chuyển lớp. Các đợt đóng tiền được xuất riêng để đối chiếu theo tháng. Không đổi mã phiếu trừ khi đang sửa lỗi có chủ đích.',
    ],
    [
      '4. Bảng điểm',
      'Sheet BẢNG ĐIỂM giữ điểm theo từng học viên và từng lớp. Bạn có thể sửa các cột kỹ năng, giữa kỳ, cuối kỳ và chuyên cần (0–10). Giữ Mã HS và Mã lớp để nhập lại đúng lịch sử.',
    ],
    [
      '5. Công thức tổng thu tháng/lớp',
      "=SUMIFS('HỌC PHÍ'!$L:$L,'HỌC PHÍ'!$F:$F,$A15,'HỌC PHÍ'!$O:$O,\">=\"&D$14,'HỌC PHÍ'!$O:$O,\"<\"&EDATE(D$14,1))+SUMIFS('HỌC SINH'!$M:$M,'HỌC SINH'!$G:$G,$A15,'HỌC SINH'!$Q:$Q,\">=\"&D$14,'HỌC SINH'!$Q:$Q,\"<\"&EDATE(D$14,1))",
    ],
    [
      '6. Liên kết khi bấm',
      'Các ô màu xanh gạch chân và cột “Nguồn công thức” là liên kết: bấm để mở sheet nguồn, tháng/lớp hoặc phiếu thu. Nếu Excel đang bật bảo vệ liên kết, hãy giữ Ctrl rồi bấm.',
    ],
    [
      '7. Công thức Excel',
      'Đây là báo cáo XLSX không chứa macro. Mở bằng Excel để tính lại công thức. Tệp không tự đồng bộ với ứng dụng; muốn cập nhật dữ liệu, dùng chức năng Nhập Excel và xem kỹ phần xác nhận.',
    ],
    [
      '8. Đồng bộ về web',
      'Khi nhập lại tệp vào website, các khoản “nhập trực tiếp” tại HỌC SINH được tạo thành phiếu thu tự động; các khoản đã có trong HỌC PHÍ vẫn được giữ nguyên. Tệp có mã HS, mã lớp hoặc mã phiếu thu trùng/sai sẽ bị chặn để tránh liên kết nhầm.',
    ],
    [
      '9. Sao lưu đầy đủ',
      'Báo cáo Excel phục vụ đối chiếu và nhập dữ liệu học vụ/học phí. Để giữ cả cài đặt, lịch học, điểm danh và nhật ký, hãy xuất bản sao lưu JSON từ ứng dụng. Không xóa cột ID hoặc sửa liên kết khi chỉ xem báo cáo.',
    ],
  ];
  guideRows.forEach((values, index) => {
    const row = guide.getRow(4 + index);
    row.values = values;
    styleData(row, index);
    row.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: COLOR.primary } };
  });
  guide.columns = [{ width: 28 }, { width: 120 }];
  guide.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}
