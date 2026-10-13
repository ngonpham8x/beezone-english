import {
  AccountAuditLog,
  ActivityLog,
  AttendanceSession,
  CenterSettings,
  ClassRoom,
  CourseProgram,
  Grade,
  Room,
  Student,
  SystemBackup,
  Teacher,
  TimetableSlot,
  TuitionReceipt
} from '../types';

export const initialSettings: CenterSettings = {
  name: 'Anh Ngữ BeeZone',
  slogan: 'Học tiếng Anh thật vui - Bé tự tin mỗi ngày!',
  address: '111 Ngô Quyền, Long Hải, Trường Tây, Hòa Thành, Tây Ninh',
  phone: '0847 563 679 - 098 440 6157',
  email: 'beezone.englishcenter@gmail.com',
  secondaryEmail: 'chauoaingua679@gmail.com',
  adminReportEmail: 'beezone.englishcenter@gmail.com',
  autoEmailReport: false,
  autoBackup: false,
  sheetsConfig: { spreadsheetId: '', sheetName: '', autoSync: false, syncInterval: 'weekly', connected: false }
};

export const initialPrograms: CourseProgram[] = [
  {
    id: 'PROG-KIDDY',
    code: 'BEE-KIDDY',
    name: 'Tiếng Anh Mầm Non',
    category: 'Cambridge',
    tuitionFee: 2400000,
    description: 'Dành cho các bạn ở độ tuổi từ 3 tuổi – 6 tuổi. Học qua trò chơi, bài hát, hình ảnh sinh động. Phát triển Nghe – Nói – Phản xạ tự nhiên trong môi trường vui vẻ, thân thiện.'
  },
  {
    id: 'PROG-STARTERS',
    code: 'BEE-STARTERS',
    name: 'Cambridge Starters',
    category: 'Cambridge',
    tuitionFee: 2800000,
    description: 'Dành cho học viên 6 – 7 tuổi. Chương trình Cambridge chuẩn quốc tế kết hợp giáo viên nước ngoài. Phát triển toàn diện 4 kỹ năng Nghe – Nói – Đọc – Viết.'
  },
  {
    id: 'PROG-BEE-PRI',
    code: 'BEE-PRIMARY',
    name: 'Tiếng Anh Tiểu Học (Bee 1 - 2)',
    category: 'Family and Friends',
    tuitionFee: 2600000,
    description: 'Sách Family and Friends cho học sinh Lớp 1 (6–7 tuổi) và Lớp 2 (7–8 tuổi). Củng cố từ vựng, ngữ pháp và rèn luyện phản xạ giao tiếp tự tin.'
  },
  {
    id: 'PROG-BEE-JUN',
    code: 'BEE-JUNIOR',
    name: 'Tiếng Anh Tiểu Học (Bee 3 - 4)',
    category: 'Family and Friends',
    tuitionFee: 2800000,
    description: 'Sách Family and Friends cho học sinh Lớp 3 và Lớp 4 (Học tại 2 cơ sở: Bùi Thị Xuân & Nguyễn Du). Củng cố ngữ pháp – từ vựng – phát triển 4 kỹ năng Nghe – Nói – Đọc – Viết.'
  },
  {
    id: 'PROG-BEE-STAR',
    code: 'BEE-DANCE',
    name: 'Nhảy Hiện Đại Trẻ Em',
    category: 'Kỹ Năng & Thể Chất',
    tuitionFee: 450000,
    description: 'Lớp nhảy hiện đại cho trẻ em (Kids). Phát triển thể chất, tự tin tỏa sáng, giao tiếp tốt, đam mê âm nhạc & vũ đạo. Học phí 450.000đ/tháng (8 buổi).'
  }
];

export const initialTeachers: Teacher[] = [
  {
    id: 'TEA-001',
    name: 'Mr. David Miller',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    phone: '0912 345 678',
    email: 'david.miller@beezone.edu.vn',
    address: 'Quận 1, TP. Hồ Chí Minh',
    specialty: 'Giáo viên Cambridge & Bee Stars Dance Crew',
    assignedClassIds: ['CLS-STARTERS-1', 'CLS-BEE-4', 'CLS-BEE-STAR'],
    notes: 'Giáo viên bản ngữ có chứng chỉ quốc tế, phụ trách lớp Cambridge Starters và Bee Stars.'
  },
  {
    id: 'TEA-002',
    name: 'Cô Nguyễn Thị Mai Anh',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150',
    phone: '0933 456 789',
    email: 'maianh.nguyen@beezone.edu.vn',
    address: 'Trường Tây, Hòa Thành, Tây Ninh',
    specialty: 'Tiếng Anh Mầm Non & Cambridge Starters, TESOL Master',
    assignedClassIds: ['CLS-KIDDY-1', 'CLS-STARTERS-1'],
    notes: 'Thạc sĩ TESOL, phương pháp dạy qua bài hát & trò chơi, rất yêu trẻ và nhiệt huyết.'
  },
  {
    id: 'TEA-003',
    name: 'Thầy Trần Hoàng Nam',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    phone: '0988 777 666',
    email: 'nam.tran@beezone.edu.vn',
    address: 'Trường Tây, Hòa Thành, Tây Ninh',
    specialty: 'Giáo trình Family and Friends Tiểu Học',
    assignedClassIds: ['CLS-BEE-1', 'CLS-BEE-2', 'CLS-BEE-3'],
    notes: 'Kinh nghiệm dày dặn với bộ giáo trình Family and Friends cho học sinh tiểu học.'
  }
];

export const initialRooms: Room[] = [
  {
    id: 'ROOM-101',
    name: 'Phòng Smart Classroom 101',
    capacity: 20,
    status: 'available',
    notes: 'Trang bị bảng tương tác thông minh, điều hòa hai chiều, loa trợ giảng.'
  },
  {
    id: 'ROOM-102',
    name: 'Phòng Nghe Nhìn Lab 102',
    capacity: 24,
    status: 'available',
    notes: 'Trang bị 24 tai nghe chuyên dụng chống ồn và hệ thống máy chiếu sắc nét.'
  },
  {
    id: 'ROOM-201',
    name: 'Phòng Hoạt Động & Vũ Đạo 201',
    capacity: 20,
    status: 'available',
    notes: 'Phòng đa năng rộng rãi, gương vũ đạo lớn, sàn gỗ cao cấp, âm thanh chuyên nghiệp.'
  }
];

export const initialClasses: ClassRoom[] = [
  {
    id: 'CLS-KIDDY-1',
    code: 'KIDDY-1',
    name: 'Kiddy 1',
    programId: 'PROG-KIDDY',
    teacherId: 'TEA-002',
    roomId: 'ROOM-101',
    scheduleTime: 'Thứ 7: 17:00-18:30 · Chủ Nhật: 17:00-18:30',
    days: ['Thứ 7', 'Chủ Nhật'],
    capacity: 16,
    studentIds: ['STU-001', 'STU-002']
  },
  {
    id: 'CLS-BEE-1',
    code: 'BEE-1',
    name: 'Bee 1',
    programId: 'PROG-BEE-PRI',
    teacherId: 'TEA-003',
    roomId: 'ROOM-102',
    scheduleTime: 'Thứ 7: 07:30-09:00 · Chủ Nhật: 07:30-09:00',
    days: ['Thứ 7', 'Chủ Nhật'],
    capacity: 18,
    studentIds: ['STU-004']
  },
  {
    id: 'CLS-BEE-2',
    code: 'BEE-2',
    name: 'Bee 2',
    programId: 'PROG-BEE-PRI',
    teacherId: 'TEA-003',
    roomId: 'ROOM-102',
    scheduleTime: 'Thứ 7: 09:15-10:45 · Chủ Nhật: 09:15-10:45',
    days: ['Thứ 7', 'Chủ Nhật'],
    capacity: 18,
    studentIds: ['STU-005']
  },
  {
    id: 'CLS-BEE-3',
    code: 'BEE-3',
    name: 'Bee 3',
    programId: 'PROG-BEE-JUN',
    teacherId: 'TEA-003',
    roomId: 'ROOM-201',
    scheduleTime: 'Thứ 3: 17:00-18:30 · Thứ 5: 17:00-18:30',
    days: ['Thứ 3', 'Thứ 5'],
    capacity: 18,
    studentIds: ['STU-006']
  },
  {
    id: 'CLS-BEE-4',
    code: 'BEE-4',
    name: 'Bee 4',
    programId: 'PROG-BEE-JUN',
    teacherId: 'TEA-001',
    roomId: 'ROOM-201',
    scheduleTime: 'Thứ 3: 18:30-20:00 · Thứ 5: 18:30-20:00',
    days: ['Thứ 3', 'Thứ 5'],
    capacity: 18,
    studentIds: ['STU-007']
  },
  {
    id: 'CLS-STARTERS-1',
    code: 'STARTERS-1',
    name: 'Starters 1',
    programId: 'PROG-STARTERS',
    teacherId: 'TEA-002',
    roomId: 'ROOM-101',
    scheduleTime: 'Thứ 7: 15:00-16:30 · Chủ Nhật: 15:00-16:30',
    days: ['Thứ 7', 'Chủ Nhật'],
    capacity: 16,
    studentIds: ['STU-003', 'STU-012']
  },
  {
    id: 'CLS-BEE-STAR',
    code: 'BEE-STAR',
    name: 'Bee Stars',
    programId: 'PROG-BEE-STAR',
    teacherId: 'TEA-001',
    roomId: 'ROOM-201',
    scheduleTime: 'Thứ 2: 09:00-10:00 · Thứ 4: 09:00-10:00',
    days: ['Thứ 2', 'Thứ 4'],
    capacity: 20,
    studentIds: ['STU-008', 'STU-010']
  }
];

export const initialStudents: Student[] = [
  {
    id: 'STU-001',
    code: 'HS-001',
    name: 'Nguyễn Văn Minh Khang',
    dob: '2021-05-12',
    gender: 'Nam',
    school: 'Mầm non Họa Mi',
    gradeLevel: 'Mầm non (3–6 tuổi)',
    programId: 'PROG-KIDDY',
    classId: 'CLS-KIDDY-1',
    address: '12 Võ Thị Sáu, P.3, TP. Tây Ninh',
    email: 'khang.nguyen@gmail.com',
    phone: '0903 111 222',
    parentName: 'Nguyễn Văn Hùng',
    parentPhone: '0903 111 222',
    enrollDate: '2026-06-01',
    status: 'active',
    feeStatus: 'paid',
    notes: 'Lớp Kiddy 1 (T7, CN 17:00-18:30). Nhanh nhẹn, phát âm chuẩn qua Flashcards & bài hát.'
  },
  {
    id: 'STU-002',
    code: 'HS-002',
    name: 'Trần Lê Bảo Châu',
    dob: '2022-08-20',
    gender: 'Nữ',
    school: 'Mầm non Vàng Anh',
    gradeLevel: 'Mầm non (3–6 tuổi)',
    programId: 'PROG-KIDDY',
    classId: 'CLS-KIDDY-1',
    address: '45 Cách Mạng Tháng Tám, P.1, TP. Tây Ninh',
    email: 'chautran@gmail.com',
    phone: '0918 333 444',
    parentName: 'Lê Thị Thu Thảo',
    parentPhone: '0918 333 444',
    enrollDate: '2026-06-05',
    status: 'active',
    feeStatus: 'paid',
    notes: 'Lớp Kiddy 1 (T7, CN 17:00-18:30). Phản xạ tự nhiên, rất yêu thích giờ học tiếng Anh.'
  },
  {
    id: 'STU-003',
    code: 'HS-003',
    name: 'Phạm Gia Bảo',
    dob: '2019-02-14',
    gender: 'Nam',
    school: 'Tiểu học Kim Đồng',
    gradeLevel: 'Lớp 1 (6–7 tuổi)',
    programId: 'PROG-STARTERS',
    classId: 'CLS-STARTERS-1',
    address: '78 Hoàng Lê Kha, P.3, TP. Tây Ninh',
    email: 'giabao.pham@gmail.com',
    phone: '0977 555 666',
    parentName: 'Phạm Minh Tuấn',
    parentPhone: '0977 555 666',
    enrollDate: '2026-06-10',
    status: 'active',
    feeStatus: 'partial',
    notes: 'Lớp Starters 1 (T7, CN 15:00-16:30). Cambridge chuẩn quốc tế. Còn nợ 800.000đ học phí đợt 2.'
  },
  {
    id: 'STU-004',
    code: 'HS-004',
    name: 'Hoàng Vũ Thùy Trang',
    dob: '2020-03-10',
    gender: 'Nữ',
    school: 'Tiểu học Bùi Thị Xuân',
    gradeLevel: 'Lớp 1 (6–7 tuổi)',
    programId: 'PROG-BEE-PRI',
    classId: 'CLS-BEE-1',
    address: '22 Lạc Long Quân, P.4, TP. Tây Ninh',
    email: 'thuytrang.ielts@gmail.com',
    phone: '0945 888 999',
    parentName: 'Vũ Thị Minh',
    parentPhone: '0945 888 999',
    enrollDate: '2026-05-15',
    status: 'active',
    feeStatus: 'paid',
    notes: 'Lớp Bee 1 (T7, CN 07:30-09:00). Giáo trình Family and Friends Lớp 1.'
  },
  {
    id: 'STU-005',
    code: 'HS-005',
    name: 'Đặng Tuấn Kiệt',
    dob: '2019-11-25',
    gender: 'Nam',
    school: 'Tiểu học Nguyễn Du',
    gradeLevel: 'Lớp 2 (7–8 tuổi)',
    programId: 'PROG-BEE-PRI',
    classId: 'CLS-BEE-2',
    address: '89 Trương Tùng Quân, P.3, TP. Tây Ninh',
    email: 'tuankiet.dang@gmail.com',
    phone: '0939 123 789',
    parentName: 'Đặng Văn Đức',
    parentPhone: '0939 123 789',
    enrollDate: '2026-05-20',
    status: 'active',
    feeStatus: 'paid',
    notes: 'Lớp Bee 2 (T7, CN 09:15-10:45). Giáo trình Family and Friends Lớp 2.'
  },
  {
    id: 'STU-006',
    code: 'HS-006',
    name: 'Lê Nguyễn Hoàng Phúc',
    dob: '2018-07-08',
    gender: 'Nam',
    school: 'Tiểu học Bùi Thị Xuân',
    gradeLevel: 'Lớp 3',
    programId: 'PROG-BEE-JUN',
    classId: 'CLS-BEE-3',
    address: '34 Nguyễn Thái Học, P.2, TP. Tây Ninh',
    email: 'hoangphuc.le@gmail.com',
    phone: '0909 654 321',
    parentName: 'Nguyễn Thị Hoa',
    parentPhone: '0909 654 321',
    enrollDate: '2026-06-01',
    status: 'active',
    feeStatus: 'paid',
    notes: 'Lớp Bee 3 (T3, T5 17:00-18:30). Sách Family and Friends Lớp 3, cơ sở Trường Bùi Thị Xuân.'
  },
  {
    id: 'STU-007',
    code: 'HS-007',
    name: 'Bùi Thị Thanh Hương',
    dob: '2017-09-15',
    gender: 'Nữ',
    school: 'Tiểu học Nguyễn Du',
    gradeLevel: 'Lớp 4',
    programId: 'PROG-BEE-JUN',
    classId: 'CLS-BEE-4',
    address: '56 Châu Văn Liêm, P.Hiệp Tân, TX. Hòa Thành',
    email: 'thanhhuong.bank@gmail.com',
    phone: '0982 111 888',
    parentName: 'Bùi Văn Hậu',
    parentPhone: '0982 111 888',
    enrollDate: '2026-07-01',
    status: 'active',
    feeStatus: 'paid',
    notes: 'Lớp Bee 4 (T3, T5 18:30-20:00). Sách Family and Friends Lớp 4, cơ sở Trường Nguyễn Du.'
  },
  {
    id: 'STU-008',
    code: 'HS-008',
    name: 'Ngô Quốc Bảo',
    dob: '2018-12-04',
    gender: 'Nam',
    school: 'Tiểu học Trường Tây',
    gradeLevel: 'Kids',
    programId: 'PROG-BEE-STAR',
    classId: 'CLS-BEE-STAR',
    address: '101 Bời Lời, P.Ninh Sơn, TP. Tây Ninh',
    email: 'quocbao.tech@gmail.com',
    phone: '0966 222 333',
    parentName: 'Ngô Văn Thành',
    parentPhone: '0966 222 333',
    enrollDate: '2026-07-05',
    status: 'active',
    feeStatus: 'paid',
    notes: 'Lớp Nhảy Hiện Đại Bee Stars Dance Crew (T2, T4 09:00-10:00). Phát triển thể chất & năng khiếu âm nhạc.'
  },
  {
    id: 'STU-009',
    code: 'TS-001',
    name: 'Phan Minh Khang',
    dob: '2019-09-12',
    gender: 'Nam',
    school: 'Tiểu học Lê Văn Tám',
    gradeLevel: 'Lớp 1 (6–7 tuổi)',
    programId: 'PROG-STARTERS',
    classId: '',
    address: '112 Nguyễn Du, TP. Tây Ninh',
    email: 'minhkhang.parent@gmail.com',
    phone: '0978 123 456',
    parentName: 'Phan Văn Dũng',
    parentPhone: '0978 123 456',
    enrollDate: '2026-10-01',
    status: 'lead',
    feeStatus: 'unpaid',
    notes: 'Phụ huynh quan tâm chương trình Starters 1 Cambridge (T7, CN 15:00-16:30).'
  },
  {
    id: 'STU-010',
    code: 'TS-002',
    name: 'Võ Ngọc Diệp',
    dob: '2019-11-20',
    gender: 'Nữ',
    school: 'Tiểu học Bùi Thị Xuân',
    gradeLevel: 'Kids',
    programId: 'PROG-BEE-STAR',
    classId: 'CLS-BEE-STAR',
    address: '54 Lý Thường Kiệt, TX. Hòa Thành',
    email: 'ngocdiep.vo@gmail.com',
    phone: '0933 654 987',
    parentName: 'Võ Văn Long',
    parentPhone: '0933 654 987',
    enrollDate: '2026-10-05',
    status: 'trial',
    feeStatus: 'unpaid',
    notes: 'Đăng ký trải nghiệm MIỄN PHÍ lớp nhảy hiện đại Bee Stars Thứ 5, 6 (15:30-16:30).'
  },
  {
    id: 'STU-011',
    code: 'TS-003',
    name: 'Lâm Hoàng Anh',
    dob: '2018-04-18',
    gender: 'Nam',
    school: 'Tiểu học Nguyễn Du',
    gradeLevel: 'Lớp 3',
    programId: 'PROG-BEE-JUN',
    classId: '',
    address: '77 Huỳnh Tấn Phát, TP. Tây Ninh',
    email: 'hoanganh.lam@gmail.com',
    phone: '0888 999 111',
    parentName: 'Lâm Văn Thắng',
    parentPhone: '0888 999 111',
    enrollDate: '2026-10-08',
    status: 'registered',
    feeStatus: 'unpaid',
    notes: 'Đã đăng ký chính thức, chờ xếp lớp Bee 3 (T3, T5 17:00-18:30) giáo trình Family and Friends.'
  },
  {
    id: 'STU-012',
    code: 'HS-009',
    name: 'Huỳnh Thanh Trúc',
    dob: '2019-03-08',
    gender: 'Nữ',
    school: 'Tiểu học Kim Đồng',
    gradeLevel: 'Lớp 1 (6–7 tuổi)',
    programId: 'PROG-STARTERS',
    classId: 'CLS-STARTERS-1',
    address: '29 Trương Quyền, P.2, TP. Tây Ninh',
    email: 'truchuynh@gmail.com',
    phone: '0907 888 222',
    parentName: 'Huỳnh Văn Sang',
    parentPhone: '0907 888 222',
    enrollDate: '2026-06-01',
    status: 'reserved',
    feeStatus: 'paid',
    notes: 'Đã đóng học phí đầy đủ lớp Starters 1. [BẢO LƯU]: Từ 2026-09-15 đến 2026-12-01. Lý do: Bận lịch thi đấu cờ vua cấp tỉnh.'
  }
];

export const initialTimetableSlots: TimetableSlot[] = [
  // 1. Kiddy 1: 3–6 tuổi, Thứ 7, Chủ Nhật (17:00 – 18:30)
  { id: 'SLOT-01', classId: 'CLS-KIDDY-1', teacherId: 'TEA-002', roomId: 'ROOM-101', dayOfWeek: 'Thứ 7', startTime: '17:00', endTime: '18:30' },
  { id: 'SLOT-02', classId: 'CLS-KIDDY-1', teacherId: 'TEA-002', roomId: 'ROOM-101', dayOfWeek: 'Chủ Nhật', startTime: '17:00', endTime: '18:30' },

  // 2. Bee 1: Lớp 1 (6–7 tuổi), Thứ 7, Chủ Nhật (07:30 – 09:00)
  { id: 'SLOT-03', classId: 'CLS-BEE-1', teacherId: 'TEA-003', roomId: 'ROOM-102', dayOfWeek: 'Thứ 7', startTime: '07:30', endTime: '09:00' },
  { id: 'SLOT-04', classId: 'CLS-BEE-1', teacherId: 'TEA-003', roomId: 'ROOM-102', dayOfWeek: 'Chủ Nhật', startTime: '07:30', endTime: '09:00' },

  // 3. Bee 2: Lớp 2 (7–8 tuổi), Thứ 7, Chủ Nhật (09:15 – 10:45)
  { id: 'SLOT-05', classId: 'CLS-BEE-2', teacherId: 'TEA-003', roomId: 'ROOM-102', dayOfWeek: 'Thứ 7', startTime: '09:15', endTime: '10:45' },
  { id: 'SLOT-06', classId: 'CLS-BEE-2', teacherId: 'TEA-003', roomId: 'ROOM-102', dayOfWeek: 'Chủ Nhật', startTime: '09:15', endTime: '10:45' },

  // 4. Starters 1: 6–7 tuổi, Thứ 7, Chủ Nhật (15:00 – 16:30)
  { id: 'SLOT-07', classId: 'CLS-STARTERS-1', teacherId: 'TEA-002', roomId: 'ROOM-101', dayOfWeek: 'Thứ 7', startTime: '15:00', endTime: '16:30' },
  { id: 'SLOT-08', classId: 'CLS-STARTERS-1', teacherId: 'TEA-002', roomId: 'ROOM-101', dayOfWeek: 'Chủ Nhật', startTime: '15:00', endTime: '16:30' },

  // 5. Bee 3: Học sinh Lớp 3, Thứ 3, Thứ 5 (17:00 – 18:30)
  { id: 'SLOT-09', classId: 'CLS-BEE-3', teacherId: 'TEA-003', roomId: 'ROOM-201', dayOfWeek: 'Thứ 3', startTime: '17:00', endTime: '18:30' },
  { id: 'SLOT-10', classId: 'CLS-BEE-3', teacherId: 'TEA-003', roomId: 'ROOM-201', dayOfWeek: 'Thứ 5', startTime: '17:00', endTime: '18:30' },

  // 6. Bee 4: Học sinh Lớp 4, Thứ 3, Thứ 5 (18:30 – 20:00)
  { id: 'SLOT-11', classId: 'CLS-BEE-4', teacherId: 'TEA-001', roomId: 'ROOM-201', dayOfWeek: 'Thứ 3', startTime: '18:30', endTime: '20:00' },
  { id: 'SLOT-12', classId: 'CLS-BEE-4', teacherId: 'TEA-001', roomId: 'ROOM-201', dayOfWeek: 'Thứ 5', startTime: '18:30', endTime: '20:00' },

  // 7. Bee Stars: Lớp Nhảy Hiện Đại Kids, Thứ 2, Thứ 4 (09:00 – 10:00) & Trải nghiệm Thứ 5, 6 (15:30 – 16:30)
  { id: 'SLOT-13', classId: 'CLS-BEE-STAR', teacherId: 'TEA-001', roomId: 'ROOM-201', dayOfWeek: 'Thứ 2', startTime: '09:00', endTime: '10:00' },
  { id: 'SLOT-14', classId: 'CLS-BEE-STAR', teacherId: 'TEA-001', roomId: 'ROOM-201', dayOfWeek: 'Thứ 4', startTime: '09:00', endTime: '10:00' },
  { id: 'SLOT-15', classId: 'CLS-BEE-STAR', teacherId: 'TEA-001', roomId: 'ROOM-201', dayOfWeek: 'Thứ 5', startTime: '15:30', endTime: '16:30' },
  { id: 'SLOT-16', classId: 'CLS-BEE-STAR', teacherId: 'TEA-001', roomId: 'ROOM-201', dayOfWeek: 'Thứ 6', startTime: '15:30', endTime: '16:30' }
];

export const initialGrades: Grade[] = [
  { id: 'G_STU-001', studentId: 'STU-001', classId: 'CLS-KIDDY-1', listening: 9.0, speaking: 8.5, reading: 8.0, writing: 8.5, midterm: 8.5, finalExam: 9.0, attendance: 10, average: 8.7 },
  { id: 'G_STU-002', studentId: 'STU-002', classId: 'CLS-KIDDY-1', listening: 8.0, speaking: 7.5, reading: 8.5, writing: 8.0, midterm: 8.0, finalExam: 8.5, attendance: 10, average: 8.2 },
  { id: 'G_STU-003', studentId: 'STU-003', classId: 'CLS-STARTERS-1', listening: 7.0, speaking: 7.0, reading: 7.5, writing: 6.5, midterm: 7.0, finalExam: 7.5, attendance: 9, average: 7.2 },
  { id: 'G_STU-004', studentId: 'STU-004', classId: 'CLS-BEE-1', listening: 8.5, speaking: 7.5, reading: 8.5, writing: 7.0, midterm: 8.0, finalExam: 8.5, attendance: 10, average: 8.0 },
  { id: 'G_STU-005', studentId: 'STU-005', classId: 'CLS-BEE-2', listening: 9.0, speaking: 8.0, reading: 9.0, writing: 7.5, midterm: 8.5, finalExam: 9.0, attendance: 10, average: 8.6 },
  { id: 'G_STU-006', studentId: 'STU-006', classId: 'CLS-BEE-3', listening: 7.5, speaking: 7.0, reading: 7.5, writing: 6.5, midterm: 7.0, finalExam: 7.5, attendance: 10, average: 7.3 },
  { id: 'G_STU-007', studentId: 'STU-007', classId: 'CLS-BEE-4', listening: 8.0, speaking: 8.5, reading: 7.5, writing: 7.0, midterm: 8.0, finalExam: 8.0, attendance: 9.5, average: 8.0 },
  { id: 'G_STU-008', studentId: 'STU-008', classId: 'CLS-BEE-STAR', listening: 7.0, speaking: 6.5, reading: 7.0, writing: 6.5, midterm: 6.5, finalExam: 7.0, attendance: 8.0, average: 6.8 }
];

export const initialTuitionReceipts: TuitionReceipt[] = [
  {
    id: 'REC-001',
    code: 'PT-2026-001',
    studentId: 'STU-001',
    classId: 'CLS-KIDDY-1',
    courseFee: 2800000,
    paymentKind: 'course',
    discount: 200000,
    paidAmount: 2600000,
    debtAmount: 0,
    status: 'paid',
    paymentDate: '2026-06-01',
    collectorName: '',
    paymentMethod: 'Chuyển khoản',
    notes: 'Đóng trọn gói khóa Kiddy 1, giảm 200k ưu đãi đăng ký sớm.',
    installments: [
      {
        id: 'INST-001-1',
        date: '2026-06-01',
        amount: 2600000,
        paymentMethod: 'Chuyển khoản',
        collectorName: '',
        notes: 'Đóng trọn gói khóa Kiddy 1'
      }
    ]
  },
  {
    id: 'REC-002',
    code: 'PT-2026-002',
    studentId: 'STU-002',
    classId: 'CLS-KIDDY-1',
    courseFee: 2800000,
    paymentKind: 'course',
    discount: 0,
    paidAmount: 2800000,
    debtAmount: 0,
    status: 'paid',
    paymentDate: '2026-06-05',
    collectorName: '',
    paymentMethod: 'Tiền mặt',
    notes: 'Phụ huynh đóng tiền mặt trực tiếp tại quầy lễ tân lớp Kiddy 1.',
    installments: [
      {
        id: 'INST-002-1',
        date: '2026-06-05',
        amount: 2800000,
        paymentMethod: 'Tiền mặt',
        collectorName: '',
        notes: 'Đóng đủ tiền mặt'
      }
    ]
  },
  {
    id: 'REC-003',
    code: 'PT-2026-003',
    studentId: 'STU-003',
    classId: 'CLS-STARTERS-1',
    courseFee: 2800000,
    paymentKind: 'course',
    discount: 0,
    paidAmount: 2000000,
    debtAmount: 800000,
    status: 'partial',
    paymentDate: '2026-06-10',
    collectorName: '',
    paymentMethod: 'Chuyển khoản',
    notes: 'Đóng đợt 1 là 2.000.000đ, còn nợ 800.000đ lớp Starters 1 (có thể bấm Thu nợ để hoàn tất).',
    installments: [
      {
        id: 'INST-003-1',
        date: '2026-06-10',
        amount: 2000000,
        paymentMethod: 'Chuyển khoản',
        collectorName: '',
        notes: 'Đóng học phí đợt 1'
      }
    ]
  },
  {
    id: 'REC-004',
    code: 'PT-2026-004',
    studentId: 'STU-004',
    classId: 'CLS-BEE-1',
    courseFee: 6500000,
    paymentKind: 'course',
    discount: 500000,
    paidAmount: 6000000,
    debtAmount: 0,
    status: 'paid',
    paymentDate: '2026-05-15',
    collectorName: '',
    paymentMethod: 'Chuyển khoản',
    notes: 'Ưu đãi học viên cũ chuyển cấp lên lớp Bee 1.',
    installments: [
      {
        id: 'INST-004-1',
        date: '2026-05-15',
        amount: 6000000,
        paymentMethod: 'Chuyển khoản',
        collectorName: '',
        notes: 'Đóng trọn gói sau ưu đãi'
      }
    ]
  },
  {
    id: 'REC-005',
    code: 'PT-2026-005',
    studentId: 'STU-005',
    classId: 'CLS-BEE-2',
    courseFee: 6500000,
    paymentKind: 'course',
    discount: 0,
    paidAmount: 6500000,
    debtAmount: 0,
    status: 'paid',
    paymentDate: '2026-05-20',
    collectorName: '',
    paymentMethod: 'Chuyển khoản',
    notes: 'Đóng đủ trọn khóa Bee 2.',
    installments: [
      {
        id: 'INST-005-1',
        date: '2026-05-20',
        amount: 6500000,
        paymentMethod: 'Chuyển khoản',
        collectorName: '',
        notes: 'Đóng đủ trọn khóa'
      }
    ]
  },
  {
    id: 'REC-006',
    code: 'PT-2026-006',
    studentId: 'STU-006',
    classId: 'CLS-BEE-3',
    courseFee: 6500000,
    paymentKind: 'course',
    discount: 0,
    paidAmount: 6500000,
    debtAmount: 0,
    status: 'paid',
    paymentDate: '2026-06-01',
    collectorName: '',
    paymentMethod: 'Thẻ',
    notes: 'Quẹt thẻ POS tại trung tâm cho lớp Bee 3.',
    installments: [
      {
        id: 'INST-006-1',
        date: '2026-06-01',
        amount: 6500000,
        paymentMethod: 'Thẻ',
        collectorName: '',
        notes: 'Quẹt thẻ POS'
      }
    ]
  },
  {
    id: 'REC-007',
    code: 'PT-2026-007',
    studentId: 'STU-007',
    classId: 'CLS-BEE-4',
    courseFee: 3200000,
    paymentKind: 'course',
    discount: 0,
    paidAmount: 3200000,
    debtAmount: 0,
    status: 'paid',
    paymentDate: '2026-07-01',
    collectorName: '',
    paymentMethod: 'Chuyển khoản',
    notes: 'Học phí lớp Bee 4.',
    installments: [
      {
        id: 'INST-007-1',
        date: '2026-07-01',
        amount: 3200000,
        paymentMethod: 'Chuyển khoản',
        collectorName: '',
        notes: 'Đóng đủ học phí'
      }
    ]
  },
  {
    id: 'REC-008',
    code: 'PT-2026-008',
    studentId: 'STU-005',
    classId: 'CLS-BEE-2',
    courseFee: 4000000,
    paymentKind: 'course',
    billingPeriod: 'Khóa 08/2026–11/2026',
    discount: 0,
    paidAmount: 4000000,
    debtAmount: 0,
    status: 'paid',
    paymentDate: '2026-10-08',
    collectorName: '',
    paymentMethod: 'Chuyển khoản',
    notes: 'Học phí khóa Bee 2: 4.000.000đ: Đợt 1 (2tr tháng 08) + Đợt cuối (2tr tháng 10). Đã hoàn tất đóng đủ!',
    installments: [
      {
        id: 'INST-008-1',
        date: '2026-08-15',
        amount: 2000000,
        paymentMethod: 'Chuyển khoản',
        collectorName: '',
        notes: 'Đóng đợt 1 (2.000.000đ)'
      },
      {
        id: 'INST-008-2',
        date: '2026-10-08',
        amount: 2000000,
        paymentMethod: 'Chuyển khoản',
        collectorName: '',
        notes: 'Đóng học phí đợt cuối (2.000.000đ - ghi nhận doanh thu tháng 10)'
      }
    ]
  }
];

export const initialAttendanceSessions: AttendanceSession[] = [
  {
    id: 'ATT-001',
    classId: 'CLS-KIDDY-1',
    date: '2026-10-05',
    lessonTopic: 'Học tiếng Anh thật vui: Từ vựng các con vật & Bài hát Flashcards',
    teacherId: 'TEA-002',
    generalNotes: 'Cả lớp tiếp thu tốt, hào hứng tham gia trò chơi phát âm Flashcards.',
    entries: [
      { studentId: 'STU-001', status: 'present', homeworkCompleted: true, note: 'Phát biểu hăng hái, phát âm chuẩn âm cuối.' },
      { studentId: 'STU-002', status: 'present', homeworkCompleted: true, note: 'Tập trung nghe giảng, làm bài tập đầy đủ.' },
      { studentId: 'STU-003', status: 'late', homeworkCompleted: false, note: 'Đến muộn 15 phút do trời mưa.' }
    ]
  },
  {
    id: 'ATT-002',
    classId: 'CLS-BEE-STAR',
    date: '2026-10-06',
    lessonTopic: 'Bee Stars Dance Crew: Khởi động dẻo dai & Vũ đạo nhịp điệu Kids',
    teacherId: 'TEA-001',
    generalNotes: 'Các bé hào hứng nhảy theo nhạc sôi động, giữ đúng nhịp phách cơ bản.',
    entries: [
      { studentId: 'STU-008', status: 'present', homeworkCompleted: true, note: 'Động tác dứt khoát, cảm thụ âm nhạc rất tốt.' },
      { studentId: 'STU-010', status: 'present', homeworkCompleted: true, note: 'Buổi trải nghiệm nhảy rất tự tin, hòa nhập nhanh.' }
    ]
  }
];

export const initialBackups: SystemBackup[] = [
  {
    id: 'BAK-001',
    filename: 'Beezone_Backup_HeThong_2026-10-01.json',
    timestamp: '2026-10-01 22:00:00',
    sizeKb: 342,
    type: 'Tự động Hằng Tuần',
    status: 'Thành công'
  }
];

export const initialActivityLogs: ActivityLog[] = [
  {
    id: 'LOG-001',
    timestamp: '2026-10-05 08:30:15',
    userEmail: 'admin@beezone.edu.vn',
    userName: 'Chủ Trung Tâm',
    action: 'ĐĂNG NHẬP',
    module: 'Xác thực',
    details: 'Đăng nhập vào hệ thống quản lý trung tâm BEEZONE.'
  },
  {
    id: 'LOG-002',
    timestamp: '2026-10-05 17:35:20',
    userEmail: 'maianh.nguyen@beezone.edu.vn',
    userName: 'Cô Nguyễn Thị Mai Anh',
    action: 'THÊM',
    module: 'Điểm danh',
    details: 'Điểm danh buổi học Unit 3 lớp Starters A1.'
  }
];

export const initialAccountAuditLogs: AccountAuditLog[] = [
  {
    id: 'AUD-001',
    occurredAt: '2026-10-01T08:00:00Z',
    action: 'ACCOUNT_PROVISIONED',
    actorName: 'Hệ thống Quản Trị',
    targetName: 'Chủ Trung Tâm (beezone.englishcenter@gmail.com)',
    targetRole: 'owner',
    details: 'Khởi tạo tài khoản Quản trị trưởng hệ thống BeeZone English.'
  },
  {
    id: 'AUD-002',
    occurredAt: '2026-10-01T08:05:00Z',
    action: 'ACCOUNT_PROVISIONED',
    actorName: 'Chủ Trung Tâm',
    targetName: 'Quản Trị Viên (duyngonpham1980@gmail.com)',
    targetRole: 'owner',
    details: 'Cấp quyền Chủ trung tâm quản trị cơ sở BeeZone.'
  },
  {
    id: 'AUD-003',
    occurredAt: '2026-10-02T09:15:00Z',
    action: 'ACCOUNT_UPDATED',
    actorName: 'Chủ Trung Tâm',
    targetName: 'Nhân viên học vụ (thpttranphu.pt@gmail.com)',
    targetRole: 'staff',
    details: 'Cập nhật phân quyền học viên, học phí, điểm danh và xuất báo cáo.'
  }
];
