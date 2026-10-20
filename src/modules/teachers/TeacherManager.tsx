import { CheckboxMultiSelect } from '../../components/CheckboxMultiSelect';
import { ConfirmedForm } from '../../components/ConfirmedForm';
import { showAlert } from '../../lib/dialogs';
import { academicPermission } from '../../lib/permissions';
import { formatTeacherCode, nextTeacherId } from '../../lib/identifiers';
import {
  Award,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle,
  Clock,
  Edit,
  Eye,
  GraduationCap,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import React, { useState } from 'react';
import { DialogFrame } from '../../components/DialogFrame';
import { ConfirmModal } from '../../components/ConfirmModal';
import { TeacherAvatar } from '../../components/TeacherAvatar';
import { useLanguage } from '../../context/LanguageContext';
import { matchesSearch } from '../../lib/search';
import { ClassRoom, StaffPermissions, Teacher } from '../../types';

interface TeacherManagerProps {
  teachers: Teacher[];
  classes: ClassRoom[];
  permissions: StaffPermissions;
  isOwner: boolean;
  searchQuery?: string;
  onAddTeacher: (t: Teacher) => void;
  onUpdateTeacher: (t: Teacher) => void;
  onDeleteTeacher: (id: string) => void;
  onEditClass: (classroom: ClassRoom) => void;
  onSaveTeacher?: (teacher: Teacher) => string | null;
}

export const TeacherManager: React.FC<TeacherManagerProps> = ({
  teachers,
  classes,
  permissions,
  isOwner,
  searchQuery = '',
  onAddTeacher,
  onUpdateTeacher,
  onDeleteTeacher,
  onEditClass,
  onSaveTeacher,
}) => {
  const { t, language } = useLanguage();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null);
  const [teacherToDelete, setTeacherToDelete] = useState<Teacher | null>(null);
  const [viewingTeacherDetails, setViewingTeacherDetails] = useState<Teacher | null>(null);

  const canEdit = isOwner || permissions.teacher.edit;
  const canAdd = isOwner || (permissions.teacher.add ?? permissions.teacher.edit);
  const canAssign = isOwner || academicPermission(permissions, 'classes', 'edit');
  const canDelete = isOwner || permissions.teacher.delete;

  const handleOpenAdd = () => {
    if (!canAdd) return;
    setEditingTeacher({
      id: nextTeacherId(teachers),
      name: '',
      phone: '',
      email: '',
      address: '',
      specialty: '',
      assignedClassIds: [],
      scheduleNotes: '',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTeacher || !editingTeacher.name.trim()) return;
    if (teachers.some(item => item.id === editingTeacher.id) ? !canEdit : !canAdd) return;

    if (onSaveTeacher) {
      const issue = onSaveTeacher(editingTeacher);
      if (issue) { showAlert(issue); return; }
    } else if (teachers.some(t => t.id === editingTeacher.id)) {
      onUpdateTeacher(editingTeacher);
    } else {
      onAddTeacher(editingTeacher);
    }

    setIsModalOpen(false);
    setEditingTeacher(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-amber-600" />
            {t('teacher.title')} ({teachers.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {language === 'vi' ? 'Đội ngũ giáo viên bản ngữ & Việt Nam giàu kinh nghiệm tại Cơ Sở 01' : 'Experienced native & local teaching staff at Campus 01'}
          </p>
        </div>

        {canAdd && (
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            {t('teacher.add_new')}
          </button>
        )}
      </div>

      {/* Teacher Cards Grid */}
      <div className="entity-grid">
        {teachers.filter(teacher => matchesSearch(searchQuery, teacher.name, teacher.phone, teacher.email)).map((teacher, index) => {
          const teacherClasses = classes.filter(c => c.teacherId === teacher.id);

          return (
            <div
              key={teacher.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <TeacherAvatar teacher={teacher} className="h-14 w-14 shrink-0 text-sm shadow-xs" />
                    <div className="min-w-0">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        {formatTeacherCode(teacher, index)}
                      </span>
                      <h3 className="font-bold text-slate-900 text-base mt-0.5">{teacher.name}</h3>
                      <div className="text-xs text-amber-700 font-semibold flex items-center gap-1">
                        <Award className="w-3.5 h-3.5" /> {teacher.specialty}
                      </div>
                    </div>
                  </div>

                  {(canEdit || canDelete) && (
                    <div className="flex shrink-0 items-center gap-1">
                      {canEdit && <button
                        aria-label={`Sửa giáo viên ${teacher.name}`}
                        onClick={() => {
                          setEditingTeacher({ ...teacher, assignedClassIds: classes.filter(item => item.teacherId === teacher.id).map(item => item.id) });
                          setIsModalOpen(true);
                        }}
                        className="icon-button p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                        title="Sửa"
                      >
                        <Edit className="w-4 h-4" />
                      </button>}

                      {canDelete && (
                        <button
                          aria-label={`Xóa giáo viên ${teacher.name}`}
                          onClick={() => setTeacherToDelete(teacher)}
                          className="icon-button p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                          title="Xóa"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                    <span>{teacher.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                    <span className="truncate">{teacher.email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                    <span className="truncate">{teacher.address}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="text-[11px] font-bold text-slate-700 uppercase mb-1 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-amber-600" /> {t('teacher.assigned_classes')} ({teacherClasses.length}):
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {teacherClasses.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">{t('student.unassigned')}</span>
                    ) : (
                      teacherClasses.map(c => (
                        <span
                          key={c.id}
                          className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-800 border border-slate-200"
                        >
                          {c.code}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 px-5 py-2.5 border-t border-slate-100 text-[11px] text-slate-500 font-medium flex items-center justify-between">
                <span className="truncate pr-2">
                  {t('teacher.schedule')} {teacher.scheduleNotes || (language === 'vi' ? 'Giảng dạy các ca tối T2-T4-T6' : 'Evening sessions Mon-Wed-Fri')}
                </span>
                <button
                  onClick={() => setViewingTeacherDetails(teacher)}
                  className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 shadow-2xs active:scale-95"
                >
                  <Eye className="w-3.5 h-3.5 text-amber-400" />
                  Xem chi tiết
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* TEACHER DETAIL MODAL */}
      {viewingTeacherDetails && (
        <DialogFrame label="Hồ sơ giáo viên" onClose={() => setViewingTeacherDetails(null)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 relative custom-scrollbar">
            <button aria-label="Đóng"
              onClick={() => setViewingTeacherDetails(null)}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg z-10"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header Profile */}
            <div className="flex flex-col sm:flex-row items-center gap-4 pb-5 border-b border-slate-200">
              <TeacherAvatar teacher={viewingTeacherDetails} className="h-20 w-20 text-xl shadow-md" />
              <div className="text-center sm:text-left flex-1">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300">
                    MÃ GV: {viewingTeacherDetails.id}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 text-emerald-600" /> Đang giảng dạy
                  </span>
                </div>
                <h3 className="text-xl font-black text-slate-900 mt-1">{viewingTeacherDetails.name}</h3>
                <div className="text-xs text-amber-700 font-bold flex items-center justify-center sm:justify-start gap-1 mt-0.5">
                  <Award className="w-4 h-4 text-amber-500" /> Chuyên môn: {viewingTeacherDetails.specialty}
                </div>
              </div>
            </div>

            {/* Quick Contact Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Số điện thoại</div>
                  <a href={`tel:${viewingTeacherDetails.phone}`} className="font-bold text-slate-800 hover:text-amber-700">{viewingTeacherDetails.phone || 'Chưa cập nhật'}</a>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <div className="truncate">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Email công việc</div>
                  <div className="font-bold text-slate-800 truncate">{viewingTeacherDetails.email || 'Chưa cập nhật'}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <div className="truncate">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Địa chỉ</div>
                  <div className="font-bold text-slate-800 truncate">{viewingTeacherDetails.address || 'Tây Ninh'}</div>
                </div>
              </div>
            </div>

            {/* Classes Taught */}
            <div className="space-y-4 my-5">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
                <BookOpen className="w-4 h-4 text-amber-600" /> Các lớp học đang phụ trách ({classes.filter(c => c.teacherId === viewingTeacherDetails.id).length})
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {classes.filter(c => c.teacherId === viewingTeacherDetails.id).length === 0 ? (
                  <div className="col-span-2 text-center py-6 text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    Giáo viên hiện chưa được xếp lớp giảng dạy.
                  </div>
                ) : (
                  classes.filter(c => c.teacherId === viewingTeacherDetails.id).map(cls => (
                    <div key={cls.id} className="p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xs hover:border-amber-300 transition-all">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-slate-900 text-sm">{cls.name}</span>
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 bg-amber-50 text-amber-900 border border-amber-200/60 rounded">{cls.code}</span>
                      </div>
                      <div className="text-xs text-slate-600 space-y-1 mt-2">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Clock className="w-3.5 h-3.5 text-amber-600" /> Ca dạy: <span className="font-bold">{cls.scheduleTime}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <CalendarDays className="w-3.5 h-3.5 text-purple-600" /> Ngày dạy: <span className="font-bold">{cls.days.join(', ')}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" /> Sĩ số: <span className="font-bold text-slate-800">{cls.studentIds ? cls.studentIds.length : 0} / {cls.capacity > 0 ? cls.capacity : 'Chưa cập nhật'} học sinh</span>
                        </div>
                      </div>
                      {canAssign && (
                        <button
                          type="button"
                          onClick={() => onEditClass(cls)}
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 transition-colors hover:bg-amber-100"
                        >
                          <Edit className="h-3.5 w-3.5" /> Sửa / cập nhật lớp
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Schedule Notes */}
            <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200 text-xs text-amber-900">
              <div className="font-bold flex items-center gap-1.5 mb-1">
                <Calendar className="w-4 h-4 text-amber-700" /> Ghi chú lịch giảng dạy & Yêu cầu ca:
              </div>
              <div>{viewingTeacherDetails.scheduleNotes || 'Giảng dạy cố định ca tối các ngày Thứ 2, 4, 6 và Thứ 7.'}</div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium">Trung tâm ngoại ngữ BeeZone</span>
              <button
                onClick={() => setViewingTeacherDetails(null)}
                className="px-5 py-2 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </DialogFrame>
      )}

      {/* EDIT / ADD TEACHER MODAL */}
      {isModalOpen && editingTeacher && (
        <DialogFrame label="Thông tin giáo viên" onClose={() => {
                setIsModalOpen(false);
                setEditingTeacher(null);
              }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-h-[90vh] max-w-lg w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative custom-scrollbar">
            <button aria-label="Đóng"
              onClick={() => {
                setIsModalOpen(false);
                setEditingTeacher(null);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-amber-600" />
              {teachers.some(t => t.id === editingTeacher.id) ? 'Sửa Thông Tin Giáo Viên' : 'Thêm Giáo Viên Mới'}
            </h3>

            <ConfirmedForm confirmWhen={teachers.some(item => item.id === editingTeacher?.id)} entityLabel="giáo viên" onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Họ Và Tên *</label>
                <input
                  type="text"
                  value={editingTeacher.name}
                  onChange={(e) => setEditingTeacher({ ...editingTeacher, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Số Điện Thoại</label>
                  <input
                    type="text"
                    value={editingTeacher.phone}
                    onChange={(e) => setEditingTeacher({ ...editingTeacher, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={editingTeacher.email}
                    onChange={(e) => setEditingTeacher({ ...editingTeacher, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Chuyên Môn Giảng Dạy</label>
                <input
                  type="text"
                  value={editingTeacher.specialty}
                  onChange={(e) => setEditingTeacher({ ...editingTeacher, specialty: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                  placeholder="IELTS 8.5, Cambridge Flyers, TOEFL..."
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Địa Chỉ</label>
                <input
                  type="text"
                  value={editingTeacher.address}
                  onChange={(e) => setEditingTeacher({ ...editingTeacher, address: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi Chú / Lịch Dạy mong muốn</label>
                <textarea
                  value={editingTeacher.scheduleNotes || ''}
                  onChange={(e) => setEditingTeacher({ ...editingTeacher, scheduleNotes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-700"
                />
              </div>

              <div className="space-y-2">
                <CheckboxMultiSelect label="Chọn các lớp phụ trách"
                  options={classes.map(item => ({ value: item.id, label: item.name + ' (' + item.code + ')' }))}
                  values={editingTeacher.assignedClassIds || []} disabled={!canAssign}
                  onChange={assignedClassIds => setEditingTeacher({ ...editingTeacher, assignedClassIds })} />
                {!canAssign && <p className="text-slate-500">Cần quyền sửa lớp học để thay đổi phân công. Có thể lưu hồ sơ giáo viên trước.</p>}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingTeacher(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold hover:bg-amber-600 flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Save className="w-4 h-4 text-slate-950" /> Lưu Giáo Viên
                </button>
              </div>
            </ConfirmedForm>
          </div>
        </DialogFrame>
      )}
      {/* CONFIRM DELETE TEACHER MODAL */}
      <ConfirmModal
        isOpen={!!teacherToDelete}
        title="Xác nhận xóa giáo viên"
        message={
          teacherToDelete ? (
            <>
              Bạn có chắc chắn muốn xóa giáo viên <strong>{teacherToDelete.name}</strong>?
              <span className="block mt-2 text-xs text-slate-500">
                Thao tác này sẽ xóa hồ sơ giáo viên. Lưu ý: Chỉ xóa được giáo viên không còn phụ trách lớp hay có lịch dạy/đổi lịch.
              </span>
            </>
          ) : null
        }
        confirmText="Xác nhận xóa"
        cancelText="Hủy bỏ"
        variant="danger"
        onConfirm={() => {
          if (teacherToDelete) {
            onDeleteTeacher(teacherToDelete.id);
            setTeacherToDelete(null);
          }
        }}
        onClose={() => setTeacherToDelete(null)}
      />
    </div>
  );
};
