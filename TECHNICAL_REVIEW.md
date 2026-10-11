# 🔍 Kiểm Tra Kỹ Thuật & Xác Định Lỗi Auto-Reload

## 1. Phân Tích Hiện Trạng

### ✅ Những gì đã kiểm tra:
- **src/main.tsx**: Sạch, không có auto-reload
- **src/App.tsx** (1087 dòng):
  - ✓ Không có `window.location.reload()`
  - ✓ Không có `window.location.href = '/'`
  - ✓ Không gọi `location.reload()`
  - ✓ useEffect được quản lý đúng với cleanup functions

### ⚠️ Những điểm cần lưu ý trong App.tsx:

#### 1️⃣ **useEffect với Supabase Auth (dòng 338-445)**
```tsx
useEffect(() => {
  if (!supabase) return;

  let isMounted = true;
  const resolveSession = async (nextSession: Session | null) => {
    if (!isMounted) return;
    
    // Nhiều setState gọi liên tiếp
    setSession(nextSession);           // setState 1
    setCurrentUser(null/account);       // setState 2
    setIsCenterDataHydrated(false/true); // setState 3
    setCanSyncCenterData(false/true);  // setState 4
    setHasCenterData(false/true);      // setState 5
    // ... và hơn nữa
  };

  supabase.auth.getSession().then(({ data }) => resolveSession(data.session));
  const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
    void resolveSession(nextSession);
  });

  return () => {
    isMounted = false;
    listener.subscription.unsubscribe();
  };
}, []); // ✓ Dependencies: [] (chạy 1 lần)
```

**Đánh giá**: ✅ Tốt - Dependencies đúng, cleanup đúng

#### 2️⃣ **useEffect với dữ liệu Supabase Sync (dòng 447-459)**
```tsx
useEffect(() => {
  if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData || !hasCenterData) return;
  
  const payload: CenterDataPayload = { 
    settings, programs, teachers, rooms, classes, 
    students, timetableSlots, grades, receipts, backups, activityLogs 
  };
  
  const timer = window.setTimeout(() => {
    void supabase
      .from('center_data')
      .upsert({ id: 'primary', payload }, { onConflict: 'id' })
      .then(({ error }) => {
        if (error) console.error('Không thể đồng bộ dữ liệu trung tâm:', error.message);
      });
  }, 750);
  
  return () => window.clearTimeout(timer);
}, [settings, programs, teachers, rooms, classes, students, timetableSlots, grades, receipts, backups, activityLogs, currentUser, isCenterDataHydrated, canSyncCenterData, hasCenterData]);
```

**Đánh giá**: ⚠️ **NGUY HIỂM** - Quá nhiều dependencies, có thể gây:
- Timer được set → trigger save → state thay đổi → timer lại trigger
- Cố gắng sync 750ms mỗi khi state thay đổi

#### 3️⃣ **useEffect với activeTab (dòng 281-294)**
```tsx
useEffect(() => {
  if (currentUser && currentUser.role !== 'owner' && !canAccessTab(activeTab, currentUser)) 
    setActiveTab('dashboard');
}, [activeTab, currentUser]);

useEffect(() => {
  try {
    sessionStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', activeTab);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  } catch (error) {
    console.warn('Không thể lưu trang đang mở:', error);
  }
}, [activeTab]);
```

**Đánh giá**: ⚠️ Có thể có vòng lặp:
- setActiveTab → dependency thay đổi → setActiveTab lại được gọi

---

## 2. 🔴 Những Vấn Đề Tiềm Ẩn

### Vấn Đề 1: **Vòng lặp State với activeTab**

**Nguyên nhân**:
```
1. Component render lần 1 với activeTab = 'dashboard'
2. useEffect (dòng 281) chạy: kiểm tra quyền truy cập
3. Nếu user không có quyền, gọi setActiveTab('dashboard')
4. activeTab state thay đổi (dù giá trị giống nhau)
5. useEffect (dòng 281) trigger lại
6. ... lặp đi lặp lại
```

**Cách sửa**:
```tsx
// ❌ Sai - gọi setActiveTab trong effect
if (currentUser && currentUser.role !== 'owner' && !canAccessTab(activeTab, currentUser)) {
  setActiveTab('dashboard');
}

// ✅ Đúng - chỉ thay đổi khi thực sự cần
if (currentUser && currentUser.role !== 'owner' && !canAccessTab(activeTab, currentUser)) {
  // Chỉ setState nếu khác nhau
  if (activeTab !== 'dashboard') {
    setActiveTab('dashboard');
  }
}
```

### Vấn Đề 2: **Quá nhiều Dependencies trong Data Sync**

**Nguyên nhân**:
- Mỗi khi `receipts`, `students`, v.v thay đổi → useEffect trigger
- useEffect set timer 750ms → sau 750ms gọi `upsert()`
- Nếu state lại thay đổi trong 750ms → timer clear, timer mới được set
- → Có thể tạo vòng lặp indirectly

**Cách sửa**:
```tsx
// ✅ Tối ưu hóa dependencies
useEffect(() => {
  if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData || !hasCenterData) return;
  
  // Chỉ sync khi dữ liệu thực sự thay đổi, không phải mỗi component render
  const payload: CenterDataPayload = { 
    settings, programs, teachers, rooms, classes, 
    students, timetableSlots, grades, receipts, backups, activityLogs 
  };
  
  const timer = window.setTimeout(() => {
    void supabase.from('center_data').upsert({ id: 'primary', payload }, { onConflict: 'id' });
  }, 750);
  
  return () => window.clearTimeout(timer);
}, [
  // Chỉ giữ những dependencies quan trọng
  currentUser?.id, 
  isCenterDataHydrated, 
  canSyncCenterData, 
  hasCenterData,
  // Hoặc dùng JSON.stringify để so sánh payload
]);
```

### Vấn Đề 3: **Supabase Auth State Change Listener**

**Nguyên nhân tiềm ẩn**:
- `onAuthStateChange` có thể trigger multiple times
- Mỗi trigger → `resolveSession()` → multiple setState
- Nếu có lỗi trong resolveSession → state mất consistency

**Cách sửa**:
```tsx
// ✅ Thêm debounce hoặc check trước setState
const resolveSession = async (nextSession: Session | null) => {
  if (!isMounted) return;
  
  // Check xem session có thay đổi thực tế không
  if (nextSession?.user.id === session?.user.id) {
    console.log('Session không thay đổi, skip');
    return;
  }
  
  // Chỉ setState khi thực sự cần
  setSession(nextSession);
  // ... setState khác
};
```

---

## 3. 🛠️ Giải Pháp Tối Ưu

### Bước 1: Tích hợp Reload Detector
```tsx
// src/main.tsx
import { initReloadDetector, preventAutoReload } from './lib/reloadDebugger.ts';

// Chạy trước khi render
if (process.env.NODE_ENV === 'development') {
  initReloadDetector();
  preventAutoReload();
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);
```

### Bước 2: Cải Thiện useEffect trong App.tsx

**Sửa vòng lặp activeTab**:
```tsx
useEffect(() => {
  if (!currentUser || currentUser.role === 'owner') return;
  if (!canAccessTab(activeTab, currentUser) && activeTab !== 'dashboard') {
    setActiveTab('dashboard');
  }
}, [activeTab, currentUser]);
```

**Tối ưu data sync**:
```tsx
useEffect(() => {
  if (!supabase || !currentUser || !isCenterDataHydrated || !canSyncCenterData || !hasCenterData) return;
  
  const payload: CenterDataPayload = { 
    settings, programs, teachers, rooms, classes, 
    students, timetableSlots, grades, receipts, backups, activityLogs 
  };
  
  const timer = window.setTimeout(() => {
    void supabase.from('center_data').upsert({ id: 'primary', payload }, { onConflict: 'id' });
  }, 750);
  
  return () => window.clearTimeout(timer);
}, [currentUser?.id]); // ✅ Giảm dependencies
```

### Bước 3: Thêm Debug Logging
```tsx
// src/App.tsx
useEffect(() => {
  console.log('[App] Mounted - Auth status:', authStatus);
}, []);

useEffect(() => {
  console.log('[App] Auth status changed:', authStatus);
}, [authStatus]);

useEffect(() => {
  console.log('[App] Active tab changed:', activeTab);
}, [activeTab]);
```

---

## 4. 📋 Checklist Kiểm Tra

- [x] ✅ Không có `window.location.reload()`
- [x] ✅ Không có `window.location.href = '/'`
- [x] ✅ Đã sửa vòng lặp activeTab (chỉ setState khi activeTab !== 'dashboard')
- [x] ✅ Đã tối ưu dependencies và debouncing cho data sync (so sánh serialized payload trước khi upsert)
- [x] ✅ Đã xử lý Supabase auth token refresh không re-hydrate đè dữ liệu cục bộ
- [x] ✅ Đã tối ưu hàm reconcileClassStudentIds & reconcileTeacherAssignments giữ nguyên reference khi không có thay đổi
- [x] ✅ Đã tích hợp reload detector & safe handlers vào `src/main.tsx`
- [x] ✅ Đã tích hợp `DataConsistencyChecker` vào menu Sidebar, route `data-consistency`, và tab Cài đặt hệ thống
- [x] ✅ Đã cấu hình đa ngôn ngữ (Tiếng Việt & English) cho tính năng kiểm tra dữ liệu
- [x] ✅ Đã chạy type check `tsc --noEmit` và `npm run build` thành công 100%

---

## 5. 📊 Kết Luận

**Tình trạng**: ✅ **Hệ thống đã được cập nhật và chuẩn hóa toàn diện**

**Các hạng mục đã hoàn tất**:
1. ✅ **Chống Reload / Vòng lặp**: `reloadDebugger.ts` được tối ưu hóa chuẩn ES module và tích hợp vào `main.tsx`.
2. ✅ **Khắc phục triệt để nguy cơ vòng lặp render**: Sửa effect `activeTab`, tối ưu hóa `reconcileClassStudentIds` & `reconcileTeacherAssignments`.
3. ✅ **Tối ưu đồng bộ Supabase Cloud**: Nhận diện `TOKEN_REFRESHED` không gây hydration chồng chéo; chỉ upsert khi payload có thay đổi thực tế so với lần sync trước.
4. ✅ **Tích hợp DataConsistencyChecker**: Cho phép Chủ trung tâm quét và tự động sửa các liên kết không nhất quán (học viên - lớp học - học phí - chương trình học), xuất báo cáo chi tiết.

---

## 6. 💰 Ghi Nhận Doanh Thu Theo Tháng & Học Phí Theo Khóa Nhiều Đợt

### 🔍 Vấn đề người dùng phản ánh:
- Học viên đóng học phí theo khóa nhiều đợt (ví dụ: Bé A lớp 10 học phí khóa 4.000.000đ, đóng đợt 1 vào tháng 8/9: 2.000.000đ, tháng 10 đóng tiếp 2.000.000đ).
- Khi nhập đợt 2, hệ thống ghi nhận trạng thái "Đã đóng đủ" nhưng doanh thu tháng 10 không tăng thêm 2.000.000đ.

### 🎯 Nguyên nhân gốc rễ:
1. Trước đây form lập/sửa phiếu thu không có trường chọn ngày thu tiền (`paymentDate`), mặc định lấy ngày cũ nếu sửa hoặc ngày hiện tại. Do đó nhân viên sửa đè lên phiếu cũ (tháng 8) từ 2tr thành 4tr, khiến toàn bộ 4tr dồn vào tháng 8, tháng 10 không có phiếu thu nào.
2. Nếu lập phiếu thu mới thì mỗi phiếu tính nợ độc lập, dẫn đến công nợ bị nhân đôi (2tr + 2tr = 4tr) và không bao giờ chuyển sang "Đã đóng đủ".
3. Dashboard chỉ hiển thị doanh thu tháng gần nhất (`latestReceiptMonth`), không có thanh chọn tháng linh hoạt.

### 🛠 Giải pháp đã triển khai:
1. **`src/lib/tuition.ts`**: Cập nhật hàm `debtBreakdown`:
   - Gom nhóm các phiếu thu theo `(studentId + billingPeriod)` cho khoản thu khóa và tháng.
   - Tính công nợ thực tế: `Math.max(courseFee - discount - totalPaid, 0)`. Khi tổng các đợt đóng đủ, công nợ tự động về 0 và chuyển sang `paid` ("Đã đóng đủ").
2. **`src/components/TuitionManager.tsx`**:
   - **Thêm nút "Thu đợt tiếp"** trên các phiếu thu còn nợ (`debtAmount > 0`): Mở form điền sẵn học viên, khóa học, số tiền nợ còn lại, ngày thu (mặc định hôm nay hoặc chọn ngày tháng 10). Khi hoàn thành, tạo phiếu thu mới cho đợt 2 (ghi nhận doanh thu tháng 10) và tự động tất toán công nợ trên phiếu đợt 1 về 0.
   - **Thêm nút "Tách đợt"**: Dành cho các phiếu đã bị sửa gộp trước đây (ví dụ phiếu 4tr ở tháng 8). Cho phép 1-click tách thành Đợt 1 (2tr tháng 8) và Đợt 2 (2tr tháng 10). Doanh thu tháng 10 lập tức tăng 2tr.
   - **Thêm trường chọn Ngày Thu Tiền (`type="date"`)** trên modal: Nhân viên kiểm soát chính xác ngày thu tiền thực tế.
   - **Banner hướng dẫn thông minh**: Khi sửa phiếu đang còn nợ, hệ thống cảnh báo và gợi ý nút chuyển nhanh sang "Thu đợt tiếp" để tránh sửa đè.
3. **`src/components/DashboardView.tsx`**:
   - Thêm thanh chọn tháng xem doanh thu linh hoạt (hỗ trợ chọn Tháng 10, Tháng 9, Tháng hiện tại...).
   - Thẻ KPI doanh thu và bảng tổng thu từng lớp đồng bộ theo tháng được chọn.
4. **`src/components/ReportView.tsx`**:
   - Thêm bộ chọn ngày/tháng để xem và in báo cáo tài chính cho bất kỳ tháng nào.
5. **Kiểm tra chất lượng**: Build Vite và Typecheck TypeScript đạt 0 lỗi (Exit Code 0).

---

## 7. 🎓 Hỗ Trợ Học Viên Học Nhiều Lớp & Khắc Phục Sĩ Số Lớp Học Bị Thiếu

### 🔍 Vấn đề người dùng phản ánh:
1. **1 bé học 2 lớp không hiện tên và không hiện học phí**: Khi học viên tham gia học cùng lúc 2 lớp, ở lớp thứ 2 không thấy tên bé trong danh sách lớp, và không hiển thị học phí/công nợ của bé.
2. **Lớp tháng 8 có 6 bé nhưng chỉ hiện 3 bé**: Một số lớp (ví dụ lớp L3-PPTE hoặc L11-PPTE có 6 học viên) nhưng chỉ hiển thị 3 bé trên hệ thống hoặc trong báo cáo doanh thu tháng 8.

### 🎯 Nguyên nhân gốc rễ:
1. **Model dữ liệu `Student` đơn lớp**: Gốc rễ model chỉ có trường `classId: string`, không có mảng các lớp bổ sung (`extraClassIds`), nên học viên chỉ có thể gắn với duy nhất 1 lớp chính.
2. **Hàm `reconcileClassStudentIds` trong `App.tsx` xóa dữ liệu học viên**:
   - Trước đây hàm này tái tạo `classroom.studentIds` bằng cách lọc `students.filter(s => s.classId === classroom.id)`.
   - Nếu học viên tham gia lớp thứ 2 (hoặc được import vào lớp từ Excel), nhưng `student.classId` là lớp khác, hàm này đã tự động **xóa học viên khỏi `classroom.studentIds`**. Do đó lớp có 6 bé bị giảm xuống còn 3 bé!
3. **Lọc dữ liệu cứng nhắc trên các Component**:
   - `ClassManager.tsx`: Lọc sĩ số và danh sách modal bằng `s.classId === cls.id`.
   - `ReportView.tsx`: Lọc học viên bằng `student.classId === selectedClass.id`.
   - `GradeManager.tsx`: Lọc theo `s.classId === selectedClassId`.
   - `excelService.ts`: Lọc học viên theo `student.classId === classroom.id`.
   - `TuitionManager.tsx`: Khi tạo phiếu thu, gán cứng `classId: student.classId`, không cho chọn lớp áp dụng của khoản thu.
4. **Dashboard / Modal chi tiết doanh thu tháng 8**:
   - Khi chọn Tháng 8, danh sách chỉ hiển thị các học sinh có phiếu thu phát sinh trong tháng 8 (3 bé có phiếu), 3 bé còn lại (đã đóng ở tháng trước hoặc chưa đóng) bị ẩn hoàn toàn, khiến người dùng thấy "chỉ hiện ra 3 bé".

### 🛠 Giải pháp đã triển khai:
1. **Mở rộng Model `Student` (`src/types.ts`)**:
   - Bổ sung `extraClassIds?: string[]` cho phép lưu trữ không giới hạn các lớp học thêm/học cùng lúc.
2. **Tạo Module Tiện Ích Đa Lớp (`src/lib/student.ts`)**:
   - `isStudentInClass(student, classId, classroom)`: Kiểm tra chính xác tư cách thành viên của học viên trong lớp (xét cả `classId`, `extraClassIds` và `classroom.studentIds`).
   - `getStudentClassIds(student, classrooms)`: Lấy toàn bộ danh sách mã lớp mà học viên đang theo học.
   - `getEnrolledStudentsForClass(classroom, students)`: Lấy danh sách đầy đủ học viên của lớp.
3. **Bảo toàn Sĩ Số & Đồng Bộ Hai Chiều (`src/App.tsx`)**:
   - `reconcileClassStudentIds`: Bảo toàn toàn bộ học sinh hợp lệ đã có trong `classroom.studentIds`, đồng thời bổ sung các học sinh có `classId` hoặc `extraClassIds` khớp với lớp. Không bao giờ xóa mất học viên.
   - `reconcileStudentExtraClasses`: Tự động đồng bộ các lớp học thêm từ `classroom.studentIds` vào `student.extraClassIds` của hồ sơ học viên.
4. **Quản Lý Lớp Học (`src/components/ClassManager.tsx`)**:
   - Thẻ lớp học: Sĩ số tính theo tất cả học viên thuộc lớp (`isStudentInClass`), hiển thị đầy đủ 6/6 bé.
   - Modal "Xem danh sách": Hiển thị tên tất cả các bé (kèm huy hiệu "Học thêm lớp này" cho bé học 2 lớp).
   - Hiển thị công nợ/học phí chính xác cho từng bé theo từng lớp học tương ứng.
5. **Thu Học Phí Đa Lớp (`src/components/TuitionManager.tsx`)**:
   - Bổ sung menu chọn **"Lớp học áp dụng"** trong form thu học phí: Liệt kê các lớp bé đang theo học (Lớp chính / Lớp học thêm) để nhân viên chọn đúng lớp thu tiền.
   - Phiếu thu được gán chính xác `classId` của lớp được chọn.
   - Lọc phiếu thu theo lớp hỗ trợ nhận diện các học viên học nhiều lớp.
   - Tách biệt công nợ theo `(studentId + classId + billingPeriod)` trong `src/lib/tuition.ts` để học phí lớp A không ảnh hưởng học phí lớp B.
6. **Hồ Sơ Học Viên (`src/components/StudentManager.tsx`)**:
   - Modal thêm/sửa học viên: Bổ sung khu vực checkbox chọn **"Lớp Học Thêm / Lớp Bổ Sung"**.
   - Bảng danh sách & Thẻ học viên: Hiển thị đầy đủ tất cả các lớp bé đang học và lịch học tương ứng.
   - Lọc theo lớp nhận diện học viên ở cả lớp chính và lớp bổ sung.
7. **Báo Cáo & Bảng Điểm (`ReportView.tsx`, `GradeManager.tsx`)**:
   - Thống kê sĩ số lớp, danh sách chi tiết và nhập điểm số hỗ trợ đầy đủ học viên học 2 lớp.
8. **Dashboard & Modal Doanh Thu Tháng 8 (`DashboardDetailModal.tsx`)**:
   - Khi xem chi tiết lớp học theo tháng, hiển thị toàn bộ sĩ số lớp (ví dụ: 6 học sinh, 3 đã nộp) và liệt kê đầy đủ 6 học sinh kèm trạng thái đóng tiền/công nợ cụ thể của từng em trong kỳ.
9. **Nhập / Xuất Excel (`src/services/excelService.ts`)**:
   - Khi đọc sheet `HỌC SINH`: Hỗ trợ mã lớp phân tách bằng dấu phẩy/chấm phẩy (ví dụ `L3-PPTE, T-TV3-PPTE`), tự động gán vào `classId` và `extraClassIds`.
   - Nếu học sinh xuất hiện ở nhiều dòng tương ứng với các lớp khác nhau: Tự động gộp vào hồ sơ học viên duy nhất, không báo lỗi trùng mã học sinh.
   - Khi đọc sheet `HỌC PHÍ`: Ưu tiên lấy đúng mã lớp ghi trên từng dòng phiếu thu thay vì gán cứng theo lớp chính của học viên.
   - Khi xuất báo cáo Excel cho từng lớp: Xuất đầy đủ tất cả học viên đang học lớp đó.
10. **Kiểm Tra Tính Nhất Quán Dữ Liệu (`dataConsistencyService.ts`)**:
    - Nhận diện học viên học 2 lớp hợp lệ qua `extraClassIds`, không cảnh báo sai lỗi lệch lớp.
    - Chức năng tự động sửa sẽ bổ sung vào `extraClassIds` thay vì ghi đè làm mất lớp chính.
11. **Kiểm Tra Chất Lượng**:
    - Typecheck: `npx tsc --noEmit` hoàn thành với **0 lỗi**.
    - Build Production: `npm run build` hoàn tất xuất sắc (**100% passed**).

---

## 8. 🔗 Đồng Bộ Hai Chiều & Liên Kết Đầy Đủ Các Sheet Excel Khi Thêm, Sửa, Xóa

### 📋 Mục tiêu & Vấn đề xử lý:
1. **Liên kết giữa các Sheet Excel (`src/services/excelService.ts`)**:
   - Trước đây file Excel xuất ra thiếu sheet `GIÁO VIÊN`, khiến thông tin giáo viên và phân công lớp chưa có sự liên kết trực tiếp.
   - Công thức đếm sĩ số ở `TỔNG QUAN` và `LỚP HỌC` chỉ so khớp chuỗi tuyệt đối (`COUNTIF`), dẫn đến các học sinh học nhiều lớp (cột Mã lớp ghi dạng `L3-PPTE, T-TV3-PPTE`) không được tính vào sĩ số của các lớp tương ứng.
   - Sheet `BẢNG ĐIỂM` chỉ xuất điểm theo 1 lớp chính `student.classId`. Học sinh học 2 lớp bị thiếu dòng điểm của lớp thứ 2, và khi import ngược lại vào web thì điểm lớp thứ 2 bị thất lạc.
   - Sheet chi tiết từng lớp chưa có hàng Footer TỔNG CỘNG tính toán công nợ và học sinh.
   - Import sheet `HỌC PHÍ` trước đó bắt buộc phải có cột kỹ thuật ẩn `ID hệ thống` (`idhethong`). Nếu người dùng mở Excel và chỉ nhập `Mã học sinh` và `Mã phiếu`, file sẽ bị bỏ qua phiếu thu.
2. **Đồng bộ Cascade khi Thêm, Sửa, Xóa trong Ứng Dụng Web (`App.tsx`, `GradeManager.tsx`, `dataConsistencyService.ts`)**:
   - Khi sửa học viên (bỏ chọn một lớp học thêm), cơ chế đồng bộ cũ vô tình giữ lại ID bé trong lớp cũ do bẫy `reconcileClassStudentIds` ↔ `reconcileStudentExtraClasses`.
   - Khi xóa lớp học, hệ thống chưa dọn dẹp `extraClassIds` của học viên, `assignedClassIds` của giáo viên, cũng như ca học và điểm của lớp.
   - Khi xóa giáo viên hoặc phòng học, hệ thống chưa kiểm tra xem giáo viên/phòng có đang gắn với ca dạy trong thời khóa biểu (`timetableSlots`) hay không.
   - Khi chấm điểm trong `GradeManager.tsx`, việc cập nhật điểm cho học sinh học 2 lớp bị ghi đè lên điểm của lớp khác vì chỉ so khớp `studentId` thay vì cặp `(studentId, classId)`.

### 🛠 Các cải tiến đã triển khai:
1. **Bổ sung Sheet `GIÁO VIÊN` trong File Excel**:
   - Tự động tạo sheet `GIÁO VIÊN` chứa đầy đủ STT, Mã GV, Họ tên, SĐT, Email, Chuyên môn, Địa chỉ, Danh sách lớp phụ trách và Ghi chú.
   - Trong sheet `LỚP HỌC`, ô Giáo viên tự động gán Hyperlink dẫn trực tiếp tới dòng giáo viên tương ứng ở sheet `GIÁO VIÊN`.
   - Trong sheet `TỔNG QUAN`, bổ sung chỉ số KPI "Tổng giáo viên" và "Tổng lớp học" với link điều hướng nhanh.
   - Khi import ngược từ Excel về Web: Tự động đọc dữ liệu giáo viên từ sheet `GIÁO VIÊN` (nếu có) hoặc fallback từ `LỚP HỌC`.
2. **Chuẩn Hóa Công Thức Excel Cho Học Viên Đa Lớp**:
   - Sĩ số lớp trong sheet `TỔNG QUAN` và `LỚP HỌC`: Dùng công thức wildcard `COUNTIF('HỌC SINH'!$G:$G,"*"&...&"*")`, tính chính xác cả học viên đơn lớp và đa lớp.
   - Doanh thu trực tiếp theo lớp: `SUMIFS` sử dụng wildcard `"*"&...&"*"` để cộng dồn chính xác.
   - Sheet `BẢNG ĐIỂM`: Tạo dòng điểm cho từng lớp mà học viên theo học (`gradeEntries`), có link trỏ về sheet lớp chi tiết. Khi import Excel ngược lại, hệ thống map đúng điểm cho từng lớp.
   - Sheet lớp chi tiết: Bổ sung hàng Footer `TỔNG CỘNG` ở cuối danh sách học sinh tính tổng sĩ số, tổng đã thu, tổng nợ, nợ tháng, nợ khóa bằng công thức Excel (`COUNTA`, `SUM`).
   - Khả năng chịu lỗi khi Import: Relax điều kiện cột bắt buộc từ `['maphieu', 'idhethong']` thành `['maphieu']`, tự động liên kết học sinh qua Mã học sinh và tự động cập nhật lớp học thêm từ mã lớp của phiếu thu.
   - Tự động fallback xuất XLSX chuẩn nếu môi trường không hỗ trợ nhúng macro XLSM.
3. **Đồng Bộ Cascade 2 Chiều Toàn Diện Khi Thêm, Sửa, Xóa**:
   - **Xóa Lớp (`handleDeleteClass`)**: Kiểm tra cả học viên chính và học viên học thêm (`isStudentInClass`). Khi xóa lớp an toàn, tự động loại bỏ lớp khỏi `extraClassIds` của học viên, `assignedClassIds` của giáo viên, ca học TKB và điểm số liên quan.
   - **Sửa Lớp (`handleUpdateClass`)**: Khi đổi giáo viên phụ trách hoặc phòng học, tự động chuyển phân công lớp cho giáo viên mới và cập nhật `teacherId`/`roomId` trong các ca học TKB của lớp đó.
   - **Sửa Học Sinh (`handleUpdateStudent`)**: Khắc phục dứt điểm bẫy lặp vô hạn. Khi học viên đổi lớp chính hoặc bỏ chọn lớp học thêm, danh sách `studentIds` của các lớp lập tức được đồng bộ chính xác.
   - **Xóa Học Sinh (`handleDeleteStudent`)**: Khi xóa học sinh, tự động dọn sạch ID học sinh khỏi tất cả các lớp và xóa bảng điểm của học sinh đó.
   - **Xóa Giáo Viên & Phòng Học (`handleDeleteTeacher`, `handleDeleteRoom`)**: Chặn xóa nếu còn ca dạy hoặc lớp học đang liên kết để không làm mồ côi dữ liệu.
   - **Nhập Điểm (`GradeManager.tsx` & `handleUpdateGrade`)**: Cô lập điểm số theo cặp `(studentId, classId)`, đảm bảo học sinh học 2 lớp có 2 bảng điểm độc lập, không bị ghi đè.
   - **Thu Học Phí (`handleAddReceipt`, `handleUpdateReceipt`, `handleDeleteReceipt`)**: Ngay khi phiếu thu được thêm, sửa hoặc xóa, lập tức tính toán và cập nhật `feeStatus` cho học viên, công nợ hiển thị tức thì trên mọi màn hình.
4. **Nâng Cấp Bộ Tự Động Kiểm Tra Tính Nhất Quán Dữ Liệu (`dataConsistencyService.ts`)**:
   - Bổ sung phát hiện mã lớp rác trong `extraClassIds` của học sinh hoặc học sinh rác trong danh sách lớp.
   - Hàm `autoFixConsistency` tự động dọn dẹp các ID rác và đồng bộ hai chiều giữa `students` và `classrooms`.

