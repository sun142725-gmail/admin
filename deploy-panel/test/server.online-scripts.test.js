// 线上脚本模块集成测试：spawn 子进程运行真实 server.js，fetch 打本机回环 HTTP。
// 隔离措施（AGENTS：不依赖外部服务，不触碰真实运行时状态）：
// - PANEL_ENV_FILE/PANEL_SECRET_FILE 指向临时不存在路径（deploy-panel/.env 实测含 PUBLISH_SECRET
//   键，不隔离则 fail-closed 用例必然被真实密钥破坏）；
// - PANEL_LOG_FILE/PANEL_LOCK_FILE/ONLINE_AUDIT_FILE/PROJECT_PATH 指向临时目录，不触碰真实
//   task.lock 与 logs/；
// - ONLINE_SCRIPT_DIR 指向临时 fixture 目录、ONLINE_SCRIPT_RUNNER 指向 fake bash 执行器，
//   不真调 docker/mysql；除本机回环外无任何网络访问；
// - 列表刷新即拉取用例的 git 远端是同机 bare 仓库（PROJECT_PATH 临时目录自身），无网络访问。
const test = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SERVER_JS = path.join(__dirname, '..', 'server.js');
const TOKEN = 'test-secret';

const FAKE_RUNNER = [
  '#!/bin/bash',
  '# 集成测试桩：模拟线上脚本执行器（不依赖 docker/mysql）；脚本名由 spawn 数组参数 $1 传入',
  'NAME="$1"',
  'echo "fake-runner begin: $NAME"',
  'case "$NAME" in',
  '  a.sql)',
  '    echo "fake-runner done: $NAME"',
  '    if [ -n "${FAKE_EXIT:-}" ] && [ "$FAKE_EXIT" != "0" ]; then exit "$FAKE_EXIT"; fi',
  '    ;;',
  '  sleep.sql)',
  '    sleep 3',
  '    echo "fake-runner done: $NAME"',
  '    ;;',
  '  grandchild.sql)',
  '    # 模拟 run-online.sh:81 的孙进程场景：runner 内后台启动子进程后等待；',
  '    # runner 被 SIGKILL 时（旧实现仅杀父进程），孙进程被收养并继续跑完 sleep —— 进程组杀则一并终止',
  '    bash "$GC_SCRIPT" &',
  '    wait',
  '    ;;',
  '  *)',
  '    echo "unknown: $NAME"',
  '    exit 9',
  '    ;;',
  'esac',
  ''
].join('\n');

// 孙进程 fixture：落盘自身 pid → 长 sleep → 写 done 标记（用于断言其是否被超时强杀波及）
const GRANDCHILD_SCRIPT = [
  '#!/bin/bash',
  'echo $$ > "$GC_PID_FILE"',
  'sleep 3',
  'echo done > "$GC_DONE_FILE"',
  ''
].join('\n');

function makeTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'rbac-online-e2e-'));
}

// 起一个隔离的 server 子进程：随机高位端口 + 全套临时路径注入
function startServer(t, tmpRoot, { withSecret = true, extraEnv = {} } = {}) {
  const port = 21000 + Math.floor(Math.random() * 30000);
  const env = { ...process.env, PORT: String(port) };
  delete env.PUBLISH_SECRET; // 父进程环境兜底清理，避免破坏 fail-closed 用例

  const onlineDir = path.join(tmpRoot, 'scripts', 'online');
  fs.mkdirSync(onlineDir, { recursive: true });
  fs.writeFileSync(path.join(onlineDir, 'a.sql'), 'SELECT 1;\n');
  fs.writeFileSync(path.join(onlineDir, 'sleep.sql'), 'SELECT SLEEP(0);\n');
  fs.writeFileSync(path.join(onlineDir, 'grandchild.sql'), 'SELECT SLEEP(0);\n');
  fs.mkdirSync(path.join(onlineDir, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(onlineDir, 'sub', 'nested.sql'), 'SELECT 2;\n');
  fs.writeFileSync(path.join(onlineDir, '.hidden.sql'), 'hidden;\n');

  const runner = path.join(tmpRoot, 'fake-runner.sh');
  fs.writeFileSync(runner, FAKE_RUNNER);
  fs.chmodSync(runner, 0o755);

  const gcScript = path.join(tmpRoot, 'grandchild.sh');
  fs.writeFileSync(gcScript, GRANDCHILD_SCRIPT);
  fs.chmodSync(gcScript, 0o755);
  const gcPidFile = path.join(tmpRoot, 'grandchild.pid');
  const gcDoneFile = path.join(tmpRoot, 'grandchild.done');

  const missingEnv = path.join(tmpRoot, 'missing.env'); // 刻意不存在
  const missingSecretFile = path.join(tmpRoot, 'logs', 'publish-secret.txt'); // 刻意不存在

  Object.assign(env, {
    PANEL_ENV_FILE: missingEnv,
    PANEL_SECRET_FILE: missingSecretFile,
    PANEL_LOG_FILE: path.join(tmpRoot, 'deploy-logs.txt'),
    PANEL_LOCK_FILE: path.join(tmpRoot, 'task.lock'),
    ONLINE_AUDIT_FILE: path.join(tmpRoot, 'online-audit.jsonl'),
    ONLINE_SCRIPT_DIR: onlineDir,
    ONLINE_SCRIPT_RUNNER: runner,
    ONLINE_SCRIPT_TIMEOUT_MS: '300',
    PROJECT_PATH: tmpRoot,
    GC_SCRIPT: gcScript,
    GC_PID_FILE: gcPidFile,
    GC_DONE_FILE: gcDoneFile
  });
  if (withSecret) env.PUBLISH_SECRET = TOKEN;
  Object.assign(env, extraEnv);
  // extraEnv 显式传 null 表示删除默认注入项（如 ONLINE_SCRIPT_DIR: null → 用 server 默认值路径的用例）
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === null) delete env[key];
  }

  const child = spawn(process.execPath, [SERVER_JS], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const stderrChunks = [];
  child.stderr.on('data', buf => stderrChunks.push(buf.toString()));
  t.after(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });

  const base = `http://127.0.0.1:${port}`;
  const authHeaders = { 'X-Publish-Token': TOKEN };

  async function waitReady() {
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) {
        throw new Error(`server 提前退出 code=${child.exitCode} stderr=${stderrChunks.join('')}`);
      }
      try {
        const res = await fetch(`${base}/status`);
        if (res.ok) return;
      } catch (error) { /* 端口未就绪，重试 */ }
      await new Promise(r => setTimeout(r, 50));
    }
    throw new Error(`server 启动超时 stderr=${stderrChunks.join('')}`);
  }

  return { child, base, authHeaders, onlineDir, tmpRoot, stderrText: () => stderrChunks.join(''), waitReady, gcPidFile, gcDoneFile };
}

async function waitFor(fn, timeoutMs = 8000, stepMs = 100) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise(r => setTimeout(r, stepMs));
  }
  throw lastError || new Error('waitFor 超时');
}

async function readAudit(base, headers) {
  const res = await fetch(`${base}/online-scripts/logs`, { headers });
  assert.equal(res.status, 200);
  const result = await res.json();
  return result.data;
}

// 本地 git 辅助：断言成功否则连 stderr 一起失败；commit 身份显式注入防本机全局配置干扰
const GIT_IDENTITY = ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false'];

function runGit(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')} 失败：${result.stderr || result.stdout}`);
}

// 把临时 PROJECT_PATH 初始化为 git 仓库并推到同机 bare origin（origin 在 tmpRoot 之外，单独清理）；
// 须在 startServer 之后调用，让 fixture 文件进入初始提交
function setupLocalGitRepo(t, tmpRoot) {
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'rbac-online-origin-'));
  t.after(() => fs.rmSync(origin, { recursive: true, force: true }));
  runGit(['init', '--bare', '-b', 'main', origin]);
  runGit(['init', '-b', 'main', tmpRoot]);
  runGit(['add', '-A'], tmpRoot);
  runGit([...GIT_IDENTITY, 'commit', '-m', 'init'], tmpRoot);
  runGit(['remote', 'add', 'origin', origin], tmpRoot);
  runGit(['push', '-u', 'origin', 'main'], tmpRoot);
  return origin;
}

// ---------- fail-closed 与鉴权 ----------

test('无 PUBLISH_SECRET 时业务端点 503（fail-closed），/status 仍可用', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot, { withSecret: false });
  await ctx.waitReady();

  // deploy-panel/.env 实测含真实 PUBLISH_SECRET 键；PANEL_ENV_FILE/PANEL_SECRET_FILE 已指向不存在路径，
  // 此处能稳定拿到 503 才证明隔离生效
  const res = await fetch(`${ctx.base}/online-scripts`);
  assert.equal(res.status, 503);
  const payload = await res.json();
  assert.match(payload.message, /PUBLISH_SECRET/);

  const status = await fetch(`${ctx.base}/status`);
  assert.equal(status.status, 200);
  const statusPayload = await status.json();
  assert.equal(statusPayload.data.initialized, false);
  assert.equal(statusPayload.data.running, false);
});

test('错误 token 返回 403', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot);
  await ctx.waitReady();

  const res = await fetch(`${ctx.base}/online-scripts`, { headers: { 'X-Publish-Token': 'wrong-token' } });
  assert.equal(res.status, 403);

  const missing = await fetch(`${ctx.base}/online-scripts`);
  assert.equal(missing.status, 403);
});

// ---------- 列表与参数校验 ----------

test('GET /online-scripts 返回 fixture SQL 列表（过滤子目录与隐藏文件）', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot);
  await ctx.waitReady();

  const res = await fetch(`${ctx.base}/online-scripts`, { headers: ctx.authHeaders });
  assert.equal(res.status, 200);
  const result = await res.json();
  const names = result.data.map(item => item.name);
  assert.ok(names.includes('a.sql'));
  assert.ok(names.includes('sleep.sql'));
  assert.ok(!names.includes('nested.sql'));
  assert.ok(!names.includes('.hidden.sql'));
  for (const item of result.data) {
    assert.equal(typeof item.size, 'number');
    assert.equal(typeof item.mtime, 'string');
  }
});

test('POST run 拒绝穿越名/不存在名/confirm 不一致，均 400', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot);
  await ctx.waitReady();

  const cases = [
    { name: '../a.sql', confirm: '../a.sql' },      // 相对路径穿越
    { name: '/etc/passwd.sql', confirm: '/etc/passwd.sql' }, // 绝对路径
    { name: 'sub/nested.sql', confirm: 'sub/nested.sql' },   // 子目录名
    { name: 'nope.sql', confirm: 'nope.sql' },      // 白名单内不存在
    { name: 'a.sql', confirm: 'b.sql' },            // 二次确认不一致
    { name: '', confirm: '' }                       // 空名
  ];
  for (const body of cases) {
    const res = await fetch(`${ctx.base}/online-scripts/run`, {
      method: 'POST',
      headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    assert.equal(res.status, 400, `用例 ${JSON.stringify(body)} 应 400`);
  }
  // 全程未产生任务：锁未被占用、无审计记录
  const status = await fetch(`${ctx.base}/status`);
  assert.equal((await status.json()).data.running, false);
  assert.deepEqual(await readAudit(ctx.base, ctx.authHeaders), []);
});

// ---------- 执行与审计 ----------

test('fake runner 执行成功：日志含开始/结束标记，审计 exitCode=0', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot);
  await ctx.waitReady();

  const res = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'a.sql', confirm: 'a.sql' })
  });
  assert.equal(res.status, 200);

  // 轮询至任务结束（running=false），随后日志与审计均已落盘
  await waitFor(async () => {
    const status = await fetch(`${ctx.base}/status`);
    return (await status.json()).data.running === false;
  });
  // close 回调是任务结束后异步落审计，稍作轮询
  const audit = await waitFor(async () => {
    const records = await readAudit(ctx.base, ctx.authHeaders);
    return records.length ? records : null;
  });
  const record = audit[audit.length - 1];
  assert.equal(record.script, 'a.sql');
  assert.equal(record.exitCode, 0);
  assert.equal(record.timedOut, false);
  assert.match(record.outputTail, /fake-runner done: a\.sql/);
  assert.match(record.secretFingerprint, /^[0-9a-f]{8}$/);
  assert.ok(typeof record.durationMs === 'number');

  const logs = await (await fetch(`${ctx.base}/logs`, { headers: ctx.authHeaders })).text();
  assert.match(logs, /===== 开始执行线上脚本 a\.sql =====/);
  assert.match(logs, /线上脚本结束：成功/);
  assert.match(logs, /fake-runner done: a\.sql/);
});

test('FAKE_EXIT=3 失败执行：审计 exitCode=3', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot, { withSecret: true, extraEnv: { FAKE_EXIT: '3' } });
  await ctx.waitReady();

  const res = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'a.sql', confirm: 'a.sql' })
  });
  assert.equal(res.status, 200);

  await waitFor(async () => {
    const status = await fetch(`${ctx.base}/status`);
    return (await status.json()).data.running === false;
  });
  const audit = await waitFor(async () => {
    const records = await readAudit(ctx.base, ctx.authHeaders);
    return records.length ? records : null;
  });
  const record = audit[audit.length - 1];
  assert.equal(record.script, 'a.sql');
  assert.equal(record.exitCode, 3);
  assert.equal(record.timedOut, false);

  const logs = await (await fetch(`${ctx.base}/logs`, { headers: ctx.authHeaders })).text();
  assert.match(logs, /线上脚本结束：失败/);
});

test('sleep 期间并发执行返回 409；超时 SIGKILL 记 timedOut 并释放锁', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot);
  await ctx.waitReady();

  const first = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'sleep.sql', confirm: 'sleep.sql' })
  });
  assert.equal(first.status, 200);

  // fake runner sleep 期间（300ms 超时窗口内）并发触发第二个任务 → 409
  const second = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'a.sql', confirm: 'a.sql' })
  });
  assert.equal(second.status, 409);

  // 等待超时强杀与锁释放
  await waitFor(async () => {
    const status = await fetch(`${ctx.base}/status`);
    return (await status.json()).data.running === false;
  });
  const audit = await waitFor(async () => {
    const records = await readAudit(ctx.base, ctx.authHeaders);
    return records.length ? records : null;
  });
  const record = audit[audit.length - 1];
  assert.equal(record.script, 'sleep.sql');
  assert.equal(record.timedOut, true);
  assert.equal(record.exitCode, null);
  // 锁已释放：可再次正常启动任务
  const again = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'a.sql', confirm: 'a.sql' })
  });
  assert.equal(again.status, 200);
  await waitFor(async () => {
    const status = await fetch(`${ctx.base}/status`);
    return (await status.json()).data.running === false;
  });
});

test('GET /online-scripts/logs 返回审计记录末 50 条', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot);
  await ctx.waitReady();

  // 初始无记录
  assert.deepEqual(await readAudit(ctx.base, ctx.authHeaders), []);

  const res = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'a.sql', confirm: 'a.sql' })
  });
  assert.equal(res.status, 200);
  const audit = await waitFor(async () => {
    const records = await readAudit(ctx.base, ctx.authHeaders);
    return records.length ? records : null;
  });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].script, 'a.sql');
  assert.ok(audit[0].ip);
});

// ---------- body 限长与进程存活 ----------

test('body 超 64KB 返回 413 且进程存活（无 ERR_HTTP_HEADERS_SENT 二次响应）', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot);
  await ctx.waitReady();

  const bigBody = JSON.stringify({ name: 'a.sql', confirm: 'a.sql', padding: 'x'.repeat(70 * 1024) });
  const res = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: bigBody
  });
  assert.equal(res.status, 413);

  // 超限后再发请求仍正常：证明面板进程未因二次响应崩溃
  const after = await fetch(`${ctx.base}/status`);
  assert.equal(after.status, 200);
  const again = await fetch(`${ctx.base}/online-scripts`, { headers: ctx.authHeaders });
  assert.equal(again.status, 200);
  // 超限请求不应产生任何任务
  assert.deepEqual(await readAudit(ctx.base, ctx.authHeaders), []);
});

// ---------- 列表源与执行源对齐（评审 medium#1）----------

test('未注入 ONLINE_SCRIPT_DIR 时列表默认取 PROJECT_PATH/deploy-panel/scripts/online（与执行器同源）', async t => {
  const tmpRoot = makeTmpRoot();
  // 模拟 git pull 后挂载仓库中出现的新 SQL：执行器（run-online.sh:58）按
  // $HOST_PROJECT_PATH/deploy-panel/scripts/online 执行，列表也必须读同一路径，
  // 否则下拉框选不到新脚本（或镜像快照中已删除的脚本仍被列出）
  const expectedDir = path.join(tmpRoot, 'deploy-panel', 'scripts', 'online');
  fs.mkdirSync(expectedDir, { recursive: true });
  fs.writeFileSync(path.join(expectedDir, 'newly-committed.sql'), 'SELECT 2;\n');
  const ctx = startServer(t, tmpRoot, { extraEnv: { ONLINE_SCRIPT_DIR: null } });
  await ctx.waitReady();

  const res = await fetch(`${ctx.base}/online-scripts`, { headers: ctx.authHeaders });
  assert.equal(res.status, 200);
  const names = (await res.json()).data.map(item => item.name);
  assert.ok(
    names.includes('newly-committed.sql'),
    `默认列表目录应为 PROJECT_PATH/deploy-panel/scripts/online，实际返回：${names.join(',') || '(空)'}`
  );
});

// ---------- 超时按进程组终止（评审 medium#2）----------

test('超时强杀终止整个进程组：runner 的孙进程一并被杀，不会继续执行', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot);
  await ctx.waitReady();

  const res = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'grandchild.sql', confirm: 'grandchild.sql' })
  });
  assert.equal(res.status, 200);

  // 孙进程已启动并落盘自身 pid
  const gcPid = await waitFor(() => {
    const text = fs.readFileSync(ctx.gcPidFile, 'utf8').trim();
    const pid = Number(text);
    return pid > 0 ? pid : null;
  });

  // 超时（300ms）强杀后锁释放、审计记 timedOut
  await waitFor(async () => {
    const status = await fetch(`${ctx.base}/status`);
    return (await status.json()).data.running === false;
  });
  const audit = await waitFor(async () => {
    const records = await readAudit(ctx.base, ctx.authHeaders);
    return records.length ? records : null;
  });
  assert.equal(audit[audit.length - 1].timedOut, true);

  // 孙进程必须随组终止：若只杀 runner bash（旧实现），孙进程被收养并继续 sleep 3 后写 done 标记
  const start = Date.now();
  while (Date.now() - start < 2500) {
    let alive;
    try {
      process.kill(gcPid, 0);
      alive = true;
    } catch {
      alive = false; // ESRCH：进程已终止
    }
    assert.ok(!alive, `孙进程 ${gcPid} 在超时强杀后仍存活（仅杀父进程，进程组未被终止）`);
    assert.ok(!fs.existsSync(ctx.gcDoneFile), '孙进程不应跑完 sleep 写出 done 标记');
    await new Promise(r => setTimeout(r, 100));
  }
});

// ---------- 执行器配置容错（评审 low#5/#6）----------

test('ONLINE_SCRIPT_RUNNER 误配含 shell 元字符：返回 500、不残留锁、面板进程存活', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot, { extraEnv: { ONLINE_SCRIPT_RUNNER: '/tmp/ro;unner.sh' } });
  await ctx.waitReady();

  const res = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'a.sql', confirm: 'a.sql' })
  });
  assert.equal(res.status, 500);

  // 未捕获异常不应击穿面板进程，也不应残留 task.lock（stale 自愈仅启动时）
  const status = await fetch(`${ctx.base}/status`);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).data.running, false);
});

test('runner 路径不存在：spawn error 后锁释放、审计记失败、面板进程存活', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot, { extraEnv: { ONLINE_SCRIPT_RUNNER: path.join(tmpRoot, 'no-such-runner.sh') } });
  await ctx.waitReady();

  const res = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'a.sql', confirm: 'a.sql' })
  });
  assert.equal(res.status, 200);

  await waitFor(async () => {
    const status = await fetch(`${ctx.base}/status`);
    return (await status.json()).data.running === false;
  });
  // 面板进程未被击穿
  const status = await fetch(`${ctx.base}/status`);
  assert.equal(status.status, 200);
  // error（Node≥15 伴随 close）路径最终落审计失败记录
  const audit = await waitFor(async () => {
    const records = await readAudit(ctx.base, ctx.authHeaders);
    return records.length ? records : null;
  });
  assert.notEqual(audit[audit.length - 1].exitCode, 0);
});

// ---------- 列表刷新即拉取（GET /online-scripts 内置 git pull，fail-open） ----------

test('刷新即拉取：远端新提交的 SQL 无需手动 pull 直接出现在列表并落盘', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot);
  await ctx.waitReady();
  const origin = setupLocalGitRepo(t, tmpRoot);

  // 模拟开发机 push：独立 seed 仓库向 origin 提交一个新 SQL
  const seed = fs.mkdtempSync(path.join(os.tmpdir(), 'rbac-online-seed-'));
  t.after(() => fs.rmSync(seed, { recursive: true, force: true }));
  runGit(['clone', origin, seed]);
  fs.mkdirSync(path.join(seed, 'scripts', 'online'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'scripts', 'online', 'pulled-fresh.sql'), 'SELECT 9;\n');
  runGit(['add', '-A'], seed);
  runGit([...GIT_IDENTITY, 'commit', '-m', 'add pulled-fresh.sql'], seed);
  runGit(['push'], seed);

  assert.ok(
    !fs.existsSync(path.join(tmpRoot, 'scripts', 'online', 'pulled-fresh.sql')),
    '刷新前列表目录不应已有该文件（否则断言无意义）'
  );

  const res = await fetch(`${ctx.base}/online-scripts`, { headers: ctx.authHeaders });
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.equal(result.pull.ok, true, `pull 应成功：${JSON.stringify(result.pull)}`);
  const names = result.data.map(item => item.name);
  assert.ok(names.includes('pulled-fresh.sql'), `新 SQL 应出现在列表：${names.join(',')}`);
  assert.ok(fs.existsSync(path.join(tmpRoot, 'scripts', 'online', 'pulled-fresh.sql')), '新 SQL 应已落盘到列表目录');
});

test('git pull 失败不阻塞列表（fail-open）：仍 200 返回本地列表，pull.ok=false 带原因', async t => {
  const tmpRoot = makeTmpRoot();
  const ctx = startServer(t, tmpRoot); // tmpRoot 非 git 仓库 → pull 快速失败
  await ctx.waitReady();

  const res = await fetch(`${ctx.base}/online-scripts`, { headers: ctx.authHeaders });
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.equal(result.pull.ok, false);
  assert.ok(result.pull.output, '应有失败原因输出');
  const names = result.data.map(item => item.name);
  assert.ok(names.includes('a.sql'), 'pull 失败后本地列表仍应返回');
});

test('任务执行中刷新列表跳过 pull：pull.skipped=true 且列表照常返回', async t => {
  const tmpRoot = makeTmpRoot();
  // 覆盖默认 300ms 超时，给 sleep.sql 拉出足够的运行窗口
  const ctx = startServer(t, tmpRoot, { extraEnv: { ONLINE_SCRIPT_TIMEOUT_MS: '5000' } });
  await ctx.waitReady();

  const run = await fetch(`${ctx.base}/online-scripts/run`, {
    method: 'POST',
    headers: { ...ctx.authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'sleep.sql', confirm: 'sleep.sql' })
  });
  assert.equal(run.status, 200);

  // 任务运行期间（POST 返回时锁已被同步持有）刷新列表：应标记 skipped
  const res = await fetch(`${ctx.base}/online-scripts`, { headers: ctx.authHeaders });
  assert.equal(res.status, 200);
  const result = await res.json();
  assert.equal(result.pull.skipped, true, `应跳过 pull：${JSON.stringify(result.pull)}`);
  assert.ok(result.data.some(item => item.name === 'a.sql'), '跳过 pull 时本地列表仍应返回');

  // 收尾：等待任务结束释放锁，不污染后续断言
  await waitFor(async () => {
    const status = await fetch(`${ctx.base}/status`);
    return (await status.json()).data.running === false;
  });
});
