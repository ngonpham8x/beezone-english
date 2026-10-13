import type ExcelJS from 'exceljs';
import { getReceiptInstallments } from '../../lib/tuition';
import type { TuitionReceipt } from '../../types';
import { classSheetName, receiptMonth } from './styles';
import type { ExcelExportData } from './types';
export function createExportContext(data: ExcelExportData, workbook: ExcelJS.Workbook) {
  // Revenue is recognised by the payment date of each installment or receipt.
  // Expand multi-installment receipts so that each installment appears in its respective month.
  const expandedReceipts: TuitionReceipt[] = [];
  data.receipts.forEach((receipt) => {
    receipt = {
      ...receipt,
      billingPeriod:
        receipt.billingPeriod ||
        (receipt.paymentKind === 'course'
          ? `Khóa ${receipt.paymentDate.slice(0, 4)}`
          : receipt.paymentDate.slice(0, 7)),
    };
    const installments = getReceiptInstallments(receipt);
    if (installments.length > 1) {
      installments.forEach((inst, idx) => {
        const isFirst = idx === 0;
        const isLast = idx === installments.length - 1;
        expandedReceipts.push({
          ...receipt,
          id: `${receipt.id}_inst_${idx + 1}`,
          code: `${receipt.code}/Đ${idx + 1}`,
          courseFee: isFirst ? receipt.courseFee : 0,
          monthlyFee: isFirst ? receipt.monthlyFee || 0 : 0,
          sessionFee:
            receipt.paymentKind === 'session' ? (isFirst ? receipt.sessionFee : 0) : undefined,
          discount: isFirst ? receipt.discount : 0,
          paidAmount: inst.amount,
          debtAmount: isLast ? receipt.debtAmount : 0,
          status: isLast ? receipt.status : 'paid',
          paymentDate: inst.date || receipt.paymentDate,
          paymentMethod: inst.paymentMethod || receipt.paymentMethod,
          collectorName: inst.collectorName || receipt.collectorName,
          notes: inst.notes || `Đóng học phí đợt ${idx + 1}`,
        });
      });
    } else {
      expandedReceipts.push(
        installments.length === 1
          ? { ...receipt, paymentDate: installments[0].date || receipt.paymentDate }
          : receipt,
      );
    }
  });

  const months = [...new Set(expandedReceipts.map(receiptMonth).filter(Boolean))].sort();
  const classSheetNames = new Map(
    data.classes.map((classroom) => [classroom.id, classSheetName(classroom)]),
  );
  const classById = new Map(data.classes.map((classroom) => [classroom.id, classroom]));
  const programById = new Map(data.programs.map((program) => [program.id, program]));
  const studentById = new Map(data.students.map((student) => [student.id, student]));
  const teacherById = new Map(data.teachers.map((teacher) => [teacher.id, teacher]));
  const roomById = new Map(data.rooms.map((room) => [room.id, room]));
  const orderedReceipts = [...expandedReceipts].sort((left, right) => {
    const leftClass = classById.get(left.classId)?.code || '';
    const rightClass = classById.get(right.classId)?.code || '';
    const leftStudent = studentById.get(left.studentId)?.code || '';
    const rightStudent = studentById.get(right.studentId)?.code || '';
    return (
      leftClass.localeCompare(rightClass, 'vi') ||
      leftStudent.localeCompare(rightStudent, 'vi') ||
      left.paymentDate.localeCompare(right.paymentDate) ||
      left.code.localeCompare(right.code)
    );
  });
  const firstReceiptRowByStudentId = new Map<string, number>();
  const firstReceiptRowByClassMonth = new Map<string, number>();
  orderedReceipts.forEach((receipt, index) => {
    const rowNumber = 6 + index;
    if (!firstReceiptRowByStudentId.has(receipt.studentId))
      firstReceiptRowByStudentId.set(receipt.studentId, rowNumber);
    const classMonthKey = `${receipt.classId}:${receiptMonth(receipt)}`;
    if (!firstReceiptRowByClassMonth.has(classMonthKey))
      firstReceiptRowByClassMonth.set(classMonthKey, rowNumber);
  });
  const firstReceiptLink = orderedReceipts.length ? "#'HỌC PHÍ'!A6" : "#'HỌC PHÍ'!A1";

  const studentSheetRowById = new Map<string, number>();
  return {
    data,
    workbook,
    months,
    classSheetNames,
    classById,
    programById,
    studentById,
    teacherById,
    roomById,
    orderedReceipts,
    firstReceiptRowByStudentId,
    firstReceiptRowByClassMonth,
    firstReceiptLink,
    studentSheetRowById,
  };
}
export type ExportContext = ReturnType<typeof createExportContext>;
