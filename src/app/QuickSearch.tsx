import { matchesSearch } from '../lib/search';
import { isTeachingRole, studentsVisibleToAccount } from '../lib/accountScope';
import type { ClassRoom, Student, Teacher, UserAccount } from '../types';
import { canAccessTab } from './navigation';
import type { WorkspaceNavigation } from './useWorkspaceNavigation';
interface Props {
  currentUser: UserAccount;
  students: Student[];
  classes: ClassRoom[];
  teachers: Teacher[];
  navigation: WorkspaceNavigation;
}
export function QuickSearch({ currentUser, students, classes, teachers, navigation }: Props) {
  const { searchQuery, setSearchQuery, navigateTo } = navigation;
  const teacherAccount = isTeachingRole(currentUser.role);
  const visibleStudents = teacherAccount
    ? studentsVisibleToAccount(currentUser, students, classes, teachers)
    : students;
  const searchResults = searchQuery.trim()
    ? [
        ...(canAccessTab('students', currentUser)
          ? visibleStudents
              .filter((s) => teacherAccount
                ? matchesSearch(searchQuery, s.name, s.code)
                : matchesSearch(searchQuery, s.name, s.code, s.phone, s.parentPhone))
              .map((s) => ({
                id: s.id,
                name: `${s.name} • ${s.code}`,
                tab: 'students',
                label: 'Học viên',
              }))
          : []),
        ...(canAccessTab('classes', currentUser)
          ? classes
              .filter((c) => matchesSearch(searchQuery, c.name, c.code))
              .map((c) => ({
                id: c.id,
                name: `${c.name} • ${c.code}`,
                tab: 'classes',
                label: 'Lớp',
              }))
          : []),
        ...(canAccessTab('teachers', currentUser)
          ? teachers
              .filter((t) => matchesSearch(searchQuery, t.name, t.phone, t.email))
              .map((t) => ({ id: t.id, name: t.name, tab: 'teachers', label: 'Giáo viên' }))
          : []),
      ].slice(0, 8)
    : [];

  return (
    <>
      {' '}
      {searchQuery.trim() && (
        <section
          aria-label="Kết quả tìm kiếm nhanh"
          className="border-b border-amber-200 bg-white px-4 py-3"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-slate-600">Kết quả tìm kiếm nhanh</p>
            <button
              onClick={() => setSearchQuery('')}
              className="rounded-lg px-3 py-1 text-xs font-bold text-slate-500"
            >
              Xóa tìm kiếm
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {searchResults.length ? (
              searchResults.map((result) => (
                <button
                  key={`${result.tab}:${result.id}`}
                  onClick={() => navigateTo(result.tab)}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs hover:border-amber-400"
                >
                  <span className="font-bold text-amber-700">{result.label}: </span>
                  {result.name}
                </button>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Không tìm thấy kết quả trong dữ liệu bạn được phép xem.
              </p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
