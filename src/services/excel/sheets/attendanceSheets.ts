import { moneyFormat, styleData, styleHeader } from '../styles';

import { unbilledSessionCharges } from '../../../lib/sessionBilling';
import type { ExportContext } from '../exportContext';
export function writeAttendanceSheets(context: ExportContext) {
  const { data, workbook, classById, studentById, teacherById } = context;
  // Preserve the source and price of each lesson for a financial round trip.
  const attendanceSheet = workbook.addWorksheet('ĐIỂM DANH BUỔI');
  attendanceSheet.addRow([
    'ID buổi',
    'Mã lớp',
    'Ngày học',
    'Mã học sinh',
    'Trạng thái điểm danh',
    'Bài tập',
    'Ghi chú học viên',
    'Đơn giá buổi',
    'Quy tắc vắng',
    'Nội dung bài',
    'Ghi chú buổi',
    'Giáo viên',
    'Dặn dò / BTVN riêng',
    'Đánh giá sao',
    'Thái độ học tập',
    'Điểm buổi học',
  ]);
  styleHeader(attendanceSheet.getRow(1));
  for (const session of data.attendanceSessions || []) {
    for (const entry of session.entries.length ? session.entries : [undefined]) {
      attendanceSheet.addRow([
        session.id,
        classById.get(session.classId)?.code || session.classId,
        session.date,
        entry ? studentById.get(entry.studentId)?.code || entry.studentId : '',
        entry?.status || '',
        entry?.homeworkCompleted === undefined ? '' : entry.homeworkCompleted ? 'Có' : 'Không',
        entry?.note || '',
        session.billing?.unitPrice ?? '',
        session.billing?.absencePolicy || '',
        session.lessonTopic,
        session.generalNotes || '',
        session.teacherId ? teacherById.get(session.teacherId)?.name || '' : '',
        entry?.homeworkAssignment || '',
        entry?.rating ?? '',
        entry?.learningAttitude || '',
        entry?.sessionScore ?? '',
      ]);
    }
  }
  attendanceSheet.views = [{ state: 'frozen', ySplit: 1 }];
  attendanceSheet.columns = [28, 18, 16, 18, 24, 18, 35, 18, 20, 40, 40, 28, 40, 16, 22, 18].map((width) => ({
    width,
  }));
  const pendingSheet = workbook.addWorksheet('BUỔI CHƯA THU');
  pendingSheet.addRow([
    'STT',
    'ID buổi',
    'Mã lớp',
    'Mã học sinh',
    'Họ và tên',
    'Ngày học',
    'Chưa lập phiếu (VNĐ)',
  ]);
  styleHeader(pendingSheet.getRow(1));
  unbilledSessionCharges(data.attendanceSessions || [], data.receipts).forEach((line, index) => {
    const row = pendingSheet.addRow([
      index + 1,
      line.attendanceSessionId,
      classById.get(line.classId)?.code || '',
      studentById.get(line.studentId)?.code || '',
      studentById.get(line.studentId)?.name || '',
      line.date,
      line.unitPrice,
    ]);
    styleData(row, index);
    row.getCell(7).numFmt = moneyFormat;
  });
  pendingSheet.columns = [8, 28, 18, 18, 30, 16, 24].map((width) => ({ width }));
  pendingSheet.views = [{ state: 'frozen', ySplit: 1 }];
}
