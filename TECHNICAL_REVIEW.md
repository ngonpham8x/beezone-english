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

- [ ] ✅ Không có `window.location.reload()`
- [ ] ✅ Không có `window.location.href = '/'`
- [ ] ⚠️ Kiểm tra vòng lặp activeTab
- [ ] ⚠️ Kiểm tra dependencies data sync
- [ ] 🔴 Kiểm tra Supabase auth event triggers
- [ ] 📝 Thêm reload detector (đã làm)
- [ ] 🐛 Chạy DevTools Console để xem lỗi
- [ ] 🔍 Kiểm tra Network tab - có request nào hang không?

---

## 5. 📊 Kết Luận

**Tình trạng**: ⚠️ **Có khả năng lỗi vòng lặp từ activeTab hoặc data sync**

**Mức độ nguy hiểm**: 🟡 **Trung bình**
- Không phải auto-reload từ code trực tiếp
- Có thể là vòng lặp state gián tiếp gây re-render liên tục
- Hoặc Supabase auth event trigger multiple times

**Hành động tiếp theo**:
1. ✅ Đã thêm `reloadDebugger.ts` để phát hiện
2. 🔧 Cần fix activeTab logic
3. 🔧 Cần tối ưu data sync dependencies
4. 🧪 Test lại sau khi fix
