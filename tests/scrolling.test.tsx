// @vitest-environment jsdom
import React, { createRef } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HorizontalScroll } from '../src/components/HorizontalScroll';
import { TimetableManager } from '../src/modules/timetable/TimetableManager';
import { TeacherScheduleMatrix } from '../src/modules/timetable/TeacherScheduleMatrix';
import * as initial from '../src/mock/initialData';

let visibleWidth = 600, contentWidth = 1500;
const isViewport = (element: HTMLElement) => element.classList.contains('horizontal-scroll-viewport');
beforeEach(() => {
  visibleWidth = 600; contentWidth = 1500;
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function () { return isViewport(this) ? visibleWidth : 0; });
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(function () { return isViewport(this) ? contentWidth : 0; });
  vi.spyOn(Element.prototype, 'scrollTo').mockImplementation(function (options: any) {
    (this as HTMLElement).scrollLeft = options.left;
    fireEvent.scroll(this);
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('moves the real viewport with the top slider and forwards the scroll ref', () => {
  const ref = createRef<HTMLDivElement>();
  render(<HorizontalScroll ref={ref} label="Học phí"><table><tbody><tr><td>Học viên</td></tr></tbody></table></HorizontalScroll>);
  expect(ref.current).toBe(screen.getByRole('region', { name: 'Học phí' }));
  const slider = screen.getByRole('slider', { name: 'Học phí: vị trí cuộn ngang' });
  expect((slider as HTMLInputElement).max).toBe('900');
  expect((screen.getByRole('button', { name: 'Học phí: cuộn trái' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(slider, { target: { value: '450' } });
  expect(ref.current!.scrollLeft).toBe(450);
  fireEvent.click(screen.getByRole('button', { name: 'Học phí: cuộn phải' }));
  expect(ref.current!.scrollLeft).toBe(900);
  expect((screen.getByRole('button', { name: 'Học phí: cuộn phải' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Học phí: cuộn trái' }));
  expect(ref.current!.scrollLeft).toBe(450);
});

it('keeps the slider synchronized with native scrolling and external controls', () => {
  const ref = createRef<HTMLDivElement>();
  render(<HorizontalScroll ref={ref} label="Lịch"><div>Lịch học</div></HorizontalScroll>);
  ref.current!.scrollLeft = 720;
  fireEvent.scroll(ref.current!);
  expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('720');
  act(() => ref.current!.scrollTo({ left: 900 }));
  expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('900');
});

it('hides unnecessary controls after expanding the viewport', () => {
  render(<HorizontalScroll label="Bảng"><div>Nội dung</div></HorizontalScroll>);
  expect(screen.getByRole('slider')).toBeTruthy();
  visibleWidth = contentWidth;
  act(() => window.dispatchEvent(new Event('resize')));
  expect(screen.queryByRole('slider')).toBeNull();
});

it('supports Home/End on the viewport without intercepting editing keys in fields', () => {
  render(<HorizontalScroll label="Điểm"><input aria-label="Điểm nghe" /></HorizontalScroll>);
  const viewport = screen.getByRole('region', { name: 'Điểm' });
  fireEvent.keyDown(viewport, { key: 'End' });
  expect(viewport.scrollLeft).toBe(900);
  fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Home' });
  expect(viewport.scrollLeft).toBe(900);
  fireEvent.keyDown(viewport, { key: 'Home' });
  expect(viewport.scrollLeft).toBe(0);
});

it('shows all seven weekdays and jumps directly to Saturday/Sunday from the timetable', () => {
  render(<TimetableManager timetableSlots={initial.initialTimetableSlots} classes={initial.initialClasses} teachers={initial.initialTeachers} rooms={initial.initialRooms} isOwner onAddSlot={vi.fn()} onUpdateSlot={vi.fn()} onDeleteSlot={vi.fn()} />);
  expect(screen.getAllByRole('columnheader')).toHaveLength(8);
  expect(screen.getByRole('columnheader', { name: 'Thứ 7' })).toBeTruthy();
  expect(screen.getByRole('columnheader', { name: 'Chủ Nhật' })).toBeTruthy();
  const viewport = screen.getByRole('region', { name: 'Thời khóa biểu' });
  fireEvent.click(screen.getByTitle('Cuộn xem cuối tuần (Thứ 7 & Chủ Nhật)'));
  expect(viewport.scrollLeft).toBe(900);
  expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('900');
  fireEvent.click(screen.getByTitle('Cuộn về đầu tuần (Thứ 2 - Thứ 4)'));
  expect(viewport.scrollLeft).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: /^Chủ Nhật/ }));
  expect(screen.getAllByRole('columnheader')).toHaveLength(2);
  expect(screen.getByRole('columnheader', { name: 'Chủ Nhật' })).toBeTruthy();
});

it('also jumps to the real end of the teacher schedule', () => {
  render(<TeacherScheduleMatrix teachers={initial.initialTeachers} timetableSlots={initial.initialTimetableSlots} classes={initial.initialClasses} rooms={initial.initialRooms} />);
  const viewport = screen.getByRole('region', { name: 'Lịch giáo viên' });
  fireEvent.click(screen.getByTitle('Cuộn xem cuối tuần (Thứ 7 & Chủ Nhật)'));
  expect(viewport.scrollLeft).toBe(900);
});
