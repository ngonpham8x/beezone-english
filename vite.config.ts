import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import usersHandler from './api/admin/users';
import auditHandler from './api/admin/audit-logs';
import { MAX_ADMIN_BODY_BYTES } from './server/request';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const browserKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || '';
  let privilegedKey = browserKey.startsWith('sb_secret_');
  if (browserKey.split('.').length === 3) {
    try { privilegedKey ||= JSON.parse(Buffer.from(browserKey.split('.')[1], 'base64url').toString()).role === 'service_role'; } catch { /* The auth client handles malformed publishable keys. */ }
  }
  if (privilegedKey) throw new Error('Không được đặt Supabase secret/service-role key vào biến VITE_.');
  for (const key of ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'APP_URL', 'ALLOWED_ORIGINS']) {
    if (env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [react(), tailwindcss(), {
      name: 'protected-admin-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const route = req.url?.split('?')[0];
          const handler = route === '/api/admin/users' ? usersHandler : route === '/api/admin/audit-logs' ? auditHandler : null;
          if (!handler) return next();
          const response = Object.assign(res, {
            status(code: number) { res.statusCode = code; return response; },
            json(body: unknown) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); },
          });
          try {
            const chunks: Buffer[] = [];
            let bytes = 0;
            for await (const chunk of req) {
              const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              bytes += buffer.length;
              if (bytes > MAX_ADMIN_BODY_BYTES) { response.status(413).json({ error: 'Yêu cầu quá lớn.' }); return; }
              chunks.push(buffer);
            }
            await handler(Object.assign(req, { body: Buffer.concat(chunks).toString('utf8') }), response);
          } catch {
            if (!res.headersSent) response.status(500).json({ error: 'Không thể xử lý yêu cầu. Vui lòng thử lại.' });
          }
        });
      },
    }],
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
    esbuild: { drop: mode === 'production' ? ['debugger'] : [] },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (/exceljs|jszip|archiver/.test(id)) return 'excel-vendor';
            if (/recharts|d3-|victory/.test(id)) return 'charts-vendor';
            if (id.includes('@supabase')) return 'supabase-vendor';
          },
        },
      },
    },
  };
});
