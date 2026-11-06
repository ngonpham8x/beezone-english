import type ExcelJS from 'exceljs';
import type { ClassRoom, CourseProgram, Student, TuitionReceipt } from '../../types';
import {
  cellText,
  duplicatedValues,
  getByAliases,
  isoDate,
  numberValue,
  paymentMethodFromCell,
  readRecords,
  statusFromLabel,
} from './readCells';
import { classSheetName, monthKey } from './styles';
import type { ImportStageResult, MasterDirectPaymentInput } from './types';

export function importStudents(
  workbook: ExcelJS.Workbook,
  classes: ClassRoom[],
  ensureProgram: (name: string) => CourseProgram,
): ImportStageResult<{
  students: Student[];
  masterDirectPayments: Map<string, MasterDirectPaymentInput>;
}> {
  const students: Student[] = [];
  const masterDirectPayments = new Map<string, MasterDirectPaymentInput>();
  const membershipErrors: { row: number; field: string; message: string }[] = [];
  const masterStudentsSheet = workbook.getWorksheet('HỌC SINH');
  if (masterStudentsSheet) {
    const masterRecords = readRecords(masterStudentsSheet, ['mahocsinh', 'hovaten']);
    masterRecords.forEach((record, index) => {
      const code = cellText(getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']));
      const name = cellText(getByAliases(record, ['hovaten', 'hoten', 'name']));
      const classCode = cellText(getByAliases(record, ['malop', 'classcode']));
      const classroom = classes.find((item) => item.code === classCode);
      if (!code || !name || !classroom) return;
      const extraValue = cellText(getByAliases(record, ['malophocthem', 'additionalclasscodes']));
      let additionalClassIds: string[] | undefined;
      if (extraValue) {
        try {
          const codes: unknown = extraValue.startsWith('[') ? JSON.parse(extraValue) : extraValue.split(';').map(value => value.trim()).filter(Boolean);
          if (!Array.isArray(codes) || codes.some(value => typeof value !== 'string')) throw new Error();
          additionalClassIds = codes.map(value => {
            const cls = classes.find(c => c.code === value);
            if (!cls || cls.id === classroom.id) throw new Error();
            return cls.id;
          });
          if (new Set(additionalClassIds).size !== additionalClassIds.length) throw new Error();
        } catch {
          membershipErrors.push({ row: index + 6, field: 'Mã lớp học thêm', message: 'Lớp học thêm phải tồn tại, không trùng nhau hoặc trùng lớp chính.' });
          return;
        }
      }
      const membershipClassIds = new Set([classroom.id, ...(additionalClassIds || [])]);
      const classStudentCodes: Record<string, string> = {};
      const classCodeValue = cellText(getByAliases(record, ['mahocvientheolop', 'classstudentcodes']));
      if (classCodeValue) {
        try {
          const parsed: unknown = JSON.parse(classCodeValue);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
          for (const [classReference, studentCode] of Object.entries(parsed)) {
            const referencedClass = classes.find((item) => item.code === classReference || item.id === classReference);
            if (!referencedClass || !membershipClassIds.has(referencedClass.id) || typeof studentCode !== 'string' || !studentCode.trim()) throw new Error();
            const prefix = `${referencedClass.code.trim()}-`;
            if (!studentCode.startsWith(prefix) || !/^\d+$/.test(studentCode.slice(prefix.length))) throw new Error();
            classStudentCodes[referencedClass.id] = studentCode.trim();
          }
        } catch {
          membershipErrors.push({ row: index + 6, field: 'Mã học viên theo lớp', message: 'Mã học viên theo lớp phải là JSON hợp lệ, đúng lớp và đúng tiền tố mã lớp.' });
          return;
        }
      }
      const primaryPrefix = `${classroom.code.trim()}-`;
      if (code.startsWith(primaryPrefix) && /^\d+$/.test(code.slice(primaryPrefix.length))) {
        classStudentCodes[classroom.id] = code;
      }
      const programName = cellText(getByAliases(record, ['chuongtrinh', 'program', 'programname']));
      const program = programName ? ensureProgram(programName) : null;
      if (program) classroom.programId = program.id;
      const id =
        cellText(getByAliases(record, ['idhethong', 'systemid'])) ||
        `STU-IMP-MASTER-${String(index + 1).padStart(3, '0')}`;
      students.push({
        id,
        code,
        name,
        nickname: cellText(getByAliases(record, ['bidanh', 'nickname'])) || undefined,
        accountStatus: cellText(getByAliases(record, ['captaikhoan', 'accountstatus'])) || undefined,
        dob: cellText(getByAliases(record, ['ngaysinh', 'dob'])),
        gender:
          cellText(getByAliases(record, ['gioitinh', 'gender'])) === 'Nam'
            ? 'Nam'
            : cellText(getByAliases(record, ['gioitinh', 'gender'])) === 'Nữ'
              ? 'Nữ'
              : 'Chưa xác định',
        school: cellText(getByAliases(record, ['truonghoc', 'truong', 'school'])),
        gradeLevel: cellText(getByAliases(record, ['khoilop', 'khoi', 'gradelevel'])),
        programId: program?.id || classroom.programId,
        classId: classroom.id,
        ...(additionalClassIds ? { additionalClassIds } : {}),
        ...(Object.keys(classStudentCodes).length ? { classStudentCodes } : {}),
        address: cellText(getByAliases(record, ['diachi', 'address'])),
        email: '',
        phone: cellText(getByAliases(record, ['sdthocsinh', 'phone'])),
        parentName: cellText(getByAliases(record, ['phuhuynh', 'tenphuhuynh', 'parentname'])),
        parentPhone: cellText(getByAliases(record, ['sdtphuhuynh', 'parentphone'])),
        enrollDate: '',
        notes: cellText(getByAliases(record, ['ghichu', 'notes'])),
        status: statusFromLabel(getByAliases(record, ['trangthai', 'status'])),
        feeStatus: 'unpaid',
      });
      const directPaidAmount = numberValue(
        getByAliases(record, ['dathunhaptructiepvnd', 'dathunhaptructiep', 'quickpaid']),
      );
      const directDebtAmount = numberValue(
        getByAliases(record, ['conlainhaptructiepvnd', 'conlainhaptructiep', 'connonhaptructiepvnd', 'connonhaptructiep', 'quickdebt']),
      );
      if (directPaidAmount > 0 || directDebtAmount > 0) {
        const directKindLabel = cellText(
          getByAliases(record, ['khoanthunhaptructiep', 'khoanthu', 'quickpaymentkind']),
        ).toLocaleLowerCase('vi-VN');
        const paymentKind: TuitionReceipt['paymentKind'] = directKindLabel.includes('khóa')
          ? 'course'
          : 'monthly';
        const paymentDate = isoDate(
          getByAliases(record, ['ngaythunhaptructiep', 'quickpaymentdate']),
        );
        const suppliedPeriod = cellText(
          getByAliases(record, ['kyhocphimockhoa', 'quickbillingperiod']),
        );
        masterDirectPayments.set(id, {
          paidAmount: directPaidAmount,
          debtAmount: directDebtAmount,
          paymentKind,
          billingPeriod:
            suppliedPeriod ||
            (paymentKind === 'course' ? `Khóa ${monthKey(paymentDate)}` : monthKey(paymentDate)),
          paymentDate,
          paymentMethod: paymentMethodFromCell(
            getByAliases(record, ['hinhthucnhaptructiep', 'quickpaymentmethod']),
          ),
        });
      }
      classroom.studentIds.push(id);
    });
  }

  if (!students.length)
    for (const classroom of classes) {
      const detailSheet = workbook.getWorksheet(classSheetName(classroom));
      if (!detailSheet) continue;
      const records = readRecords(detailSheet, ['mahocsinh', 'hovaten']);
      records.forEach((record, index) => {
        const id =
          cellText(getByAliases(record, ['idhethong', 'systemid'])) ||
          `STU-IMP-${classroom.id}-${String(index + 1).padStart(3, '0')}`;
        const code = cellText(getByAliases(record, ['mahocsinh', 'mahs', 'studentcode']));
        const name = cellText(getByAliases(record, ['hovaten', 'hoten', 'name']));
        if (!code || !name) return;
        students.push({
          id,
          code,
          name,
          dob: '',
          gender: 'Chưa xác định',
          school: '',
          gradeLevel: '',
          programId: classroom.programId,
          classId: classroom.id,
          address: cellText(getByAliases(record, ['diachi', 'address'])),
          email: '',
          phone: cellText(getByAliases(record, ['sdthocsinh', 'phone'])),
          parentName: '',
          parentPhone: cellText(getByAliases(record, ['sdtphuhuynh', 'parentphone'])),
          enrollDate: '',
          notes: 'Nhập từ báo cáo Excel.',
          status: statusFromLabel(getByAliases(record, ['trangthai', 'status'])),
          feeStatus: 'unpaid',
        });
        classroom.studentIds.push(id);
      });
    }
  if (membershipErrors.length) return { errors: membershipErrors };
  if (!students.length) {
    return {
      errors: [
        {
          row: 0,
          field: 'Sheet lớp',
          message: 'Không đọc được danh sách học sinh từ các sheet lớp.',
        },
      ],
    };
  }

  const duplicateStudentCodes = duplicatedValues(students.map((student) => student.code));
  const duplicateStudentIds = duplicatedValues(students.map((student) => student.id));
  if (duplicateStudentCodes.length > 0 || duplicateStudentIds.length > 0) {
    const details = [
      duplicateStudentCodes.length > 0 ? `mã học sinh: ${duplicateStudentCodes.join(', ')}` : '',
      duplicateStudentIds.length > 0 ? `ID hệ thống: ${duplicateStudentIds.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('; ');
    return {
      errors: [
        {
          row: 0,
          field: 'HỌC SINH',
          message: `Phát hiện dữ liệu trùng (${details}). Hãy sửa trùng lặp trước khi nhập để học phí và lớp không liên kết nhầm.`,
        },
      ],
    };
  }

  return { data: { students, masterDirectPayments } };
}
