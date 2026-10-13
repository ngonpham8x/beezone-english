import { DialogFrame } from './DialogFrame';
import React, { useState } from 'react';
import { Room, ClassRoom, StaffPermissions } from '../types';
import {
  DoorOpen,
  Plus,
  Users,
  CheckCircle,
  Wrench,
  Edit,
  Trash2,
  X,
  Save,
  BookOpen
} from 'lucide-react';

interface RoomManagerProps {
  rooms: Room[];
  classes: ClassRoom[];
  permissions: StaffPermissions;
  isOwner: boolean;
  onAddRoom: (r: Room) => void;
  onUpdateRoom: (r: Room) => void;
  onDeleteRoom: (id: string) => void;
}

export const RoomManager: React.FC<RoomManagerProps> = ({
  rooms,
  classes,
  permissions,
  isOwner,
  onAddRoom,
  onUpdateRoom,
  onDeleteRoom
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  // Phòng học là cấu hình dùng chung; chỉ Chủ trung tâm có thể thay đổi.
  const canEdit = isOwner;

  const handleOpenAdd = () => {
    setEditingRoom({
      id: `ROOM_${crypto.randomUUID()}`,
      name: '',
      capacity: 0,
      status: 'available',
      notes: ''
    });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRoom || !editingRoom.name.trim()) return;
    if (!Number.isInteger(editingRoom.capacity) || editingRoom.capacity <= 0) { alert('Sức chứa phòng phải là số nguyên lớn hơn 0.'); return; }

    if (rooms.some(r => r.id === editingRoom.id)) {
      onUpdateRoom(editingRoom);
    } else {
      onAddRoom(editingRoom);
    }

    setIsModalOpen(false);
    setEditingRoom(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="page-heading flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <DoorOpen className="w-6 h-6 text-amber-600" />
            Quản Lý Phòng Học ({rooms.length})
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Danh sách phòng học, phòng Lab, phòng VIP tại Cơ sở 01
          </p>
        </div>

        {canEdit && (
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors shadow-sm flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            Thêm Phòng Học Mới
          </button>
        )}
      </div>

      {/* Grid */}
      <div className="entity-grid entity-grid--rooms">
        {rooms.map((room) => {
          const roomClasses = classes.filter(c => c.roomId === room.id);

          return (
            <div
              key={room.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div className="p-5">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      {room.id}
                    </span>
                    <h3 className="font-bold text-slate-900 text-base mt-1">{room.name}</h3>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        aria-label={`Sửa phòng ${room.name}`}
                        onClick={() => {
                          setEditingRoom(room);
                          setIsModalOpen(true);
                        }}
                        className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        aria-label={`Xóa phòng ${room.name}`}
                        onClick={() => {
                          if (confirm(`Xóa phòng ${room.name}?`)) onDeleteRoom(room.id);
                        }}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2 text-xs text-slate-600 border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    <span>Sức chứa: <strong>{room.capacity > 0 ? `${room.capacity} bàn học` : 'Chưa cập nhật'}</strong></span>
                  </div>

                  <div className="flex items-center gap-2">
                    {room.status === 'available' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle className="w-3 h-3 mr-1" /> Sẵn sàng hoạt động
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800">
                        <Wrench className="w-3 h-3 mr-1" /> Đang bảo trì
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-500 italic mt-1">
                    {room.notes || 'Không có ghi chú'}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100">
                  <div className="text-[11px] font-bold text-slate-700 uppercase mb-1">Lớp đang sử dụng:</div>
                  <div className="flex flex-wrap gap-1">
                    {roomClasses.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">Trống lịch</span>
                    ) : (
                      roomClasses.map(c => (
                        <span key={c.id} className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-800">
                          {c.code}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* EDIT / ADD MODAL */}
      {isModalOpen && editingRoom && (
        <DialogFrame label="Thông tin phòng học" onClose={() => {
                setIsModalOpen(false);
                setEditingRoom(null);
              }} className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="dialog-panel bg-white rounded-2xl max-h-[90vh] max-w-md w-full overflow-y-auto p-6 shadow-xl border border-slate-200 relative custom-scrollbar">
            <button aria-label="Đóng"
              onClick={() => {
                setIsModalOpen(false);
                setEditingRoom(null);
              }}
              className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <DoorOpen className="w-5 h-5 text-amber-600" />
              {rooms.some(r => r.id === editingRoom.id) ? 'Cập Nhật Phòng Học' : 'Thêm Phòng Học Mới'}
            </h3>

            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tên Phòng Học *</label>
                <input
                  type="text"
                  value={editingRoom.name}
                  onChange={(e) => setEditingRoom({ ...editingRoom, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Sức Chứa (Chỗ ngồi)</label>
                <input
                  type="number"
                  value={editingRoom.capacity}
                  onChange={(e) => setEditingRoom({ ...editingRoom, capacity: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Trạng Thái</label>
                <select
                  value={editingRoom.status}
                  onChange={(e) => setEditingRoom({ ...editingRoom, status: e.target.value as 'available' | 'maintenance' })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                >
                  <option value="available">Sẵn sàng hoạt động</option>
                  <option value="maintenance">Đang bảo trì / Sửa chữa</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Ghi Chú Trang Thiết Bị</label>
                <textarea
                  value={editingRoom.notes || ''}
                  onChange={(e) => setEditingRoom({ ...editingRoom, notes: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setEditingRoom(null);
                  }}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-xl font-semibold"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 text-slate-950 rounded-xl font-bold hover:bg-amber-600 flex items-center gap-1.5 shadow-sm active:scale-95"
                >
                  <Save className="w-4 h-4 text-slate-950" /> Lưu Phòng Học
                </button>
              </div>
            </form>
          </div>
        </DialogFrame>
      )}
    </div>
  );
};
