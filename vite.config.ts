import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'mock-admin-api-dev',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const url = req.url || '';
            if (url.startsWith('/api/admin/audit-logs')) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              res.end(JSON.stringify({
                logs: [
                  {
                    id: 'AUD-001',
                    occurredAt: '2026-10-01T08:00:00Z',
                    action: 'ACCOUNT_PROVISIONED',
                    actorName: 'Hệ thống Quản Trị',
                    targetName: 'Chủ Trung Tâm (beezone.englishcenter@gmail.com)',
                    targetRole: 'owner',
                    details: 'Khởi tạo tài khoản Quản trị trưởng hệ thống BeeZone English.'
                  },
                  {
                    id: 'AUD-002',
                    occurredAt: '2026-10-01T08:05:00Z',
                    action: 'ACCOUNT_PROVISIONED',
                    actorName: 'Chủ Trung Tâm',
                    targetName: 'Quản Trị Viên (duyngonpham1980@gmail.com)',
                    targetRole: 'owner',
                    details: 'Cấp quyền Chủ trung tâm quản trị cơ sở BeeZone.'
                  },
                  {
                    id: 'AUD-003',
                    occurredAt: '2026-10-02T09:15:00Z',
                    action: 'ACCOUNT_UPDATED',
                    actorName: 'Chủ Trung Tâm',
                    targetName: 'Nhân viên học vụ (thpttranphu.pt@gmail.com)',
                    targetRole: 'staff',
                    details: 'Cập nhật phân quyền học viên, học phí, điểm danh và xuất báo cáo.'
                  }
                ]
              }));
              return;
            }
            if (url.startsWith('/api/admin/users')) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              if (req.method === 'POST') {
                res.end(JSON.stringify({ success: true, message: 'Thao tác tài khoản thành công.' }));
              } else {
                res.end(JSON.stringify({
                  users: [
                    {
                      id: 'USR-DEV-001',
                      email: 'beezone.englishcenter@gmail.com',
                      fullName: 'Chủ Trung Tâm',
                      role: 'owner',
                      isActive: true,
                      createdAt: '2026-10-01T08:00:00Z'
                    },
                    {
                      id: 'USR-DEV-002',
                      email: 'duyngonpham1980@gmail.com',
                      fullName: 'Quản Trị Viên',
                      role: 'owner',
                      isActive: true,
                      createdAt: '2026-10-01T08:05:00Z'
                    },
                    {
                      id: 'USR-DEV-003',
                      email: 'thpttranphu.pt@gmail.com',
                      fullName: 'Nhân viên học vụ',
                      role: 'staff',
                      isActive: true,
                      createdAt: '2026-10-02T09:15:00Z'
                    }
                  ]
                }));
              }
              return;
            }
            next();
          });
        }
      }
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
