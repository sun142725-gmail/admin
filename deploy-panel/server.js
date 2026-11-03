// 发布面板：接收带密钥的 HTTP 请求并执行部署脚本。
// 安全设计：
// 1. fail-closed：PUBLISH_SECRET 必须由环境注入；不再提供“先到先得”的初始化模式
//    （该模式曾允许任何未认证请求抢占密钥，而面板挂载了 docker.sock 与 SSH 私钥）；
// 2. 密钥比较用 crypto.timingSafeEqual，防时序侧信道；
// 3. 部署锁用 openSync(,'wx') 原子创建消除 TOCTOU；崩溃残留的陈旧锁（>1 小时）启动自愈；
// 4. 面板与页面同源，不做跨域放行（此前反射任意 Origin + 允许自定义头，构成 CSRF 面）；
// 5. 「线上脚本」模块：脚本只来自服务端固定白名单目录，请求仅传文件名（basename+扩展名
//    白名单+目录存在性多重校验），spawn 数组参数无 shell:true；与发布共用同一把 task.lock 互斥。
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const {
  parseAllowedExts,
  validateScriptName,
  listOnlineScripts,
  pullLatestCode,
  buildRunnerArgs,
  buildAuditRecord,
  appendAuditFile,
  readAuditTail
} = require('./lib/online-scripts.js');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// 路径常量支持环境变量覆盖（集成测试隔离用）；默认值与历史值逐字节一致，生产行为零变化。
// 注意 PANEL_ENV_FILE/PANEL_SECRET_FILE 是 fail-closed 用例的关键：deploy-panel/.env 可能
// 含真实 PUBLISH_SECRET 键，测试必须把两个文件都指到不存在路径，才能验证「无密钥 → 503」。
const ENV_FILE = process.env.PANEL_ENV_FILE || path.join(__dirname, '.env');
const SECRET_FILE = process.env.PANEL_SECRET_FILE || path.join(__dirname, 'logs/publish-secret.txt');

loadEnvFile(ENV_FILE);

let SECRET = process.env.PUBLISH_SECRET || (fs.existsSync(SECRET_FILE) ? fs.readFileSync(SECRET_FILE, 'utf8').trim() : '');
const PORT = Number(process.env.PORT || 9090);
const PROJECT_PATH = process.env.PROJECT_PATH || path.resolve(__dirname, '..');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = process.env.PANEL_LOG_FILE || path.join(__dirname, './logs/deploy-logs.txt');
const LOCK_FILE = process.env.PANEL_LOCK_FILE || path.join(__dirname, './task.lock');
// 部署最长允许时长；超过视为崩溃残留锁，启动时自动清理
const STALE_LOCK_MS = 60 * 60 * 1000;

fs.mkdirSync(LOG_DIR, { recursive: true });

if (!SECRET) {
  console.error('未配置 PUBLISH_SECRET，所有写操作已禁用（fail-closed）。请在环境变量或 deploy-panel/.env 注入强随机密钥后重启。');
}

// 脚本映射
const SCRIPT_MAP = {
  backend: path.join(__dirname, 'scripts/deploy-backend.sh'),
  frontend: path.join(__dirname, 'scripts/deploy-frontend.sh'),
  'has-doc': path.join(__dirname, 'scripts/deploy-has-doc.sh'),
  'has-web': path.join(__dirname, 'scripts/deploy-has-web.sh'),
  core: path.join(__dirname, 'scripts/deploy-core.sh'),
  all: path.join(__dirname, 'scripts/deploy-all.sh'),
  'stock-agents': path.join(__dirname, 'scripts/sync-stock-agents.sh')
};

// 线上脚本模块配置（默认值即生产值，环境变量仅供测试隔离与调参）
// 列表源与执行源必须同目录：run-online.sh:58 实际执行
// $HOST_PROJECT_PATH/deploy-panel/scripts/online（git pull 之后的挂载仓库最新文件），
// 故默认取 PROJECT_PATH（容器内 compose 注入与 HOST_PROJECT_PATH 同值，指向挂载仓库根）
// 下的同一路径，而非镜像构建快照 __dirname/scripts/online——否则开发机新提交的 SQL
// 不出现在列表（下拉框选不到），且镜像里有、仓库已删的脚本仍会被列出后执行失败。
// 本地直跑时 PROJECT_PATH=deploy-panel 父目录，该路径与旧默认值逐字节一致。
const ONLINE_SCRIPT_DIR = process.env.ONLINE_SCRIPT_DIR || path.join(PROJECT_PATH, 'deploy-panel/scripts/online');
const ONLINE_AUDIT_FILE = process.env.ONLINE_AUDIT_FILE || path.join(LOG_DIR, 'online-script-audit.jsonl');
const ONLINE_SCRIPT_RUNNER = process.env.ONLINE_SCRIPT_RUNNER || path.join(__dirname, 'scripts/run-online.sh');
const ONLINE_SCRIPT_EXTS = parseAllowedExts(process.env.ONLINE_SCRIPT_EXTS || '');
// 线上脚本执行超时：超时 SIGKILL 强杀并释放锁（旧 /deploy 路径保持无超时的既有行为不动）
const ONLINE_SCRIPT_TIMEOUT_MS = Number(process.env.ONLINE_SCRIPT_TIMEOUT_MS || 600000);
// 列表刷新即拉取：GET /online-scripts 先在 PROJECT_PATH（仓库根）执行 git pull --ff-only，
// 开发机 push 的新 SQL 免 SSH 手动 pull 即出现在下拉框；超时防止远端不可达时请求悬挂
const ONLINE_PULL_TIMEOUT_MS = Number(process.env.ONLINE_PULL_TIMEOUT_MS || 30000);
// 新端点请求体上限；旧 /deploy 的 body 拼接保持既有行为不动（README 安全章节已注明）
const MAX_BODY_BYTES = 64 * 1024;

// 常量时间比较，防时序侧信道
function checkSecret(token) {
  if (!SECRET || typeof token !== 'string') return false;
  const a = crypto.createHash('sha256').update(String(token)).digest();
  const b = crypto.createHash('sha256').update(SECRET).digest();
  return crypto.timingSafeEqual(a, b);
}

// 追加日志到文件
function writeLog(content) {
  const time = new Date().toLocaleString();
  const line = `[${time}] ${content}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf8');
}

function resetLog() {
  fs.writeFileSync(LOG_FILE, '', 'utf8');
}

// 启动自愈：上次进程崩溃可能残留陈旧锁，超时则清除，避免面板永久 409
function recoverStaleLock() {
  if (!fs.existsSync(LOCK_FILE)) return;
  const lockedAt = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim());
  if (Number.isFinite(lockedAt) && Date.now() - lockedAt > STALE_LOCK_MS) {
    fs.unlinkSync(LOCK_FILE);
    writeLog('检测到陈旧部署锁，已自动清除');
  }
}

// 原子加锁：openSync 'wx' 在文件已存在时抛 EEXIST，消除“检查-再写入”的并发窗口
function tryLockTask() {
  try {
    const fd = fs.openSync(LOCK_FILE, 'wx');
    fs.writeSync(fd, Date.now().toString());
    fs.closeSync(fd);
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

function isRunning() {
  return fs.existsSync(LOCK_FILE);
}

function unlockTask() {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json;charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // 静态页面
  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'publish.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    return res.end(html);
  }

  const token = req.headers['x-publish-token'];

  if (req.url === '/status' && req.method === 'GET') {
    return sendJson(res, 200, { code: 200, data: { running: isRunning(), initialized: Boolean(SECRET) } });
  }

  // fail-closed：未配置密钥时拒绝一切业务操作
  if (!SECRET) {
    return sendJson(res, 503, { code: 503, message: '面板未配置 PUBLISH_SECRET，服务不可用' });
  }

  if (!checkSecret(token)) {
    return sendJson(res, 403, { code: 403, message: '密钥非法' });
  }

  // ---- 线上脚本模块（脚本只来自服务端白名单目录，请求仅传文件名）----

  // GET /online-scripts：刷新即拉取——先 git pull --ff-only 再列出白名单目录脚本。
  // pull 是「尽力而为」：失败/超时不阻塞列表（fail-open），失败原因随响应 pull 字段
  // 交前端警示；真正执行的基线安全仍由 run-online.sh 自身的 git pull（fail-closed）兜底。
  // 任务执行中跳过 pull：避免与发布/run-online.sh 内的 git 操作并发争用仓库 index.lock。
  if (req.url === '/online-scripts' && req.method === 'GET') {
    const pull = isRunning()
      ? { ok: null, skipped: true, output: '任务执行中，跳过拉取最新代码' }
      : pullLatestCode({ cwd: PROJECT_PATH, timeoutMs: ONLINE_PULL_TIMEOUT_MS });
    return sendJson(res, 200, { code: 200, data: listOnlineScripts(ONLINE_SCRIPT_DIR, ONLINE_SCRIPT_EXTS), pull });
  }

  // GET /online-scripts/logs：审计记录末 50 条
  if (req.url === '/online-scripts/logs' && req.method === 'GET') {
    return sendJson(res, 200, { code: 200, data: readAuditTail(ONLINE_AUDIT_FILE, 50) });
  }

  // POST /online-scripts/run：执行白名单内脚本（与发布共用同一把 task.lock，互斥）
  if (req.url === '/online-scripts/run' && req.method === 'POST') {
    let body = '';
    let oversized = false;
    req.on('error', () => {});
    req.on('data', chunk => {
      if (oversized) return;
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        oversized = true;
        // 防二次响应：先摘除 data/end 监听，杜绝后续 chunk 触发 end 分支重复 sendJson
        // （async 分支内二次响应抛 ERR_HTTP_HEADERS_SENT 会击穿挂载 docker.sock 的面板进程）
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        sendJson(res, 413, { code: 413, message: '请求体超过 64KB 限制' });
        req.destroy();
        return;
      }
    });
    req.on('end', () => {
      if (oversized) return;

      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch (error) {
        return sendJson(res, 400, { code: 400, message: '请求体不是有效 JSON' });
      }

      const name = typeof payload.name === 'string' ? payload.name : '';
      const confirm = typeof payload.confirm === 'string' ? payload.confirm : '';
      const clientIp = (req.socket && req.socket.remoteAddress) || '';

      // 第一重校验：basename + 扩展名白名单（拒绝任何路径分隔符与穿越变体）
      const nameCheck = validateScriptName(name, ONLINE_SCRIPT_EXTS);
      if (!nameCheck.ok) {
        return sendJson(res, 400, { code: 400, message: `脚本名非法：${nameCheck.reason}` });
      }
      // 第二重校验：confirm 必须与脚本名全等（前端 prompt 输入脚本名全文做二次确认）
      if (confirm !== name) {
        return sendJson(res, 400, { code: 400, message: '二次确认失败：confirm 必须与脚本名完全一致' });
      }
      // 第三重校验：必须真实存在于白名单目录列表中
      if (!listOnlineScripts(ONLINE_SCRIPT_DIR, ONLINE_SCRIPT_EXTS).some(item => item.name === name)) {
        return sendJson(res, 400, { code: 400, message: '脚本不存在或不允许执行' });
      }
      // 先拼装执行参数（不涉锁）：ONLINE_SCRIPT_RUNNER 误配（空值/含 shell 元字符）时
      // 在此返回 500，避免加锁后 buildRunnerArgs 抛未捕获异常击穿面板进程且残留 task.lock
      // （陈旧锁自愈仅发生在进程启动时，server.js recoverStaleLock）
      let runnerInvocation;
      try {
        runnerInvocation = buildRunnerArgs(ONLINE_SCRIPT_RUNNER, name);
      } catch (error) {
        return sendJson(res, 500, { code: 500, message: `执行器配置非法：${error.message}` });
      }

      if (!tryLockTask()) {
        return sendJson(res, 409, { code: 409, message: '正在执行任务，请勿重复触发' });
      }

      resetLog();
      writeLog(`===== 开始执行线上脚本 ${name} =====`);

      const startedAt = Date.now();
      const { command, args } = runnerInvocation;
      let timedOut = false;
      let outputTail = '';

      // detached 使 runner 成为新进程组组长：超时按进程组 SIGKILL 时，bash 被 SIGKILL 后
      // 会被 init 收养继续执行的孙进程（如 run-online.sh:81 的 docker exec 客户端）一并终止，
      // 否则锁释放后可立刻启动下一任务并与仍在容器内执行的 SQL 并发，打破 task.lock 互斥。
      // 数组参数、无 shell:true（照抄既有 /deploy 模式），用户输入永不拼进 shell 字符串
      const proc = spawn(command, args, {
        cwd: PROJECT_PATH,
        detached: true
      });

      const timeoutTimer = setTimeout(() => {
        timedOut = true;
        writeLog(`[WARN] 线上脚本执行超过 ${ONLINE_SCRIPT_TIMEOUT_MS}ms，强制终止（SIGKILL 进程组）`);
        try {
          process.kill(-proc.pid, 'SIGKILL');
        } catch (error) {
          // 进程组已不存在（提前退出）或无权限时兜底只杀父进程
          writeLog(`[WARN] 进程组终止失败（${error.message}），回退为终止执行器进程`);
          proc.kill('SIGKILL');
        }
      }, ONLINE_SCRIPT_TIMEOUT_MS);

      const collect = buf => {
        outputTail += buf.toString();
        writeLog(buf.toString());
      };
      proc.stdout.on('data', collect);
      proc.stderr.on('data', collect);
      proc.on('error', error => {
        writeLog(`[ERR] 线上脚本进程启动失败：${error.message}`);
        // 对齐 /deploy 路径：spawn 失败立即释放锁（unlockTask 幂等；Node≥15 下 close 仍会
        // 触发并再次 unlock，双写无害；防 Node 语义变化时锁滞留）
        unlockTask();
      });
      proc.on('close', code => {
        clearTimeout(timeoutTimer);
        const durationMs = Date.now() - startedAt;
        writeLog(`===== 线上脚本结束：${code === 0 && !timedOut ? '成功' : '失败'}，退出码：${code}${timedOut ? '（超时强制终止）' : ''} =====\n`);
        try {
          appendAuditFile(ONLINE_AUDIT_FILE, buildAuditRecord({
            scriptName: name,
            ip: clientIp,
            secret: SECRET,
            exitCode: code,
            durationMs,
            timedOut,
            output: outputTail
          }));
        } catch (error) {
          // 审计落盘失败（磁盘故障等）只降级记日志，不得击穿面板进程或阻塞解锁
          writeLog(`[ERR] 审计记录写入失败：${error.message}`);
        }
        unlockTask();
      });

      sendJson(res, 200, { code: 200, message: '线上脚本任务已启动' });
    });
    return;
  }

  // 触发发布接口 POST /deploy
  if (req.url === '/deploy' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch (error) {
        return sendJson(res, 400, { code: 400, message: '请求体不是有效 JSON' });
      }

      const target = payload.target;
      const scriptPath = SCRIPT_MAP[target];

      if (!scriptPath) {
        return sendJson(res, 400, { code: 400, message: '目标不存在' });
      }
      if (!tryLockTask()) {
        return sendJson(res, 409, { code: 409, message: '正在执行发布任务，请勿重复触发' });
      }

      resetLog();
      writeLog(`===== 开始发布 target:${target} =====`);

      // 异步执行shell脚本
      const proc = spawn('/bin/bash', [scriptPath], {
        cwd: PROJECT_PATH
      });

      proc.stdout.on('data', buf => writeLog(buf.toString()));
      proc.stderr.on('data', buf => writeLog(buf.toString()));
      proc.on('error', error => {
        writeLog(`[ERR] 发布进程启动失败：${error.message}`);
        unlockTask();
      });

      proc.on('close', code => {
        const result = code === 0 ? '成功' : '失败';
        writeLog(`===== 发布结束：${result}，退出码：${code} =====\n`);
        unlockTask();
      });

      sendJson(res, 200, { code: 200, message: '发布任务已启动' });
    })
    return;
  }

  // 获取最新日志 GET /logs
  if (req.url === '/logs') {
    let logText = '';
    try {
      logText = fs.readFileSync(LOG_FILE, 'utf8');
    } catch(e) {}
    // 返回最后300行，防止日志过大
    const lines = logText.split('\n').slice(-300).join('\n');
    res.writeHead(200, { 'Content-Type':'text/plain;charset=utf-8' });
    return res.end(lines);
  }

  sendJson(res, 404, { code: 404, message: 'not found' });
})

recoverStaleLock();

server.listen(PORT, () => {
  console.log(`发布面板启动：http://localhost:${PORT}`);
})
