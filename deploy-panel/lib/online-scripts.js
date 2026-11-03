// 线上脚本模块纯函数库：白名单校验、目录扫描、执行参数拼装、审计记录构造。
// 设计原则（与 server.js 既有安全骨架一致）：
// 1. 用户输入只允许是「固定白名单目录下的纯文件名」：拒绝路径分隔符、. / .. 与隐藏文件；
// 2. 执行参数走数组（spawn 无 shell:true），用户输入永不拼接进 shell 字符串；
// 3. 审计与日志读取均为纯 fs 操作，路径由服务端环境变量注入（测试隔离用），不含用户输入。
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

// 脚本名规则：字母/数字开头，后续仅字母数字与 . _ -；. 与 .. 及隐藏文件天然不匹配
const SCRIPT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
// 审计记录保留的输出摘要字节数（按字符近似截取，超长丢弃头部）
const OUTPUT_TAIL_BYTES = 2048;
// 默认白名单扩展名：本期仅 SQL
const DEFAULT_ALLOWED_EXTS = ['.sql'];

// 白名单扩展名解析：逗号分隔、去空白；无合法段时回退默认 ['.sql']
function parseAllowedExts(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return DEFAULT_ALLOWED_EXTS.slice();
  const valid = raw
    .split(',')
    .map(item => item.trim())
    .filter(item => /^\.[A-Za-z0-9]+$/.test(item));
  if (!valid.length) return DEFAULT_ALLOWED_EXTS.slice();
  return valid;
}

// 脚本名白名单校验：只允许纯文件名 + 白名单扩展名结尾
// 返回 { ok, reason }，server.js 将 reason 作为 400 文案返回
function validateScriptName(name, allowedExts) {
  if (typeof name !== 'string' || name.length === 0) {
    return { ok: false, reason: '脚本名不能为空' };
  }
  if (name.includes('/') || name.includes('\\')) {
    return { ok: false, reason: '脚本名不允许包含路径分隔符' };
  }
  if (name === '.' || name === '..') {
    return { ok: false, reason: '非法脚本名' };
  }
  if (name.startsWith('.')) {
    return { ok: false, reason: '不允许隐藏文件' };
  }
  if (!SCRIPT_NAME_RE.test(name)) {
    return { ok: false, reason: '脚本名仅允许字母数字开头的文件名（字符限字母数字._-）' };
  }
  const exts = Array.isArray(allowedExts) && allowedExts.length ? allowedExts : DEFAULT_ALLOWED_EXTS.slice();
  if (!exts.some(ext => name.endsWith(ext))) {
    return { ok: false, reason: `扩展名必须是 ${exts.join(' 或 ')} 之一` };
  }
  return { ok: true, reason: '' };
}

// 扫描白名单目录：只返回普通文件（子目录/符号链接排除），输出 name/size/mtime
// 目录不存在返回空数组（首次部署尚未建目录时不报错）
function listOnlineScripts(dir, exts) {
  const allowed = Array.isArray(exts) && exts.length ? exts : DEFAULT_ALLOWED_EXTS.slice();
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return [];
    throw error;
  }
  const items = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    // 与 validateScriptName 同一防线：隐藏文件不进入白名单列表
    if (entry.name.startsWith('.')) continue;
    if (!allowed.some(ext => entry.name.endsWith(ext))) continue;
    const full = path.join(dir, entry.name);
    const stat = fs.statSync(full);
    items.push({ name: entry.name, size: stat.size, mtime: stat.mtime.toISOString() });
  }
  items.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return items;
}

// 在仓库目录执行 git pull --ff-only（列表刷新即拉取最新代码）。
// 安全约束：命令与参数完全固定、无 shell:true，cwd 由服务端环境变量注入，不含用户输入。
// 返回 { ok, output }：ok 仅看退出码；spawnError（如 git 不存在）与超时（status=null，
// Node 已 SIGTERM 子进程）同样归一化为 ok:false，output 携带原因供前端展示。
// 调用方须知：本函数是「尽力而为」——失败不应阻塞列表返回；执行期的基线安全
// 仍由 run-online.sh 自身的 git pull --ff-only（fail-closed）兜底。
function pullLatestCode({ cwd, timeoutMs }) {
  let result;
  try {
    result = spawnSync('git', ['pull', '--ff-only'], { cwd, timeout: timeoutMs, encoding: 'utf8' });
  } catch (error) {
    return { ok: false, output: `git pull 启动失败：${error.message}` };
  }
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (result.error) {
    return { ok: false, output: `git pull 异常：${result.error.message}${output ? `\n${output}` : ''}` };
  }
  return { ok: result.status === 0, output: output || (result.status === 0 ? '' : `退出码 ${result.status}`) };
}

// 拼装执行器 spawn 参数：固定 /bin/bash + 数组参数，无 shell:true。
// runnerPath/scriptName 均兜底拒绝 shell 元字符与换行（双保险，调用方应已各自校验）。
// 返回 { command, args }
function buildRunnerArgs(runnerPath, scriptName) {
  if (typeof runnerPath !== 'string' || !runnerPath.trim()) {
    throw new Error('执行器路径不能为空');
  }
  if (typeof scriptName !== 'string' || !scriptName.trim()) {
    throw new Error('脚本名不能为空');
  }
  for (const value of [runnerPath, scriptName]) {
    if (/[;|&$`\n\r]/.test(value)) {
      throw new Error('执行参数包含非法字符');
    }
  }
  return { command: '/bin/bash', args: [runnerPath, scriptName] };
}

// 密钥指纹：共享密钥无个人身份，取 sha256 前 8 位仅供区分密钥更换事件
function secretFingerprint(secret) {
  if (!secret) return '';
  return crypto.createHash('sha256').update(String(secret)).digest('hex').slice(0, 8);
}

// 审计记录构造：时间、脚本名、来源 IP、密钥指纹、退出码、耗时、是否超时、输出末 2KB 摘要
function buildAuditRecord({ scriptName, ip, secret, exitCode, durationMs, timedOut, output }) {
  const outputText = String(output || '');
  return {
    time: new Date().toISOString(),
    script: scriptName,
    ip: ip || '',
    secretFingerprint: secretFingerprint(secret),
    exitCode: Number.isFinite(exitCode) ? exitCode : null,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    timedOut: Boolean(timedOut),
    outputTail: outputText.length > OUTPUT_TAIL_BYTES ? outputText.slice(-OUTPUT_TAIL_BYTES) : outputText
  };
}

// 追加一条审计记录到 JSONL 文件（目录不存在时递归创建，测试注入临时目录用）
function appendAuditFile(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
}

// 读取 JSONL 审计文件末 limit 条有效记录；坏行跳过（先解析后截取，坏行不占名额），文件不存在返回空数组
function readAuditTail(file, limit) {
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (error) {
    return [];
  }
  const records = [];
  for (const line of text.split('\n').filter(Boolean)) {
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      // 跳过损坏行，不影响其余审计读取
    }
  }
  return records.slice(-limit);
}

module.exports = {
  SCRIPT_NAME_RE,
  OUTPUT_TAIL_BYTES,
  DEFAULT_ALLOWED_EXTS,
  parseAllowedExts,
  validateScriptName,
  listOnlineScripts,
  pullLatestCode,
  buildRunnerArgs,
  secretFingerprint,
  buildAuditRecord,
  appendAuditFile,
  readAuditTail
};
