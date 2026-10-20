// @vitest-environment jsdom
import { submitForm } from './submitForm';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { GradeManager } from '../src/modules/grades/GradeManager';
import { AttendanceManager } from '../src/modules/attendance/AttendanceManager';
import { SystemSettingsModal } from '../src/modules/system/SystemSettingsModal';
import { UserManagementModal } from '../src/modules/auth/UserManagementModal';
import { OWNER_PERMISSIONS, DEV_OWNER_ACCOUNT } from '../src/lib/auth';
import * as initial from '../src/mock/initialData';

vi.mock('../src/lib/supabase', () => ({ isSupabaseConfigured: true, isLocalPreview: false, supabase: {} }));
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('workflow regressions', () => {
  it('can create grades for a student without a pre-existing grade row', () => {
    const save = vi.fn();
    const student = initial.initialStudents.find(s => s.classId === initial.initialClasses[0].id)!;
    render(<GradeManager grades={[]} students={[student]} classes={[initial.initialClasses[0]]} permissions={OWNER_PERMISSIONS} isOwner onUpdateGrade={save} />);
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '8' } });
    expect(save).toHaveBeenCalled();
    expect(save.mock.lastCall![0]).toMatchObject({ studentId: student.id, classId: student.classId, listening: 8 });
  });
  it('keeps a transferred student in the historical attendance session', () => {
    const student = initial.initialStudents[0];
    const classroom = initial.initialClasses.find(c => c.id === student.classId)!;
    render(<AttendanceManager classes={[classroom]} students={[{ ...student, classId: 'transferred' }]} teachers={[]} attendanceSessions={[{ id: 'a1', classId: classroom.id, date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), lessonTopic: 'Lesson', entries: [{ studentId: student.id, status: 'present' }] }]} onSaveSession={vi.fn()} isOwner />);
    expect(screen.getAllByText(student.name).length).toBeGreaterThan(0);
  });
  it('refreshes settings when a previously closed dialog reopens', () => {
    const props = { isOpen: true, onClose: vi.fn(), settings: initial.initialSettings, onUpdateSettings: vi.fn() };
    const view = render(<SystemSettingsModal {...props} />);
    const input = screen.getByDisplayValue(initial.initialSettings.name);
    fireEvent.change(input, { target: { value: 'Unsaved draft' } });
    view.rerender(<SystemSettingsModal {...props} isOpen={false} />);
    view.rerender(<SystemSettingsModal {...props} settings={{ ...initial.initialSettings, name: 'Updated centre' }} />);
    expect(screen.getByDisplayValue('Updated centre')).toBeTruthy();
    expect(screen.queryByDisplayValue('Unsaved draft')).toBeNull();
  });
  it('does not claim account creation succeeded when the server returns HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>fallback</html>', { headers: { 'Content-Type': 'text/html' } })));
    render(<UserManagementModal isOpen onClose={vi.fn()} accessToken="test" currentUser={DEV_OWNER_ACCOUNT} />);
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'Test Account' } });
    fireEvent.change(inputs[1], { target: { value: 'demo@example.test' } });
    submitForm(inputs[0].closest('form')!);
    await screen.findByText('Không thể cấp quyền Google.');
    expect(screen.queryByText(/Đã cấp quyền\. Người này/)).toBeNull();
    vi.unstubAllGlobals();
  });
});
