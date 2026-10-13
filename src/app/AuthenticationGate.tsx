import { AuthScreen } from '../modules/auth/AuthScreen';
import type { CenterConnection } from '../modules/center/useCenterConnection';
export function AuthenticationGate({ connection }: { connection: CenterConnection }) {
  const {
    currentUser,
    session,
    authStatus,
    authError,
    setAuthError,
    setAuthRetry,
    handleLogout,
    handleDevLogin,
    handleAccountLogin,
  } = connection;
  if (authStatus === 'loading') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4 text-sm font-semibold text-slate-600">
        Đang kiểm tra quyền truy cập…
      </main>
    );
  }

  if (authStatus === 'error') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <section role="alert" className="max-w-md rounded-2xl bg-white p-6 text-center shadow-xl">
          <h1 className="text-lg font-bold">Chưa thể tải hệ thống</h1>
          <p className="mt-2 text-sm text-slate-600">{authError}</p>
          <button
            onClick={() => setAuthRetry((value) => value + 1)}
            className="mt-4 rounded-xl bg-amber-500 px-4 py-2 font-bold"
          >
            Thử lại
          </button>
          <button
            onClick={() =>
              void handleLogout().catch(() =>
                setAuthError('Không thể đăng xuất. Hãy kiểm tra kết nối.'),
              )
            }
            className="ml-3 text-sm font-bold"
          >
            Đăng xuất
          </button>
        </section>
      </main>
    );
  }

  if (authStatus === 'blocked') {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 p-4">
        <section className="max-w-md rounded-2xl border border-red-200 bg-white p-6 text-center shadow-xl">
          <h1 className="font-extrabold text-red-900">Tài khoản chưa được cấp quyền</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Liên hệ Chủ trung tâm để nhận lời mời hoặc kiểm tra lại trạng thái tài khoản.
          </p>
          <button
            onClick={() =>
              void handleLogout().catch(() =>
                setAuthError('Không thể đăng xuất. Hãy kiểm tra kết nối.'),
              )
            }
            className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white"
          >
            Đăng xuất
          </button>
          {authError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {authError}
            </p>
          )}
        </section>
      </main>
    );
  }

  if (!currentUser || !session) {
    return <AuthScreen onDevLogin={handleDevLogin} onAccountLogin={handleAccountLogin} />;
  }

  return null;
}
