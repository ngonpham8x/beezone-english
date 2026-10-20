import { reportError } from '../lib/diagnostics';
import React from 'react';

export class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean; moduleFailure: boolean }> {
  state = { failed: false, moduleFailure: false };
  static getDerivedStateFromError(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    return { failed: true, moduleFailure: /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\w-]+ failed|Unable to preload CSS/i.test(message) };
  }
  componentDidCatch(error: Error) { reportError(this.state.moduleFailure ? 'ui.module' : 'ui.render', error); }
  render() {
    if (this.state.failed) return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <section role="alert" className="max-w-md rounded-2xl bg-white p-6 text-center shadow-lg">
          <h1 className="text-lg font-bold text-slate-900">Không thể hiển thị trang này</h1>
          <p className="mt-2 text-sm text-slate-600">{this.state.moduleFailure
            ? 'Không tải được tệp giao diện. Kiểm tra kết nối rồi tải lại trang để nhận phiên bản hiện tại.'
            : 'Đã xảy ra lỗi hiển thị. Bạn có thể thử mở lại mục này; dữ liệu đã lưu vẫn được giữ nguyên.'}</p>
          <p className="mt-2 text-xs text-slate-500">Mã lỗi: {this.state.moduleFailure ? 'UI-MODULE' : 'UI-RENDER'}</p>
          {!this.state.moduleFailure && <button onClick={() => this.setState({ failed: false, moduleFailure: false })} className="mt-4 mr-2 rounded-xl border border-slate-300 px-4 py-2 font-bold">Thử lại mục này</button>}
          <button onClick={() => window.location.reload()} className="mt-4 rounded-xl bg-amber-500 px-4 py-2 font-bold">Tải lại trang</button>
        </section>
      </main>
    );
    return this.props.children;
  }
}
