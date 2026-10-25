import type ExcelJS from 'exceljs';
import { withUnbilledSessionReceipts } from '../../lib/sessionBilling';
import { feeStatusForReceipts } from '../../lib/tuition';
import type { AttendanceSession, ClassRoom, Student, Teacher, TuitionReceipt } from '../../types';
import {
  cellText,
  duplicatedValues,
  getByAliases,
  isoDate,
  numberValue,
  optionalDate,
  readRecords,
} from './readCells';
import { monthKey } from './styles';
import type { ImportStageResult, MasterDirectPaymentInput } from './types';

export function importFinance(
  workbook: ExcelJS.Workbook,
  tuitionSheet: ExcelJS.Worksheet,
  students: Student[],
  classes: ClassRoom[],
  teachers: Teacher[],
  masterDirectPayments: Map<string, MasterDirectPaymentInput>,
): ImportStageResult<{ receipts: TuitionReceipt[]; attendanceSessions: AttendanceSession[] }> {
  const studentIds = new Set(students.map((student) => student.id));
  const tuitionRecords = readRecords(tuitionSheet, ['maphieu', 'idhethong']);
  const invalidTuitionReferences = tuitionRecords.filter((record) => {
    const suppliedStudentId = cellText(getByAliases(record, ['idhethong', 'systemid']));
    const suppliedStudentCode = cellText(
      getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']),
    );
    const byId = students.find((student) => student.id === suppliedStudentId);
    const byCode = students.find((student) => student.code === suppliedStudentCode);
    const paid = numberValue(getByAliases(record, ['dathuvnd', 'dathu', 'paidamount']));
    const debt = numberValue(getByAliases(record, ['conlaivnd', 'conlai', 'remainingamount', 'congnovnd', 'congno', 'debtamount']));
    return (
      (Boolean(suppliedStudentId || suppliedStudentCode || paid || debt) && !byId && !byCode) ||
      (Boolean(suppliedStudentId && suppliedStudentCode) && byId?.id !== byCode?.id)
    );
  });
  if (invalidTuitionReferences.length > 0) {
    return {
      errors: [
        {
          row: 0,
          field: 'HỌC PHÍ',
          message: `${invalidTuitionReferences.length} phiếu thu không khớp Mã HS / ID hệ thống. Đã dừng nhập để không làm mất hoặc gán nhầm học phí.`,
        },
      ],
    };
  }
  const attendanceSessions: AttendanceSession[] = [];
  const attendanceSheet = workbook.getWorksheet('ĐIỂM DANH BUỔI');
  if (attendanceSheet)
    for (const record of readRecords(attendanceSheet, ['idbuoi', 'malop'])) {
      const id = cellText(getByAliases(record, ['idbuoi']));
      const classroom = classes.find((c) => c.code === cellText(getByAliases(record, ['malop'])));
      if (!id || !classroom)
        return {
          errors: [
            {
              row: 0,
              field: 'Điểm danh',
              message: 'Buổi học thiếu ID hoặc tham chiếu lớp không hợp lệ.',
            },
          ],
        };
      const date = isoDate(getByAliases(record, ['ngayhoc']));
      const rate = getByAliases(record, ['dongiabuoi']);
      let session = attendanceSessions.find((item) => item.id === id);
      if (!session) {
        session = {
          id,
          classId: classroom.id,
          date,
          lessonTopic: cellText(getByAliases(record, ['noidungbai'])),
          generalNotes: cellText(getByAliases(record, ['ghichubuoi'])),
          teacherId: teachers.find((t) => t.name === cellText(getByAliases(record, ['giaovien'])))
            ?.id,
          entries: [],
          billing: cellText(rate)
            ? {
                unitPrice: numberValue(rate),
                absencePolicy: cellText(getByAliases(record, ['quytacvang'])) as NonNullable<
                  AttendanceSession['billing']
                >['absencePolicy'],
              }
            : undefined,
        };
        attendanceSessions.push(session);
      } else if (
        session.classId !== classroom.id ||
        session.date !== date ||
        session.billing?.unitPrice !== (cellText(rate) ? numberValue(rate) : undefined) ||
        session.billing?.absencePolicy !==
          (cellText(rate) ? cellText(getByAliases(record, ['quytacvang'])) : undefined)
      )
        return {
          errors: [
            {
              row: 0,
              field: 'Điểm danh',
              message: 'Các dòng cùng một buổi học không thống nhất lớp, ngày hoặc đơn giá.',
            },
          ],
        };
      const code = cellText(getByAliases(record, ['mahocsinh']));
      if (code) {
        const student = students.find((item) => item.code === code);
        if (!student || session.entries.some((entry) => entry.studentId === student.id))
          return {
            errors: [
              {
                row: 0,
                field: 'Điểm danh',
                message: 'Học viên của buổi học không tồn tại hoặc bị lặp.',
              },
            ],
          };
        const homework = cellText(getByAliases(record, ['baitap']));
        const ratingText = cellText(getByAliases(record, ['danhgiasao', 'rating']));
        const scoreText = cellText(getByAliases(record, ['diembuoihoc', 'diembuoi', 'sessionscore']));
        const learningAttitude = cellText(getByAliases(record, ['thaidohoctap', 'thaido', 'learningattitude']));
        session.entries.push({
          studentId: student.id,
          status: cellText(
            getByAliases(record, ['trangthaidiemdanh']),
          ) as AttendanceSession['entries'][number]['status'],
          note: cellText(getByAliases(record, ['ghichuhocvien'])),
          homeworkCompleted: homework ? homework === 'Có' : undefined,
          homeworkAssignment: cellText(getByAliases(record, ['dandobtvnrieng', 'dandobtvn', 'homeworkassignment'])) || undefined,
          rating: ratingText ? numberValue(getByAliases(record, ['danhgiasao', 'rating'])) : undefined,
          learningAttitude: learningAttitude ? learningAttitude as AttendanceSession['entries'][number]['learningAttitude'] : undefined,
          sessionScore: scoreText ? numberValue(getByAliases(record, ['diembuoihoc', 'diembuoi', 'sessionscore'])) : undefined,
        });
      }
    }
  const rawReceipts: TuitionReceipt[] = tuitionRecords
    .map((record, index) => {
      const suppliedStudentId = cellText(getByAliases(record, ['idhethong', 'systemid']));
      const suppliedStudentCode = cellText(
        getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']),
      );
      // A workbook user only needs to enter the student code. The system ID is
      // an optional technical key, so a new HỌC PHÍ row remains linked on import.
      const student = students.find(
        (item) => item.id === suppliedStudentId || item.code === suppliedStudentCode,
      );
      const studentId = student?.id || suppliedStudentId;
      const paidAmount = numberValue(getByAliases(record, ['dathuvnd', 'dathu', 'paidamount']));
      const debtAmount = numberValue(getByAliases(record, ['conlaivnd', 'conlai', 'remainingamount', 'congnovnd', 'congno', 'debtamount']));
      const paymentKindLabel = cellText(
        getByAliases(record, ['khoanthu', 'paymentkind']),
      ).toLocaleLowerCase('vi-VN');
      const paymentKind: TuitionReceipt['paymentKind'] =
        paymentKindLabel.includes('buổi') || paymentKindLabel === 'session'
          ? 'session'
          : paymentKindLabel.includes('khóa')
            ? 'course'
            : 'monthly';
      const discount = numberValue(getByAliases(record, ['giamgiavnd', 'giamgia', 'discount']));
      const rawCourseFee = numberValue(
        getByAliases(record, ['hocphikhoavnd', 'hocphikhoa', 'coursefee']),
      );
      const rawMonthlyFee = numberValue(
        getByAliases(record, ['hocphithangvnd', 'hocphithang', 'monthlyfee']),
      );
      // The inactive price is intentional audit context when a receipt is
      // reclassified. Keep both columns exactly as the workbook provides; the
      // selected payment kind alone controls revenue/debt categorisation.
      const courseFee =
        paymentKind === 'course'
          ? rawCourseFee || paidAmount + debtAmount + discount
          : rawCourseFee;
      const monthlyFee =
        paymentKind === 'monthly'
          ? rawMonthlyFee || paidAmount + debtAmount + discount
          : rawMonthlyFee;
      const rawBillingPeriod = cellText(
        getByAliases(record, ['kyhocphi', 'billingperiod', 'period']),
      ).trim();
      const billingPeriod =
        paymentKind === 'course' || paymentKind === 'session'
          ? rawBillingPeriod ||
            `Khóa ${monthKey(isoDate(getByAliases(record, ['ngaythu', 'paymentdate'])))}`
          : /^\d{4}-\d{2}$/.test(rawBillingPeriod)
            ? rawBillingPeriod
            : monthKey(
                isoDate(rawBillingPeriod || getByAliases(record, ['ngaythu', 'paymentdate'])),
              );
      const receiptStatus: TuitionReceipt['status'] =
        debtAmount > 0 ? (paidAmount > 0 ? 'partial' : 'debt') : paidAmount > 0 ? 'paid' : 'unpaid';
      const paymentMethod = cellText(getByAliases(record, ['hinhthuc', 'paymentmethod']));
      const normalizedPaymentMethod: TuitionReceipt['paymentMethod'] =
        paymentMethod === 'Tiền mặt' || paymentMethod === 'Chuyển khoản' || paymentMethod === 'Thẻ'
          ? paymentMethod
          : 'Chưa xác định';
      return {
        id: `RCPT-IMP-${String(index + 1).padStart(3, '0')}`,
        code: cellText(getByAliases(record, ['maphieu', 'receiptcode'])) || `IMP-${index + 1}`,
        studentId,
        classId:
          classes.find(
            (classroom) =>
              classroom.code === cellText(getByAliases(record, ['malop', 'classcode'])),
          )?.id ||
          student?.classId ||
          '',
        courseFee,
        monthlyFee,
        paymentKind,
        sessionFee:
          paymentKind === 'session'
            ? numberValue(getByAliases(record, ['hocphibuoivnd']))
            : undefined,
        sessionLines:
          paymentKind === 'session'
            ? JSON.parse(cellText(getByAliases(record, ['chitietbuoijson'])) || '[]')
            : undefined,
        billingPeriod,
        dueDate: optionalDate(getByAliases(record, ['hanthanhtoan'])),
        discount,
        paidAmount,
        debtAmount,
        status: receiptStatus,
        paymentDate: isoDate(getByAliases(record, ['ngaythu', 'paymentdate'])),
        collectorName: cellText(getByAliases(record, ['nguoithu', 'collectorname'])),
        paymentMethod: normalizedPaymentMethod,
        notes: cellText(getByAliases(record, ['ghichu', 'notes'])),
        invoiceNo: cellText(getByAliases(record, ['sohoadonshd', 'sohoadon', 'invoiceno'])) || undefined,
        bookNo: cellText(getByAliases(record, ['quyenso', 'bookno'])) || undefined,
        invoiceBook: cellText(getByAliases(record, ['shdquyen', 'invoicebook'])) || undefined,
      };
    })
    .filter((receipt) => studentIds.has(receipt.studentId));

  const receipts: TuitionReceipt[] = [];
  const groupedByBaseCode = new Map<string, TuitionReceipt[]>();
  rawReceipts.forEach((rc) => {
    const match = rc.code.match(/^(.*?)(?:\/Đ|\/D|-D|-Đ)(\d+)$/i);
    const baseCode = match ? match[1].trim() : rc.code.trim();
    if (!groupedByBaseCode.has(baseCode)) {
      groupedByBaseCode.set(baseCode, []);
    }
    groupedByBaseCode.get(baseCode)!.push(rc);
  });

  const invalidGroups = [...groupedByBaseCode.entries()].filter(
    ([, group]) =>
      group.length > 1 &&
      (new Set(
        group.map((receipt) =>
          JSON.stringify([
            receipt.studentId,
            receipt.classId,
            receipt.paymentKind,
            receipt.billingPeriod,
            receipt.sessionLines,
          ]),
        ),
      ).size > 1 ||
        group.some((receipt) => !/(?:\/Đ|\/D|-D|-Đ)\d+$/i.test(receipt.code)) ||
        new Set(group.map((receipt) => receipt.code)).size !== group.length),
  );
  if (invalidGroups.length)
    return {
      errors: [
        {
          row: 0,
          field: 'HỌC PHÍ',
          message: `Mã phiếu trùng hoặc các đợt thu không cùng học viên/lớp/kỳ: ${invalidGroups.map(([code]) => code).join(', ')}. Đã dừng nhập để không cộng nhầm học phí.`,
        },
      ],
    };

  groupedByBaseCode.forEach((group, baseCode) => {
    if (group.length === 1) {
      receipts.push(group[0]);
    } else {
      group.sort(
        (a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.code.localeCompare(b.code),
      );
      const first = group[0];
      const last = group[group.length - 1];
      const totalPaid = group.reduce((sum, r) => sum + r.paidAmount, 0);
      const totalCourseFee = Math.max(...group.map((r) => r.courseFee));
      const totalMonthlyFee = Math.max(...group.map((r) => r.monthlyFee || 0));
      const finalDebt = last.debtAmount;
      const finalStatus: TuitionReceipt['status'] =
        finalDebt > 0 ? (totalPaid > 0 ? 'partial' : 'debt') : 'paid';

      receipts.push({
        ...first,
        code: baseCode,
        courseFee: totalCourseFee,
        monthlyFee: totalMonthlyFee,
        sessionFee:
          first.paymentKind === 'session'
            ? Math.max(...group.map((r) => r.sessionFee || 0))
            : undefined,
        discount: group.reduce((sum, r) => sum + r.discount, 0),
        paidAmount: totalPaid,
        debtAmount: finalDebt,
        status: finalStatus,
        paymentDate: last.paymentDate,
        invoiceNo: last.invoiceNo,
        bookNo: last.bookNo,
        invoiceBook: last.invoiceBook,
        notes: group
          .map((r) => r.notes)
          .filter(Boolean)
          .join(' | '),
        installments: group.map((r, idx) => ({
          id: `INST_IMP_${baseCode}_${idx + 1}`,
          code: r.code,
          date: r.paymentDate,
          amount: r.paidAmount,
          paymentMethod: r.paymentMethod,
          collectorName: r.collectorName,
          invoiceNo: r.invoiceNo,
          bookNo: r.bookNo,
          invoiceBook: r.invoiceBook,
          notes: r.notes || `Đóng học phí đợt ${idx + 1}`,
        })),
      });
    }
  });

  const duplicateReceiptCodes = duplicatedValues(receipts.map((receipt) => receipt.code));
  if (duplicateReceiptCodes.length > 0) {
    return {
      errors: [
        {
          row: 0,
          field: 'Mã phiếu thu',
          message: `Trùng mã phiếu thu: ${duplicateReceiptCodes.join(', ')}. Mỗi phiếu thu phải có một mã duy nhất.`,
        },
      ],
    };
  }
  masterDirectPayments.forEach((directPayment, studentId) => {
    const student = students.find((item) => item.id === studentId);
    if (!student) return;
    const totalDue = directPayment.paidAmount + directPayment.debtAmount;
    receipts.push({
      id: `RCPT-IMP-DIRECT-${studentId}`,
      code: `NHAP-HS-${student.code}`,
      studentId,
      classId: student.classId,
      courseFee: directPayment.paymentKind === 'course' ? totalDue : 0,
      monthlyFee: directPayment.paymentKind === 'monthly' ? totalDue : 0,
      paymentKind: directPayment.paymentKind,
      billingPeriod: directPayment.billingPeriod,
      discount: 0,
      paidAmount: directPayment.paidAmount,
      debtAmount: directPayment.debtAmount,
      status:
        directPayment.debtAmount > 0 ? (directPayment.paidAmount > 0 ? 'partial' : 'debt') : 'paid',
      paymentDate: directPayment.paymentDate,
      collectorName: 'Nhập từ Excel',
      paymentMethod: directPayment.paymentMethod,
      notes: 'Khoản thu nhập trực tiếp tại sheet HỌC SINH.',
    });
  });
  students.forEach((student) => {
    const studentReceipts = withUnbilledSessionReceipts(receipts, attendanceSessions).filter(
      (receipt) => receipt.studentId === student.id,
    );
    student.feeStatus = feeStatusForReceipts(studentReceipts);
  });

  return { data: { receipts, attendanceSessions } };
}
