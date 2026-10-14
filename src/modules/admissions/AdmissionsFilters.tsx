import { BookOpen, Filter, Search } from 'lucide-react';
import { ResponsiveSelect } from '../../components/ResponsiveSelect';
import type { CourseProgram } from '../../types';

interface AdmissionsFiltersProps {
  search: string;
  status: string;
  programId: string;
  programs: CourseProgram[];
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onProgramChange: (value: string) => void;
}

const controlClassName =
  'block h-11 w-full min-w-0 max-w-full rounded-xl border border-slate-300 pl-9 pr-9 text-sm text-slate-700 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200';
const iconClassName =
  'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400';

export function AdmissionsFilters({
  search,
  status,
  programId,
  programs,
  onSearchChange,
  onStatusChange,
  onProgramChange,
}: AdmissionsFiltersProps) {
  return (
    <section
      aria-label="Bộ lọc tuyển sinh"
      className="admissions-filters rounded-xl border border-slate-200 bg-white p-3 shadow-xs"
    >
      <label className="admissions-filter-search relative min-w-0">
        <span className="sr-only">Tìm học viên tuyển sinh</span>
        <Search aria-hidden="true" className={iconClassName} />
        <input
          type="search"
          placeholder="Tìm tên học viên, SĐT phụ huynh..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className={`${controlClassName} bg-white`}
        />
      </label>

      <ResponsiveSelect
        label="Lọc theo giai đoạn"
        value={status}
        onChange={onStatusChange}
        icon={Filter}
        className="admissions-select"
        options={[
          { value: 'all', label: 'Tất cả giai đoạn' },
          { value: 'lead', label: 'Tiềm năng / Tư vấn' },
          { value: 'trial', label: 'Đang học thử' },
          { value: 'registered', label: 'Đã đăng ký (Chờ lớp)' },
          { value: 'active', label: 'Đã nhập học chính thức' },
        ]}
      />
      <ResponsiveSelect
        label="Lọc theo chương trình"
        value={programId}
        onChange={onProgramChange}
        icon={BookOpen}
        className="admissions-select"
        options={[
          { value: 'all', label: 'Tất cả chương trình' },
          ...programs.map((program) => ({ value: program.id, label: program.name })),
        ]}
      />
    </section>
  );
}
