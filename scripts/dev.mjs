#!/usr/bin/env node
/**
 * Dev supervisor: runs the local API server and the Vite dev server side by side.
 *
 * Why a supervisor instead of plain `&`:
 *   - a transient crash in one service must not take the other one down;
 *   - losing a WebSocket / an upstream hiccup should not force a manual restart;
 *   - Ctrl+C must actually free both ports (Windows needs a process-tree kill).
 */
import { execFileSync, spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const MAX_RESTARTS = 6;

const services = [
  {
    name: 'api',
    label: '本地服务',
    args: [path.join(root, 'server', 'index.mjs')],
    restarts: 0,
    child: null,
  },
  {
    name: 'web',
    label: '前端页面',
    args: [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js')],
    restarts: 0,
    child: null,
  },
];

let shuttingDown = false;

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (isWin) {
      execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
  }
}

function start(service) {
  const child = spawn(process.execPath, service.args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });
  service.child = child;

  // A service that stayed up for 30s is considered healthy again.
  const stableTimer = setTimeout(() => {
    service.restarts = 0;
  }, 30_000);
  stableTimer.unref?.();

  child.on('error', (err) => {
    console.error(`[${service.label}] 无法启动：${err.message}`);
  });

  child.on('exit', (code, signal) => {
    clearTimeout(stableTimer);
    if (shuttingDown) return;
    console.error(
      `\n[${service.label}] 意外退出（code=${code ?? '-'}${signal ? `，signal=${signal}` : ''}）`,
    );
    if (code === 78) {
      console.error('[本地服务] 端口被占用，已停止自动重启。请关掉占用 8787 的进程后再启动。');
      console.error('  查看占用者： netstat -ano | findstr :8787');
      console.error('  结束占用者： taskkill /F /PID <PID> /T\n');
      return;
    }
    if (service.restarts >= MAX_RESTARTS) {
      console.error(`[${service.label}] 已连续重启 ${MAX_RESTARTS} 次，停止重试。请查看上面的错误信息。`);
      return;
    }
    service.restarts += 1;
    const delay = Math.min(5000, 400 * service.restarts);
    console.log(`[${service.label}] ${(delay / 1000).toFixed(1)}s 后自动重启（第 ${service.restarts} 次）…`);
    const timer = setTimeout(() => {
      if (!shuttingDown) start(service);
    }, delay);
    timer.unref?.();
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n  正在停止本地服务…');
  for (const service of services) killTree(service.child);
  setTimeout(() => process.exit(code), 250);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => {
  for (const service of services) killTree(service.child);
});

console.log('\n  IELTS Speaking Studio - dev mode');
services.forEach(start);
console.log('  API  http://127.0.0.1:8787   前端见 Vite 上方输出');
console.log('  任一服务意外退出会自动重启；Ctrl+C 停止全部\n');
