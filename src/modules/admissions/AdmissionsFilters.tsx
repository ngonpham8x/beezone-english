import { BookOpen, ChevronDown, Filter, Search } from 'lucide-react';
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
const arrowClassName =
  'pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500';

export function AdmissionsFilters({
  search,
  status,
  programId,
  programs,
  onSearchChange,
  onStatusChange,
  onProgramChange,
}: AdmissionsFiltersProps) {
  const programTitle =
    programs.find((program) => program.id === programId)?.name || 'Tất cả chương trình';

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

      <label className="relative min-w-0">
        <span className="sr-only">Lọc theo giai đoạn</span>
        <Filter aria-hidden="true" className={iconClassName} />
        <select
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
          className={`${controlClassName} appearance-none truncate bg-slate-50 font-semibold`}
        >
          <option value="all">Tất cả giai đoạn</option>
          <option value="lead">Tiềm năng / Tư vấn</option>
          <option value="trial">Đang học thử</option>
          <option value="registered">Đã đăng ký (Chờ lớp)</option>
          <option value="active">Đã nhập học chính thức</option>
        </select>
        <ChevronDown aria-hidden="true" className={arrowClassName} />
      </label>

      <label className="relative min-w-0">
        <span className="sr-only">Lọc theo chương trình</span>
        <BookOpen aria-hidden="true" className={iconClassName} />
        <select
          value={programId}
          title={programTitle}
          onChange={(event) => onProgramChange(event.target.value)}
          className={`${controlClassName} appearance-none truncate bg-slate-50 font-semibold`}
        >
          <option value="all">Tất cả chương trình</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" className={arrowClassName} />
      </label>
    </section>
  );
}
