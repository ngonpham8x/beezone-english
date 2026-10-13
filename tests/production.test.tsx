// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../src/App';
vi.mock('../src/lib/supabase', () => ({ isSupabaseConfigured: false, isLocalPreview: false, supabase: null }));
afterEach(cleanup);
it('fails closed in production even when browser storage contains a preview owner', () => {
  sessionStorage.setItem('BEEZONE_DEV_ROLE', 'owner'); sessionStorage.setItem('BEEZONE_ACTIVE_EMAIL', 'beezone.englishcenter@gmail.com');
  render(<App />);
  expect(screen.getByRole('alert').textContent).toMatch(/chưa được cấu hình đăng nhập/);
  expect(screen.queryByText('Xem thử vai trò Chủ trung tâm')).toBeNull();
  expect(screen.queryByText('Đã lưu dữ liệu')).toBeNull();
});
