import type { UserAccount } from '../../types';
import { createAttendanceActions } from '../attendance/actions';
import { createClassActions } from '../classes/actions';
import { createGradeActions } from '../grades/actions';
import { createProgramActions } from '../programs/actions';
import { createRoomActions } from '../rooms/actions';
import { createStudentActions } from '../students/actions';
import { createSystemActions } from '../system/actions';
import type { ActivityLogger } from '../system/activityLogger';
import { createTeacherActions } from '../teachers/actions';
import { createScheduleActions } from '../timetable/actions';
import { createTuitionActions } from '../tuition/actions';
import type { CenterStore } from './useCenterStore';

/** Compose domain commands; individual modules depend only on the state slices declared in their Context. */
export function createCenterActions(
  store: CenterStore,
  currentUser: UserAccount | null,
  addLog: ActivityLogger,
) {
  const context = { ...store, currentUser, addLog };
  return {
    ...createStudentActions(context),
    ...createTeacherActions(context),
    ...createClassActions(context),
    ...createRoomActions(context),
    ...createScheduleActions(context),
    ...createGradeActions(context),
    ...createTuitionActions(context),
    ...createAttendanceActions(context),
    ...createProgramActions(context),
    ...createSystemActions(context),
  };
}
export type CenterActions = ReturnType<typeof createCenterActions>;
