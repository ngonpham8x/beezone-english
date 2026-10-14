import { reportError } from '../lib/diagnostics';
import React from 'react';

export class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { reportError('ui.render', error); }
  render() {
    if (this.state.failed) return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <section role="alert" className="max-w-md rounded-2xl bg-white p-6 text-center shadow-lg">
          <h1 className="text-lg font-bold text-slate-900">Không thể hiển thị trang này</h1>
          <p className="mt-2 text-sm text-slate-600">Đã xảy ra lỗi khi đọc dữ liệu. Tải lại trang để thử lại; dữ liệu đã lưu vẫn được giữ nguyên.</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-amber-500 px-4 py-2 font-bold">Tải lại trang</button>
        </section>
      </main>
    );
    return this.props.children;
  }
}
