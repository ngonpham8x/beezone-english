// @vitest-environment jsdom
import React, { StrictMode, useState } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Header } from '../src/components/Header';
import { Sidebar } from '../src/components/Sidebar';
import { DialogFrame } from '../src/components/DialogFrame';
import { GradeManager } from '../src/components/GradeManager';
import { LoginModal } from '../src/components/LoginModal';
import { TuitionManager } from '../src/components/TuitionManager';
import { DEV_OWNER_ACCOUNT, OWNER_PERMISSIONS } from '../src/lib/auth';
import { useResponsiveView } from '../src/hooks/useResponsive';
import { LanguageProvider } from '../src/context/LanguageContext';
import * as initial from '../src/mock/initialData';

vi.mock('../src/lib/supabase', () => ({ isSupabaseConfigured: false, isLocalPreview: true, supabase: null }));

let width = 1024;
let media: Array<{ target: EventTarget; query: string; matches: boolean }> = [];
const matches = (query: string) => {
  const max = /max-width:\s*(\d+)px/.exec(query);
  const min = /min-width:\s*(\d+)px/.exec(query);
  return (!max || width <= Number(max[1])) && (!min || width >= Number(min[1]));
};
function viewport(nextWidth: number, height = 800) {
  act(() => {
    width = nextWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    media.forEach(entry => {
      const next = matches(entry.query);
      if (next !== entry.matches) { entry.matches = next; entry.target.dispatchEvent(new Event('change')); }
    });
    window.dispatchEvent(new Event('resize'));
  });
}
beforeEach(() => {
  media = [];
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    const target = new EventTarget();
    const entry = { target, query, matches: matches(query) }; media.push(entry);
    return { get matches() { return entry.matches; }, media: query, addEventListener: target.addEventListener.bind(target), removeEventListener: target.removeEventListener.bind(target) };
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); viewport(1024); });

function Shell() {
  const [collapsed, setCollapsed] = useState(width < 1280);
  const [tab, setTab] = useState('dashboard');
  const [query, setQuery] = useState('');
  return <>
    <Header currentUser={{ ...DEV_OWNER_ACCOUNT, name: 'Tên tài khoản quản lý rất dài để kiểm tra giao diện' }} settings={initial.initialSettings} onOpenLogin={vi.fn()} onOpenUserManagement={vi.fn()} onOpenBackupModal={vi.fn()} onOpenSettingsModal={vi.fn()} onLogout={vi.fn()} searchQuery={query} setSearchQuery={setQuery} sidebarCollapsed={collapsed} onToggleSidebar={() => setCollapsed(value => !value)} />
    <Sidebar currentUser={DEV_OWNER_ACCOUNT} activeTab={tab} setActiveTab={setTab} collapsed={collapsed} setCollapsed={setCollapsed} />
    <p data-testid="page">{tab}</p>
  </>;
}

// These tests verify viewport-dependent behavior. jsdom cannot measure pixel layout.
it.each([
  [320, 568], [360, 800], [390, 844], [414, 896], [640, 360],
  [768, 1024], [820, 1180], [1024, 768], [1280, 800], [1440, 900], [1920, 1080],
])('keeps navigation and search usable at %sx%s', (w, h) => {
  viewport(w, h);
  render(<LanguageProvider><Shell /></LanguageProvider>);
  if (w < 1280) fireEvent.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));
  const sidebar = document.getElementById('primary-navigation')!;
  expect(sidebar.getAttribute('role')).toBe(w < 1024 ? 'dialog' : null);
  expect(document.body.style.overflow).toBe(w < 1024 ? 'hidden' : '');
  const student = within(sidebar).getByRole('button', { name: /Học viên/i });
  fireEvent.click(student);
  expect(screen.getByTestId('page').textContent).toBe('students');
  expect(student.getAttribute('aria-current')).toBe('page');
  expect(document.body.style.overflow).toBe('');
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  const search = screen.getByRole('textbox', { name: w < 1024 ? 'Tìm học viên, lớp học hoặc giáo viên' : 'Tìm học viên hoặc lớp học' });
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: 'nguyen' } });
  expect((search as HTMLInputElement).value).toBe('nguyen');
});

it('reflows the default view on rotation and retains an explicit user choice', () => {
  viewport(390, 844);
  const hook = renderHook(() => useResponsiveView('card', 'table'));
  expect(hook.result.current[0]).toBe('card');
  viewport(844, 390);
  expect(hook.result.current[0]).toBe('table');
  act(() => hook.result.current[1]('card'));
  viewport(1440, 900);
  expect(hook.result.current[0]).toBe('card');
});

it('switches the actual grade screen on resize without losing the chosen view', () => {
  viewport(390, 844);
  render(<GradeManager grades={initial.initialGrades} students={initial.initialStudents} classes={initial.initialClasses} teachers={initial.initialTeachers} programs={initial.initialPrograms} settings={initial.initialSettings} permissions={OWNER_PERMISSIONS} currentUser={DEV_OWNER_ACCOUNT} isOwner onUpdateGrade={vi.fn()} />);
  const table = screen.getByRole('button', { name: 'Dạng Bảng' });
  const cards = screen.getByRole('button', { name: 'Dạng Thẻ Mobile' });
  expect(cards.getAttribute('aria-pressed')).toBe('true');
  viewport(1024, 768);
  expect(table.getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(cards);
  viewport(1920, 1080);
  expect(cards.getAttribute('aria-pressed')).toBe('true');
});

it('traps focus, closes with Escape and restores focus and scrolling in StrictMode', () => {
  const close = vi.fn();
  function Example() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Mở biểu mẫu</button>{open && <DialogFrame label="Biểu mẫu" onClose={() => { close(); setOpen(false); }} className="fixed inset-0"><div className="dialog-panel"><button>Đầu</button><input aria-label="Tên" /><button>Cuối</button></div></DialogFrame>}</>;
  }
  render(<StrictMode><Example /></StrictMode>);
  const trigger = screen.getByRole('button', { name: 'Mở biểu mẫu' });
  trigger.focus(); fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Biểu mẫu' });
  expect(document.activeElement).toBe(dialog);
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Đầu' }));
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cuối' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(close).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe('');
});

it('only dismisses the topmost nested dialog and keeps the parent scroll lock', () => {
  const parentClose = vi.fn();
  function Example() {
    const [child, setChild] = useState(false);
    return <DialogFrame label="Phiếu điểm" onClose={parentClose} className="fixed inset-0"><div className="dialog-panel"><button onClick={() => setChild(true)}>Chia sẻ</button>{child && <DialogFrame label="Chia sẻ" onClose={() => setChild(false)} className="fixed inset-0"><div className="dialog-panel"><button>Đóng con</button></div></DialogFrame>}</div></DialogFrame>;
  }
  render(<Example />);
  fireEvent.click(screen.getByRole('button', { name: 'Chia sẻ' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Chia sẻ' })).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Phiếu điểm' })).toBeTruthy();
  expect(parentClose).not.toHaveBeenCalled();
  expect(document.body.style.overflow).toBe('hidden');
});

it('follows visual viewport changes when the keyboard reduces available height', () => {
  const target = new EventTarget();
  const visual = Object.assign(target, { height: 844, offsetTop: 0 });
  vi.stubGlobal('visualViewport', visual);
  render(<DialogFrame label="Biểu mẫu bàn phím" className="fixed inset-0"><div className="dialog-panel"><input /></div></DialogFrame>);
  const dialog = screen.getByRole('dialog');
  expect(dialog.style.getPropertyValue('--dialog-height')).toBe('844px');
  act(() => { visual.height = 320; visual.offsetTop = 12; target.dispatchEvent(new Event('resize')); });
  expect(dialog.style.getPropertyValue('--dialog-height')).toBe('320px');
  expect(dialog.style.getPropertyValue('--dialog-top')).toBe('12px');
});

it('makes owner account management reachable from the account dialog on phones', () => {
  viewport(320, 568);
  const manage = vi.fn(), close = vi.fn();
  render(<LoginModal isOpen currentUser={DEV_OWNER_ACCOUNT} onClose={close} onLogout={vi.fn()} onManageAccounts={manage} />);
  fireEvent.click(screen.getByRole('button', { name: 'Quản lý tài khoản và phân quyền' }));
  expect(close).toHaveBeenCalledOnce();
  expect(manage).toHaveBeenCalledOnce();
});

it('cancels receipt deletion when Escape dismisses its confirmation', () => {
  viewport(390, 844);
  const remove = vi.fn();
  render(<TuitionManager receipts={initial.initialTuitionReceipts} students={initial.initialStudents} classes={initial.initialClasses} programs={initial.initialPrograms} settings={initial.initialSettings} permissions={OWNER_PERMISSIONS} isOwner onAddReceipt={vi.fn()} onUpdateReceipt={vi.fn()} onDeleteReceipt={remove} />);
  fireEvent.click(screen.getAllByTitle('Xóa phiếu thu')[0]);
  expect(screen.getByRole('dialog', { name: 'Xác nhận thao tác phiếu thu' })).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(remove).not.toHaveBeenCalled();
});

it('releases the drawer lock when rotating into a desktop layout', () => {
  viewport(820, 1180);
  render(<LanguageProvider><Shell /></LanguageProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Mở menu điều hướng' }));
  expect(document.body.style.overflow).toBe('hidden');
  viewport(1180, 820);
  expect(document.body.style.overflow).toBe('');
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('includes the preview notice in the measured header height', () => {
  viewport(390, 844);
  let measuredHeight = 88;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    x: 0, y: 0, top: 0, left: 0, right: 390, bottom: measuredHeight,
    width: 390, height: measuredHeight, toJSON: () => ({}),
  }));
  render(<LanguageProvider><Header currentUser={DEV_OWNER_ACCOUNT} settings={initial.initialSettings} onOpenLogin={vi.fn()} onOpenUserManagement={vi.fn()} onOpenBackupModal={vi.fn()} onOpenSettingsModal={vi.fn()} onLogout={vi.fn()} searchQuery="" setSearchQuery={vi.fn()} sidebarCollapsed onToggleSidebar={vi.fn()} statusNotice={<div>Bản xem thử</div>} /></LanguageProvider>);
  expect(screen.getByRole('banner').contains(screen.getByText('Bản xem thử'))).toBe(true);
  expect(document.documentElement.style.getPropertyValue('--app-header-height')).toBe('88px');
  act(() => { measuredHeight = 116; window.dispatchEvent(new Event('resize')); });
  expect(document.documentElement.style.getPropertyValue('--app-header-height')).toBe('116px');
});
