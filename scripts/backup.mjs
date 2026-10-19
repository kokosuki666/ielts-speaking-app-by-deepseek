#!/usr/bin/env node
/**
 * Source backup: creates a git bundle of the repository into a folder outside
 * the project (default: ..\ielts-speaking-backups).
 *
 *   npm run backup
 *   npm run backup -- D:\some\folder
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.resolve(process.argv[2] || path.join(root, '..', 'ielts-speaking-backups'));

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: root, stdio: 'inherit', ...options });
}

if (!fs.existsSync(path.join(root, '.git'))) {
  console.error('这个目录还不是 git 仓库，先运行：git init && git add -A && git commit -m "init"');
  process.exit(1);
}

fs.mkdirSync(target, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const bundle = path.join(target, `ielts-speaking-${stamp}.bundle`);

git(['bundle', 'create', bundle, '--all']);
console.log(`\n已备份到 ${bundle}`);
console.log('恢复方式：git clone <bundle> ielts-speaking-webapp\n');
