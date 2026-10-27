import { canManageAcademic } from '../lib/permissions';
import { classesVisibleToAccount, isTeachingRole, studentsVisibleToAccount } from '../lib/accountScope';
import { supabase } from '../lib/supabase';
import { lazy, Suspense } from 'react';
import type { CenterActions } from '../modules/center/createCenterActions';
import type { CenterStore } from '../modules/center/useCenterStore';
import type { AccountAudit } from '../modules/system/useAccountAudit';
import type { UserAccount } from '../types';
import { canAccessTab } from './navigation';
import type { WorkspaceDialogs } from './useWorkspaceDialogs';
import type { WorkspaceNavigation } from './useWorkspaceNavigation';

const DashboardView = lazy(() =>
  import('../modules/dashboard/DashboardView').then((m) => ({ default: m.DashboardView })),
);
const StudentManager = lazy(() =>
  import('../modules/students/StudentManager').then((m) => ({ default: m.StudentManager })),
);
const TeacherManager = lazy(() =>
  import('../modules/teachers/TeacherManager').then((m) => ({ default: m.TeacherManager })),
);
const ClassManager = lazy(() =>
  import('../modules/classes/ClassManager').then((m) => ({ default: m.ClassManager })),
);
const RoomManager = lazy(() =>
  import('../modules/rooms/RoomManager').then((m) => ({ default: m.RoomManager })),
);
const TimetableManager = lazy(() =>
  import('../modules/timetable/TimetableManager').then((m) => ({ default: m.TimetableManager })),
);
const TeacherScheduleMatrix = lazy(() =>
  import('../modules/timetable/TeacherScheduleMatrix').then((m) => ({
    default: m.TeacherScheduleMatrix,
  })),
);
const GradeManager = lazy(() =>
  import('../modules/grades/GradeManager').then((m) => ({ default: m.GradeManager })),
);
const TuitionManager = lazy(() =>
  import('../modules/tuition/TuitionManager').then((m) => ({ default: m.TuitionManager })),
);
const ReportView = lazy(() =>
  import('../modules/reports/ReportView').then((m) => ({ default: m.ReportView })),
);
const AttendanceManager = lazy(() =>
  import('../modules/attendance/AttendanceManager').then((m) => ({ default: m.AttendanceManager })),
);
const AdmissionsManager = lazy(() =>
  import('../modules/admissions/AdmissionsManager').then((m) => ({ default: m.AdmissionsManager })),
);
const CourseProgramManager = lazy(() =>
  import('../modules/programs/CourseProgramManager').then((m) => ({
    default: m.CourseProgramManager,
  })),
);
const BackupManager = lazy(() =>
  import('../modules/system/BackupManager').then((module) => ({ default: module.BackupManager })),
);
const ActivityLogView = lazy(() =>
  import('../modules/system/ActivityLogView').then((module) => ({
    default: module.ActivityLogView,
  })),
);
const DataConsistencyChecker = lazy(() => import('../modules/system/DataConsistencyChecker'));
const BeeZoneWork = lazy(() =>
  import('../modules/work/BeeZoneWork').then((m) => ({ default: m.BeeZoneWork })),
);
interface Props {
  store: CenterStore;
  actions: CenterActions;
  navigation: WorkspaceNavigation;
  dialogs: WorkspaceDialogs;
  audit: AccountAudit;
  currentUser: UserAccount;
}
export function WorkspaceScreens({
  store,
  actions,
  navigation,
  dialogs,
  audit,
  currentUser,
}: Props) {
  const {
    settings,
    programs,
    teachers,
    rooms,
    classes,
    students,
    timetableSlots,
    grades,
    receipts,
    backups,
    activityLogs,
    attendanceSessions,
    enrollments,
    scheduleChanges,
    billingReceipts,
  } = store;
  const {
    handleAddStudent,
    handleUpdateStudent,
    handleDeleteStudent,
    handleEnrollStudent,
    handleReserveStudent,
    handleDropStudent,
    handleReEnrollStudent,
    handleAddTeacher,
    handleSaveTeacher,
    handleUpdateTeacher,
    handleDeleteTeacher,
    handleAddClass,
    handleUpdateClass,
    handleDeleteClass,
    handleAddRoom,
    handleUpdateRoom,
    handleDeleteRoom,
    handleAddSlot,
    handleSaveSlots,
    handleUpdateSlot,
    handleDeleteSlot,
    handleReplaceClassSchedule,
    handleSaveScheduleChange,
    handleDeleteScheduleChange,
    handleUpdateGrade,
    handleAddReceipt,
    handleUpdateReceipt,
    handleDeleteReceipt,
    handleSaveAttendanceSession,
    handleDeleteAttendanceSession,
    handleRecordParentContact,
    handleCreateProgram,
    handleAddProgram,
    handleUpdateProgram,
    handleDeleteProgram,
    handleBackupCreated,
    handleRestoreBackup,
    handleDataFixed,
  } = actions;
  const {
    activeTab,
    navigateTo,
    searchQuery,
    setSearchQuery,
    classEditRequest,
    setClassEditRequest,
    taskRequest,
    setTaskRequest,
  } = navigation;
  const { setIsImportExportModalOpen, setIsSettingsModalOpen } = dialogs;
  const { accountAuditError, isAccountAuditLoading, loadAccountAuditLogs, visibleActivityLogs, visibleAccountLogs } = audit;
  const teacherAccount = isTeachingRole(currentUser.role);
  const scopedClasses = teacherAccount
    ? classesVisibleToAccount(currentUser, classes, teachers)
    : classes;
  const scopedClassIds = new Set(scopedClasses.map((classroom) => classroom.id));
  const scopedStudents = teacherAccount
    ? studentsVisibleToAccount(currentUser, students, classes, teachers)
    : students;
  const scopedProgramIds = new Set(scopedClasses.flatMap((classroom) => [
    classroom.programId,
    ...(classroom.additionalProgramIds || []),
  ]));
  const scopedPrograms = teacherAccount
    ? programs.filter((program) => scopedProgramIds.has(program.id))
    : programs;
  const scopedTeacherIds = new Set(scopedClasses.map((classroom) => classroom.teacherId));
  const scopedTeachers = teacherAccount
    ? teachers.filter((teacher) => scopedTeacherIds.has(teacher.id))
    : teachers;
  const scopedRoomIds = new Set(scopedClasses.map((classroom) => classroom.roomId));
  const scopedRooms = teacherAccount ? rooms.filter((room) => scopedRoomIds.has(room.id)) : rooms;
  const scopedSlots = teacherAccount
    ? timetableSlots.filter((slot) => scopedClassIds.has(slot.classId))
    : timetableSlots;
  const scopedAttendance = teacherAccount
    ? attendanceSessions.filter((session) => scopedClassIds.has(session.classId))
    : attendanceSessions;
  const scopedGrades = teacherAccount
    ? grades.filter((grade) => scopedClassIds.has(grade.classId))
    : grades;
  const scopedEnrollments = teacherAccount
    ? enrollments.filter((enrollment) => scopedClassIds.has(enrollment.classId))
    : enrollments;
  switch (activeTab) {
    case 'dashboard':
      return (
        <DashboardView
          students={scopedStudents}
          teachers={scopedTeachers}
          classes={scopedClasses}
          rooms={scopedRooms}
          receipts={teacherAccount ? [] : billingReceipts}
          programs={scopedPrograms}
          currentUser={currentUser}
          timetableSlots={scopedSlots}
          scheduleChanges={scheduleChanges}
          attendanceSessions={scopedAttendance}
          onOpenTask={(destination) => {
            if (!canAccessTab(destination.tab, currentUser)) return;
            setTaskRequest(destination);
            if (destination.tab === 'students')
              setSearchQuery(students.find((s) => s.id === destination.studentId)?.code || '');
            if (destination.tab === 'classes' && canManageAcademic(currentUser, 'classes', 'edit'))
              setClassEditRequest(classes.find((c) => c.id === destination.classId) || null);
            navigateTo(destination.tab);
          }}
          onNavigateTab={navigateTo}
        />
      );
    case 'work':
      return (
        <Suspense
          fallback={<div className="p-6 text-sm text-slate-500">Đang tải phân hệ Giao việc & Bàn giao…</div>}
        >
          <BeeZoneWork
            currentUser={currentUser}
            teachers={teachers}
            classes={classes}
            programs={programs}
            rooms={rooms}
            timetableSlots={timetableSlots}
            scheduleChanges={scheduleChanges}
            onSaveScheduleChange={handleSaveScheduleChange}
            onDeleteScheduleChange={handleDeleteScheduleChange}
            supabaseClient={supabase}
          />
        </Suspense>
      );
    case 'students':
      return (
        <StudentManager
          students={scopedStudents}
          programs={scopedPrograms}
          classes={scopedClasses}
          receipts={teacherAccount ? [] : billingReceipts}
          timetableSlots={scopedSlots}
          teachers={scopedTeachers}
          rooms={scopedRooms}
          grades={scopedGrades}
          attendanceSessions={scopedAttendance}
          permissions={currentUser.permissions}
          isOwner={currentUser.role === 'owner'}
          currentUser={currentUser}
          searchQuery={searchQuery}
          enrollments={scopedEnrollments}
          onAddStudent={handleAddStudent}
          onUpdateStudent={handleUpdateStudent}
          onDeleteStudent={handleDeleteStudent}
          onReserveStudent={handleReserveStudent}
          onDropStudent={handleDropStudent}
          onReEnrollStudent={handleReEnrollStudent}
          onOpenImportExportModal={() => setIsImportExportModalOpen(true)}
          onOpenTuition={() => navigateTo('tuition')}
          onCreateProgram={handleCreateProgram}
          onAddClass={handleAddClass}
          onUpdateGrade={handleUpdateGrade}
        />
      );
    case 'teachers':
      return (
        <TeacherManager
          teachers={teachers}
          classes={classes}
          permissions={currentUser.permissions}
          isOwner={currentUser.role === 'owner'}
          searchQuery={searchQuery}
          onAddTeacher={handleAddTeacher}
          onSaveTeacher={handleSaveTeacher}
          onUpdateTeacher={handleUpdateTeacher}
          onDeleteTeacher={handleDeleteTeacher}
          onEditClass={(classroom) => {
            setClassEditRequest(classroom);
            navigateTo('classes');
          }}
        />
      );
    case 'classes':
      return (
        <ClassManager
          classes={classes}
          teachers={teachers}
          rooms={rooms}
          programs={programs}
          students={students}
          receipts={billingReceipts}
          timetableSlots={timetableSlots}
          permissions={currentUser.permissions}
          isOwner={currentUser.role === 'owner'}
          searchQuery={searchQuery}
          enrollments={enrollments}
          attendanceSessions={attendanceSessions}
          scheduleChanges={scheduleChanges}
          onAddClass={handleAddClass}
          onUpdateClass={handleUpdateClass}
          onDeleteClass={handleDeleteClass}
          onReplaceClassSchedule={handleReplaceClassSchedule}
          onCreateRoom={handleAddRoom}
          onCreateProgram={handleCreateProgram}
          onCreateTeacher={handleAddTeacher}
          onAddStudent={handleAddStudent}
          onUpdateStudent={handleUpdateStudent}
          editRequest={classEditRequest}
          onEditRequestHandled={() => setClassEditRequest(null)}
        />
      );
    case 'rooms':
      return (
        <RoomManager
          rooms={rooms}
          classes={classes}
          permissions={currentUser.permissions}
          isOwner={currentUser.role === 'owner'}
          onAddRoom={handleAddRoom}
          onUpdateRoom={handleUpdateRoom}
          onDeleteRoom={handleDeleteRoom}
        />
      );
    case 'timetable':
      return (
        <TimetableManager
          permissions={currentUser.permissions}
          timetableSlots={timetableSlots}
          classes={classes}
          teachers={teachers}
          rooms={rooms}
          isOwner={currentUser.role === 'owner'}
          scheduleChanges={scheduleChanges}
          attendanceSessions={attendanceSessions}
          onSaveChange={handleSaveScheduleChange}
          onDeleteChange={handleDeleteScheduleChange}
          onAddSlot={handleAddSlot}
          onSaveSlots={handleSaveSlots}
          onUpdateSlot={handleUpdateSlot}
          onDeleteSlot={handleDeleteSlot}
        />
      );
    case 'teacher-schedule':
      return (
        <TeacherScheduleMatrix
          scheduleChanges={scheduleChanges}
          attendanceSessions={attendanceSessions}
          teachers={teachers}
          timetableSlots={timetableSlots}
          classes={classes}
          rooms={rooms}
          isOwner={currentUser.role === 'owner'}
          currentUser={currentUser}
          permissions={currentUser.permissions}
          onAddSlot={handleAddSlot}
          onSaveSlots={handleSaveSlots}
          onUpdateSlot={handleUpdateSlot}
          onDeleteSlot={handleDeleteSlot}
          onSaveChange={handleSaveScheduleChange}
          onDeleteChange={handleDeleteScheduleChange}
        />
      );
    case 'attendance':
      return (
        <AttendanceManager
          classes={classes}
          students={students}
          teachers={teachers}
          attendanceSessions={attendanceSessions}
          timetableSlots={timetableSlots}
          scheduleChanges={scheduleChanges}
          enrollments={enrollments}
          request={taskRequest?.tab === 'attendance' ? taskRequest : null}
          onRequestHandled={() => setTaskRequest(null)}
          onSaveSession={handleSaveAttendanceSession}
          onDeleteSession={handleDeleteAttendanceSession}
          onRecordParentContact={handleRecordParentContact}
          centerName={settings.name}
          isOwner={currentUser.role === 'owner'}
          currentUser={currentUser}
        />
      );
    case 'admissions':
      return (
        <AdmissionsManager
          students={students}
          programs={programs}
          classes={classes}
          teachers={teachers}
          permissions={currentUser.permissions}
          isOwner={currentUser.role === 'owner'}
          onAddStudent={handleAddStudent}
          onUpdateStudent={handleUpdateStudent}
          onDeleteStudent={handleDeleteStudent}
          onEnrollStudent={handleEnrollStudent}
        />
      );
    case 'programs':
      return (
        <CourseProgramManager
          permissions={currentUser.permissions}
          programs={programs}
          classes={classes}
          students={students}
          onAddProgram={handleAddProgram}
          onUpdateProgram={handleUpdateProgram}
          onDeleteProgram={handleDeleteProgram}
          onUpdateStudent={handleUpdateStudent}
          isOwner={currentUser.role === 'owner'}
        />
      );
    case 'grades':
      return (
        <GradeManager
          grades={grades}
          students={students}
          classes={classes}
          teachers={teachers}
          programs={programs}
          settings={settings}
          permissions={currentUser.permissions}
          isOwner={currentUser.role === 'owner'}
          currentUser={currentUser}
          onUpdateGrade={handleUpdateGrade}
        />
      );
    case 'tuition':
      return (
        <TuitionManager
          receipts={receipts}
          students={students}
          classes={classes}
          programs={programs}
          permissions={currentUser.permissions}
          settings={settings}
          isOwner={currentUser.role === 'owner'}
          requestReceiptId={taskRequest?.tab === 'tuition' ? taskRequest.receiptId : undefined}
          onRequestHandled={() => setTaskRequest(null)}
          attendanceSessions={attendanceSessions}
          onAddReceipt={handleAddReceipt}
          onUpdateReceipt={handleUpdateReceipt}
          onDeleteReceipt={handleDeleteReceipt}
        />
      );
    case 'excel-import-export':
      return (
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <h3 className="font-bold text-lg text-slate-900 mb-2">Nhập / Xuất Excel</h3>
          <p className="text-xs text-slate-500 mb-4">
            Quản lý nhập dữ liệu hàng loạt và xuất Workbook nhiều Sheet liên kết công thức
          </p>
          <button
            onClick={() => setIsImportExportModalOpen(true)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-bold text-xs shadow-xs transition"
          >
            Mở Cửa Sổ Import / Export Excel
          </button>
        </div>
      );
    case 'reports':
      return (
        <ReportView
          students={students}
          teachers={teachers}
          classes={classes}
          programs={programs}
          receipts={billingReceipts}
          onNavigateTab={navigateTo}
        />
      );
    case 'data-consistency':
      return (
        <DataConsistencyChecker
          students={students}
          classrooms={classes}
          receipts={receipts}
          programs={programs}
          onDataFixed={handleDataFixed}
        />
      );
    case 'backups':
      return (
        <Suspense
          fallback={<div className="p-6 text-sm text-slate-500">Đang tải công cụ sao lưu…</div>}
        >
          <BackupManager
            backups={backups}
            settings={settings}
            students={students}
            teachers={teachers}
            rooms={rooms}
            classes={classes}
            receipts={receipts}
            grades={grades}
            programs={programs}
            timetableSlots={timetableSlots}
            activityLogs={activityLogs}
            enrollments={enrollments}
            scheduleChanges={scheduleChanges}
            attendanceSessions={attendanceSessions}
            onOpenImportExportModal={() => setIsImportExportModalOpen(true)}
            onBackupCreated={handleBackupCreated}
            onRestoreBackup={handleRestoreBackup}
          />
        </Suspense>
      );
    case 'activity-logs':
      return (
        <ActivityLogView
          logs={visibleActivityLogs}
          accountLogs={visibleAccountLogs}
          isAccountAuditLoading={isAccountAuditLoading}
          accountAuditError={accountAuditError}
          onRefreshAccountLogs={() => void loadAccountAuditLogs()}
        />
      );
    case 'settings':
      return (
        <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs">
          <h3 className="font-bold text-lg text-slate-900 mb-2">Cài Đặt Hệ Thống</h3>
          <p className="text-xs text-slate-500 mb-4">
            Thông tin trung tâm & cấu hình gửi email tự động
          </p>
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-xs"
          >
            Chỉnh Sửa Cài Đặt Hệ Thống
          </button>
        </div>
      );
    default:
      return null;
  }
}
