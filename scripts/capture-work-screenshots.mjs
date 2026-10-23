import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT_DIR = path.resolve('docs/assets/work');

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('Launching Chrome headless with CDP...');
  const chromeProcess = spawn(
    CHROME_PATH,
    [
      '--headless=new',
      '--disable-gpu',
      '--remote-debugging-port=9222',
      '--window-size=1280,850',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  try {
    let versionData = null;
    for (let i = 0; i < 20; i++) {
      try {
        const res = await fetch('http://127.0.0.1:9222/json/version');
        versionData = await res.json();
        if (versionData) break;
      } catch {
        await sleep(500);
      }
    }

    if (!versionData) throw new Error('Cannot connect to Chrome CDP');

    const listRes = await fetch('http://127.0.0.1:9222/json');
    const targets = await listRes.json();
    const pageTarget = targets.find((t) => t.type === 'page');
    if (!pageTarget) throw new Error('No page target found');

    const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
    let id = 1;
    const callbacks = new Map();

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && callbacks.has(msg.id)) {
        const { resolve, reject } = callbacks.get(msg.id);
        callbacks.delete(msg.id);
        if (msg.error) reject(msg.error);
        else resolve(msg.result);
      }
    };

    await new Promise((resolve) => (ws.onopen = resolve));

    const send = (method, params = {}) => {
      const curId = id++;
      return new Promise((resolve, reject) => {
        callbacks.set(curId, { resolve, reject });
        ws.send(JSON.stringify({ id: curId, method, params }));
      });
    };

    await send('Page.enable');
    await send('Runtime.enable');
    await send('DOM.enable');

    const capture = async (filename, clip = null) => {
      const params = { format: 'png' };
      if (clip) params.clip = clip;
      const res = await send('Page.captureScreenshot', params);
      const buffer = Buffer.from(res.data, 'base64');
      const filePath = path.join(OUT_DIR, filename);
      fs.writeFileSync(filePath, buffer);
      console.log(`Saved screenshot: ${filename} (${buffer.length} bytes)`);
    };

    const evalScript = async (expression) => {
      return await send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
    };

    console.log('Navigating to http://localhost:3000/?tab=work...');
    await send('Page.navigate', { url: 'http://localhost:3000/?tab=work' });

    // Đợi React render xong .bzw-root
    for (let i = 0; i < 30; i++) {
      const check = await evalScript(`Boolean(document.querySelector('.bzw-root'))`);
      if (check.result?.value === true) break;
      await sleep(500);
    }
    await sleep(2000);

    // Bơm dữ liệu mẫu sinh động để tài liệu hướng dẫn trực quan đẹp mắt nhất
    await evalScript(`
      const sampleTasks = [
        {
          id: 'guide-task-1',
          title: 'Trực lễ tân đón học viên ca chiều & phát thẻ bài tập',
          description: 'Chào đón học sinh ca 14h, điểm danh đầu giờ và chuẩn bị tài liệu lớp Kiddy 3A.',
          branch: 'admin',
          assigned_uid: 'acc-hanhchinh',
          work_date: new Date().toISOString().slice(0, 10),
          shift_label: 'Ca chiều',
          priority: 'normal',
          status: 'progress',
          needs_handover: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'guide-task-2',
          title: 'Thu bổ sung học phí đợt 2 & Kiểm tra hóa đơn tồn',
          description: 'Liên hệ 3 phụ huynh học viên lớp Starters còn nợ học phí cuối tháng.',
          branch: 'admin',
          assigned_uid: 'acc-chauoaingua',
          work_date: new Date().toISOString().slice(0, 10),
          shift_label: 'Cuối buổi',
          priority: 'high',
          status: 'unfinished',
          needs_handover: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        {
          id: 'guide-task-3',
          title: 'Giảng dạy Unit 5 bài 2 & Kiểm tra phát âm từ vựng',
          description: 'Luyện tập Speaking theo cặp, chấm bài kiểm tra 15 phút và nhận xét sổ liên lạc.',
          branch: 'training',
          class_label: '[LOP-01] Kiddy 3A',
          assigned_uid: 't1',
          work_date: new Date().toISOString().slice(0, 10),
          shift_label: 'Thứ 7: 18:00 - 19:30',
          priority: 'normal',
          status: 'todo',
          needs_handover: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];
      localStorage.setItem('BEEZONE_WORK_DAILY_V2', JSON.stringify({
        day: new Date().toISOString().slice(0, 10),
        tasks: sampleTasks,
        notes: [
          {
            id: 'n1',
            task_id: 'guide-task-3',
            author_uid: 't1',
            author_name: 'Cô Mai Linh',
            body: 'Các bé phát âm chuẩn Unit 5, bé Nam tiến bộ vượt bậc, đã giao 2 trang bài tập về nhà.',
            created_at: new Date().toISOString()
          }
        ],
        reasons: [],
        handoffs: []
      }));
    `);

    // Tải lại để nạp dữ liệu mẫu
    await send('Page.navigate', { url: 'http://localhost:3000/?tab=work' });
    await sleep(2500);

    // 1. Chụp ảnh Màn hình Hành chính & Quản trị (Thấy đủ 3 cột & Thanh filter hàng ngang)
    console.log('Capturing: 01_hanh_chinh_toan_canh.png');
    await capture('01_hanh_chinh_toan_canh.png');

    // 2. Mở modal Tạo việc và chụp: Hiển thị 3 trường Ngày, Ưu tiên, Trạng thái đã lên 1 hàng ngang
    console.log('Opening create task modal...');
    await evalScript(`
      const createBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Tạo công việc'));
      if (createBtn) createBtn.click();
    `);
    await sleep(800);

    await evalScript(`
      const titleInput = document.querySelector('input[placeholder*="Nhập tên nhiệm vụ"]');
      if (titleInput) {
        titleInput.value = 'Ôn tập kiểm tra giữa kỳ Unit 4 & Phát phiếu bài tập';
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const descInput = document.querySelector('textarea[placeholder*="Mô tả các bước"]');
      if (descInput) {
        descInput.value = 'Giáo viên phát đề ôn tập, hướng dẫn học sinh làm bài và dặn dò phụ huynh ôn bài cuối tuần.';
        descInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // Cuộn modal xuống khu vực 3 trường
      const modalContent = document.querySelector('.bzw-modal-content');
      if (modalContent) modalContent.scrollTop = 280;
    `);
    await sleep(800);

    console.log('Capturing: 02_tao_cong_viec_3_cot_mot_hang.png');
    await capture('02_tao_cong_viec_3_cot_mot_hang.png');

    // 3. Đóng modal tạo việc
    await evalScript(`
      const xBtn = document.querySelector('.bzw-xbtn');
      if (xBtn) xBtn.click();
    `);
    await sleep(600);

    // 4. Chụp giao diện Giáo viên / Đào tạo (ẩn việc hành chính, chỉ hiển thị việc giáo viên & bàn giao)
    console.log('Simulating teacher / training view...');
    await evalScript(`
      // Ẩn cột hành chính (Cột 1)
      const sections = document.querySelectorAll('.bzw-sections section');
      if (sections.length === 3) {
        sections[0].style.display = 'none';
        const container = document.querySelector('.bzw-sections');
        if (container) {
          container.style.gridTemplateColumns = 'minmax(0, 1.25fr) minmax(0, 1fr)';
        }
      }
    `);
    await sleep(800);
    console.log('Capturing: 03_giao_dien_giao_vien_daotao.png');
    await capture('03_giao_dien_giao_vien_daotao.png');

    // 5. Mở modal Ghi chú (Note) xác nhận ca dạy của Giáo viên
    console.log('Opening note modal...');
    await evalScript(`
      const noteBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Ghi chú'));
      if (noteBtn) noteBtn.click();
    `);
    await sleep(800);
    await evalScript(`
      const noteArea = document.querySelector('textarea');
      if (noteArea) {
        noteArea.value = 'Đã hoàn thành buổi dạy Unit 5 bài 2. Học viên tham gia đầy đủ, hào hứng phát biểu. Đã giao bài tập về nhà trang 42-43.';
        noteArea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `);
    await sleep(600);
    console.log('Capturing: 04_ghi_chu_xac_nhan_giao_vien.png');
    await capture('04_ghi_chu_xac_nhan_giao_vien.png');

    // Đóng note modal
    await evalScript(`
      const xBtn = document.querySelector('.bzw-xbtn');
      if (xBtn) xBtn.click();
    `);
    await sleep(500);

    console.log('All screenshots completed successfully!');
    ws.close();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    try {
      chromeProcess.kill();
    } catch {}
  }
}

main();

