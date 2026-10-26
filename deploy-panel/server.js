// 发布面板：接收带密钥的 HTTP 请求并执行部署脚本。
// 安全设计：
// 1. fail-closed：PUBLISH_SECRET 必须由环境注入；不再提供“先到先得”的初始化模式
//    （该模式曾允许任何未认证请求抢占密钥，而面板挂载了 docker.sock 与 SSH 私钥）；
// 2. 密钥比较用 crypto.timingSafeEqual，防时序侧信道；
// 3. 部署锁用 openSync(,'wx') 原子创建消除 TOCTOU；崩溃残留的陈旧锁（>1 小时）启动自愈；
// 4. 面板与页面同源，不做跨域放行（此前反射任意 Origin + 允许自定义头，构成 CSRF 面）。
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

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

const ENV_FILE = path.join(__dirname, '.env');
const SECRET_FILE = path.join(__dirname, 'logs/publish-secret.txt');

loadEnvFile(ENV_FILE);

let SECRET = process.env.PUBLISH_SECRET || (fs.existsSync(SECRET_FILE) ? fs.readFileSync(SECRET_FILE, 'utf8').trim() : '');
const PORT = Number(process.env.PORT || 9090);
const PROJECT_PATH = process.env.PROJECT_PATH || path.resolve(__dirname, '..');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(__dirname, './logs/deploy-logs.txt');
const LOCK_FILE = path.join(__dirname, './task.lock');
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
