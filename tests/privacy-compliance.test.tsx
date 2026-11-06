// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PrivacyPolicyDialog } from '../src/modules/privacy/PrivacyPolicyDialog';
import { PRIVACY_POLICY_VERSION } from '../src/modules/privacy/privacyPolicy';

afterEach(cleanup);

it('publishes the current policy version, guardian evidence limits and request response targets', () => {
  render(<PrivacyPolicyDialog
    isOpen
    onClose={() => undefined}
    settings={{ name: 'BeeZone', address: 'Tây Ninh', phone: '000', email: 'privacy@example.test' }}
  />);

  expect(PRIVACY_POLICY_VERSION).toBe('2026-11-06.1');
  expect(screen.getByText(/không thay thế văn bản\/bằng chứng gốc/i)).toBeTruthy();
  expect(screen.getByText(/tối đa 02 ngày làm việc/i)).toBeTruthy();
  expect(screen.getByText(/không được thiết kế để lưu bản chụp giấy tờ tùy thân/i)).toBeTruthy();
});
