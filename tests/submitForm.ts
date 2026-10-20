import { fireEvent, screen, within } from '@testing-library/react';

export function submitForm(form: Element) {
  fireEvent.submit(form);
  const confirmation = screen.queryByRole('dialog', { name: 'Xác nhận cập nhật' });
  if (confirmation) fireEvent.click(within(confirmation).getByRole('button', { name: 'Lưu thay đổi' }));
}
