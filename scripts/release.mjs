#!/usr/bin/env node
/**
 * One-command release.
 *
 *   npm run release -- 1.4.1 "修复了 xxx"
 *   npm run release -- 1.4.1 --dry-run
 *
 * Steps: validate git state -> bump version -> typecheck + build -> commit ->
 * tag -> push -> create GitHub Release -> upload installers from release/.
 *
 * Auth: GITHUB_TOKEN env var, or the credential already stored by Git
 * Credential Manager (`git credential fill`).
 *
 * Proxy: set HTTPS_PROXY (or pass --proxy http://127.0.0.1:7897).
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const dryRun = flags.has('--dry-run');
const skipBuild = flags.has('--skip-build');
const noPush = flags.has('--no-push');

const proxyFlagIndex = args.indexOf('--proxy');
const proxyUrl =
  (proxyFlagIndex >= 0 ? args[proxyFlagIndex + 1] : undefined) ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  '';

const version = positional[0];
const extraNotes = positional.slice(1).join(' ').trim();

function log(msg) {
  console.log(`  ${msg}`);
}
function fail(msg) {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}
function git(gitArgs, options = {}) {
  try {
    const out = execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', ...options });
    return (out ?? '').toString().trim();
  } catch (err) {
    if (err.code === 'EPERM' || err.code === 'ENOENT') {
      fail(`无法执行 git（${err.code}）：请确认 Git 已安装，并且当前终端有权限运行子进程`);
    }
    throw err;
  }
}
function run(cmd, cmdArgs) {
  log(`$ ${cmd} ${cmdArgs.join(' ')}`);
  const isWin = process.platform === 'win32';
  execFileSync(isWin ? `${cmd}.cmd` : cmd, cmdArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: isWin,
  });
}

function semver(v) {
  const m = String(v).match(/^(\d+)\.(\d+)\.(\d+)$/);
  return m ? m.slice(1).map(Number) : null;
}
function compareVersion(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/* --------------------------------- checks --------------------------------- */

if (flags.has('--help') || !version) {
  console.log(`
用法：npm run release -- <版本号> ["更新说明"] [选项]

  --dry-run       只检查并打印计划，不修改文件、不推送
  --skip-build    跳过 typecheck / build（调试用）
  --no-push       提交打 tag，但不 push、不建 Release
  --proxy <url>   指定 HTTP 代理（默认读 HTTPS_PROXY）

示例：
  npm run release -- 1.4.1 "支持导入 Anki 词单"
`);
  process.exit(flags.has('--help') ? 0 : 1);
}

const next = semver(version);
if (!next) fail(`版本号格式不对：${version}（应为 1.2.3 这种形式）`);

if (!fs.existsSync(path.join(root, '.git'))) fail('当前目录不是 git 仓库');

const branch = git(['branch', '--show-current']);
if (branch !== 'main') fail(`当前分支是 ${branch}，请先切到 main`);

const dirty = git(['status', '--porcelain']);
if (dirty) {
  console.error(dirty);
  fail('工作区不干净：请先提交或 stash 后再发布');
}

const pkgPath = path.join(root, 'package.json');
const lockPath = path.join(root, 'package-lock.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const current = semver(pkg.version);
if (!current) fail(`package.json 里的版本号无法解析：${pkg.version}`);
if (compareVersion(next, current) <= 0) fail(`新版本 ${version} 必须大于当前版本 ${pkg.version}`);

const tag = `v${version}`;
try {
  git(['rev-parse', '--verify', `refs/tags/${tag}`]);
  fail(`标签 ${tag} 已存在`);
} catch {
  /* good: tag does not exist */
}

const remoteUrl = git(['remote', 'get-url', 'origin']);
const slug = (remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/) || []).slice(1);
if (slug.length !== 2) fail(`无法从 origin 解析 owner/repo：${remoteUrl}`);
const [owner, repo] = slug;

log(`仓库：${owner}/${repo}`);
log(`版本：${pkg.version} → ${version}`);
log(`标签：${tag}`);

/* --------------------------------- plan ----------------------------------- */

if (dryRun) {
  log('dry-run：跳过构建、提交、推送与上传');
  log(`将执行：npm run typecheck && npm run build`);
  log(`将修改：package.json / package-lock.json → ${version}`);
  log(`将提交：chore(release): v${version}`);
  log(`将推送：origin main + ${tag}`);
  log(`将创建 Release 并上传 release/ 下的安装包`);
  process.exit(0);
}

/* -------------------------------- build ----------------------------------- */

if (!skipBuild) {
  run('npm', ['run', 'typecheck']);
  run('npm', ['run', 'build']);
}

/* ------------------------------ bump version ------------------------------ */

const oldPkgText = fs.readFileSync(pkgPath, 'utf8');
fs.writeFileSync(pkgPath, oldPkgText.replace(`"version": "${pkg.version}"`, `"version": "${version}"`), 'utf8');

if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = version;
  if (lock.packages && lock.packages['']) lock.packages[''].version = version;
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
}
log(`已更新版本号到 ${version}`);

/* ------------------------------ commit + tag ------------------------------ */

const files = ['package.json', ...(fs.existsSync(lockPath) ? ['package-lock.json'] : [])];
git(['add', ...files]);
git(['commit', '-m', `chore(release): v${version}`]);
git(['tag', '-a', tag, '-m', `IELTS Speaking Studio ${tag}`]);
log(`已提交并创建标签 ${tag}`);

if (noPush) {
  log('--no-push：到此为止。需要时手动 git push origin main && git push origin ' + tag);
  process.exit(0);
}

git(['push', 'origin', 'main'], { stdio: 'inherit' });
git(['push', 'origin', tag], { stdio: 'inherit' });
log('代码与标签已推送');

/* -------------------------------- GitHub ---------------------------------- */

function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();
  try {
    const out = execFileSync('git', ['credential', 'fill'], {
      cwd: root,
      input: 'protocol=https\nhost=github.com\n\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    const match = out.match(/^password=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    /* fall through */
  }
  return '';
}

const token = getToken();
if (!token) {
  console.error('\n✗ 找不到 GitHub 凭据。');
  console.error('  · 设置环境变量 GITHUB_TOKEN=<personal access token>，或');
  console.error('  · 先用 Git 正常 push 一次（凭据会被凭据管理器保存）\n');
  process.exit(1);
}

/** Minimal HTTPS client with optional HTTP CONNECT proxy (streaming uploads). */
async function request(urlString, { method = 'GET', headers = {}, body, json, file } = {}) {
  const url = new URL(urlString);
  let socket = null;

  if (proxyUrl) {
    const proxy = new URL(proxyUrl);
    socket = net.connect(Number(proxy.port || 80), proxy.hostname);
    await new Promise((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    socket.write(`CONNECT ${url.hostname}:443 HTTP/1.1\r\nHost: ${url.hostname}:443\r\n\r\n`);
    await new Promise((resolve, reject) => {
      let buf = '';
      const onData = (chunk) => {
        buf += chunk.toString('latin1');
        if (buf.includes('\r\n\r\n')) {
          socket.off('data', onData);
          if (/^HTTP\/\d\.\d 200/.test(buf)) resolve();
          else reject(new Error(`代理 CONNECT 失败：${buf.split('\r\n')[0]}`));
        }
      };
      socket.on('data', onData);
      socket.once('error', reject);
    });
    socket = tls.connect({ socket, servername: url.hostname });
    await new Promise((resolve, reject) => {
      socket.once('secureConnect', resolve);
      socket.once('error', reject);
    });
  }

  const payload = json !== undefined ? Buffer.from(JSON.stringify(json)) : body;
  const finalHeaders = {
    'User-Agent': 'ielts-speaking-release-script',
    ...headers,
  };
  if (json !== undefined) finalHeaders['Content-Type'] = 'application/json; charset=utf-8';
  if (file) finalHeaders['Content-Length'] = String(fs.statSync(file).size);
  else if (payload) finalHeaders['Content-Length'] = String(payload.length);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: finalHeaders,
        ...(socket ? { createConnection: () => socket } : {}),
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 200 && res.statusCode < 300) resolve({ status: res.statusCode, text });
          else reject(new Error(`GitHub API ${res.statusCode}：${text.slice(0, 400)}`));
        });
      },
    );
    req.on('error', reject);
    if (file) fs.createReadStream(file).pipe(req);
    else req.end(payload);
  });
}

const apiHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
};
const repoApi = `https://api.github.com/repos/${owner}/${repo}`;

log('正在创建 GitHub Release…');
const notes = [
  `## IELTS Speaking Studio ${tag}`,
  '',
  extraNotes || '本版本更新。',
  '',
  '### 安装',
  '',
  '- `IELTS-Speaking-Studio-Setup-*.exe`：安装版',
  '- `IELTS-Speaking-Studio-*-portable.exe`：免安装版',
  '- `SHA256SUMS.txt`：校验和',
  '',
  '> 未做代码签名，Windows 可能提示「未知发布者」，选择「更多信息 → 仍要运行」即可。',
  '',
  `**完整说明见 [README](https://github.com/${owner}/${repo}#readme)。**`,
].join('\n');

const created = await request(`${repoApi}/releases`, {
  method: 'POST',
  headers: apiHeaders,
  json: {
    tag_name: tag,
    name: `IELTS Speaking Studio ${tag}`,
    body: notes,
    draft: false,
    prerelease: false,
  },
});
const release = JSON.parse(created.text);
log(`Release: ${release.html_url}`);

/* ------------------------------ upload assets ----------------------------- */

const releaseDir = path.join(root, 'release');
const assets = fs.existsSync(releaseDir)
  ? fs.readdirSync(releaseDir).filter((f) => f.toLowerCase().endsWith('.exe'))
  : [];

if (assets.length) {
  const sums = assets.map((f) => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(releaseDir, f))).digest('hex');
    return `${hash}  ${f.replace(/\s+/g, '-')}`;
  });
  fs.writeFileSync(path.join(releaseDir, 'SHA256SUMS.txt'), `${sums.join('\n')}\n`, 'utf8');
  assets.push('SHA256SUMS.txt');
}

for (const file of assets) {
  const filePath = path.join(releaseDir, file);
  const name = file.replace(/\s+/g, '-');
  log(`上传 ${name}（${(fs.statSync(filePath).size / 1024 / 1024).toFixed(1)} MB）…`);
  const res = await request(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
    { method: 'POST', headers: { ...apiHeaders, 'Content-Type': 'application/octet-stream' }, file: filePath },
  );
  const asset = JSON.parse(res.text);
  log(`  ✓ ${asset.browser_download_url}`);
}

console.log(`\n✓ 发布完成：${release.html_url}\n`);
