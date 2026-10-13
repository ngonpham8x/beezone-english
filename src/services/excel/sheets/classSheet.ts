import { applyBackLink, COLOR, styleData, styleHeader, styleTitle, writeFooter } from '../styles';

import { courseStatusLabels } from '../../../lib/operations';
import type { ExportContext } from '../exportContext';
export function writeClassSheet(context: ExportContext) {
  const { data, workbook, classSheetNames, programById, teacherById, roomById } = context;
  const classSheet = workbook.addWorksheet('LỚP HỌC');
  styleTitle(classSheet, 'A1:O2', `${data.centerName.toUpperCase()}\nDANH SÁCH LỚP HỌC`);
  applyBackLink(classSheet, 'O');
  const classHeaders = [
    'STT',
    'Mã lớp',
    'Tên lớp',
    'Chương trình',
    'Giáo viên',
    'Lịch học',
    'Phòng',
    'Sức chứa',
    'Sĩ số',
    'Sheet chi tiết',
    'Ngày khai giảng',
    'Ngày kết thúc',
    'Số buổi dự kiến',
    'Trạng thái đợt học',
    'Ngày chốt đợt',
    'Hình thức học phí',
    'Đơn giá buổi',
    'Ngày áp dụng phí buổi',
    'Quy tắc vắng',
  ];
  classSheet.getRow(5).values = classHeaders;
  styleHeader(classSheet.getRow(5));
  data.classes.forEach((classroom, index) => {
    const rowNumber = 6 + index;
    const row = classSheet.getRow(rowNumber);
    const teacher = teacherById.get(classroom.teacherId);
    row.values = [
      index + 1,
      classroom.code,
      classroom.name,
      programById.get(classroom.programId)?.name || classroom.programId,
      teacher?.name || 'Chưa cập nhật',
      classroom.scheduleTime || classroom.days.join(', '),
      roomById.get(classroom.roomId)?.name || classroom.roomId || 'Chưa cập nhật',
      classroom.capacity || 'Chưa cập nhật',
      { formula: `COUNTIF('HỌC SINH'!$G:$G,B${rowNumber})` },
      {
        text: `→ ${classSheetNames.get(classroom.id)}`,
        hyperlink: `#'${classSheetNames.get(classroom.id)}'!A1`,
      },
      classroom.startDate || '',
      classroom.endDate || '',
      classroom.totalSessions ?? '',
      courseStatusLabels[classroom.courseStatus || 'active'],
      classroom.completedDate || '',
      classroom.billingMode || 'course',
      classroom.sessionRate ?? '',
      classroom.sessionBillingStartDate || '',
      classroom.sessionAbsencePolicy || 'attended',
    ];
    styleData(row, index);
    row.getCell(10).font = {
      name: 'Arial',
      size: 10,
      color: { argb: COLOR.link },
      underline: true,
      bold: true,
    };
  });
  const classFooterRow = 6 + data.classes.length;
  writeFooter(classSheet, classFooterRow, classHeaders.length, {
    3: `COUNTA(B6:B${classFooterRow - 1})`,
    9: `SUM(I6:I${classFooterRow - 1})`,
  });
  classSheet.autoFilter = { from: 'A5', to: `S${classFooterRow - 1}` };
  classSheet.views = [{ state: 'frozen', ySplit: 5 }];
  classSheet.columns = [
    { width: 8 },
    { width: 18 },
    { width: 32 },
    { width: 26 },
    { width: 26 },
    { width: 32 },
    { width: 16 },
    { width: 14 },
    { width: 12 },
    { width: 28 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 24 },
    { width: 18 },
    { width: 20 },
    { width: 18 },
    { width: 20 },
    { width: 20 },
  ];
}
