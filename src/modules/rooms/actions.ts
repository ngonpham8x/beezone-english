import { showAlert } from '../../lib/dialogs';
import { toast } from '../../lib/toast';
import type { Room, UserAccount } from '../../types';
import { canManageAcademic } from '../../lib/permissions';
import type { CenterStore } from '../center/useCenterStore';
import type { ActivityLogger } from '../system/activityLogger';

type Context = Pick<
  CenterStore,
  'rooms' | 'setRooms' | 'classes' | 'timetableSlots' | 'scheduleChanges'
> & { currentUser: UserAccount | null; addLog: ActivityLogger };
export function createRoomActions({
  rooms,
  setRooms,
  classes,
  timetableSlots,
  scheduleChanges,
  currentUser,
  addLog,
}: Context) {
  // Room CRUD Handlers
  const handleAddRoom = (r: Room) => {
    if (!canManageAcademic(currentUser, 'rooms')) {
      toast.error('Bạn chưa được cấp quyền xóa phòng học.');
      return;
    }
    setRooms((prev) => [...prev, r]);
    addLog('THÊM', 'Phòng học', `Thêm phòng học ${r.name}`);
    toast.success(`Thêm phòng học ${r.name} thành công!`);
  };

  const handleUpdateRoom = (r: Room) => {
    if (!canManageAcademic(currentUser, 'rooms')) return;
    setRooms((prev) => prev.map((item) => (item.id === r.id ? r : item)));
    addLog('SỬA', 'Phòng học', `Cập nhật phòng học ${r.name}`);
    toast.success(`Cập nhật phòng học ${r.name} thành công!`);
  };

  const handleDeleteRoom = (id: string) => {
    if (!canManageAcademic(currentUser, 'rooms')) return;
    if (scheduleChanges.some((c) => c.roomId === id)) {
      const msg = 'Phòng có lịch sử đổi lịch/học bù. Hãy giữ hồ sơ phòng.';
      showAlert(msg);
      return;
    }
    const room = rooms.find((item) => item.id === id);
    const roomClasses = classes.filter((classroom) => classroom.roomId === id);
    if (roomClasses.length > 0 || timetableSlots.some((slot) => slot.roomId === id)) {
      const msg = `Không thể xóa phòng ${room?.name || ''} vì đang được dùng cho ${roomClasses.length} lớp. Hãy đổi phòng cho các lớp trước.`;
      showAlert(msg);
      return;
    }
    setRooms((prev) => prev.filter((item) => item.id !== id));
    addLog('XÓA', 'Phòng học', `Xóa phòng học ${room?.name || ''}`);
    toast.success(`Đã xóa phòng học ${room?.name || ''} thành công!`);
  };

  return { handleAddRoom, handleUpdateRoom, handleDeleteRoom };
}
