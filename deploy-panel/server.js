const http = require('http');
const fs = require('fs');
const path = require('path');
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

loadEnvFile(path.join(__dirname, '.env'));

const SECRET = process.env.PUBLISH_SECRET;
const PORT = Number(process.env.PORT || 9090);
const PROJECT_PATH = process.env.PROJECT_PATH || path.resolve(__dirname, '..');
const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(__dirname, './logs/deploy-logs.txt');
const LOCK_FILE = path.join(__dirname, './task.lock');

if (!SECRET) {
  console.error('缺少环境变量 PUBLISH_SECRET，发布面板拒绝启动');
  process.exit(1);
}

fs.mkdirSync(LOG_DIR, { recursive: true });

// 脚本映射
const SCRIPT_MAP = {
  backend: path.join(__dirname, 'scripts/deploy-backend.sh'),
  frontend: path.join(__dirname, 'scripts/deploy-frontend.sh'),
  all: path.join(__dirname, 'scripts/deploy-all.sh')
};

// 简易鉴权
function checkSecret(token) {
  return Boolean(token) && token === SECRET;
}

// 追加日志到文件
function writeLog(content) {
  const time = new Date().toLocaleString();
  const line = `[${time}] ${content}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf8');
}

// 判断是否正在执行
function isRunning() {
  return fs.existsSync(LOCK_FILE);
}
function lockTask() {
  fs.writeFileSync(LOCK_FILE, Date.now().toString());
}
function unlockTask() {
  if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json;charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Publish-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  // 静态页面
  if (req.url === '/' || req.url === '/index.html') {
    const html = fs.readFileSync(path.join(__dirname, 'publish.html'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
    return res.end(html);
  }

  const token = req.headers['x-publish-token'];
  if (!checkSecret(token)) {
    return sendJson(res, 403, { code: 403, message: '密钥非法' });
  }

  if (req.url === '/status' && req.method === 'GET') {
    return sendJson(res, 200, { code: 200, data: { running: isRunning() } });
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
      if (isRunning()) {
        return sendJson(res, 409, { code: 409, message: '正在执行发布任务，请勿重复触发' });
      }

      lockTask();
      writeLog(`===== 开始发布 target:${target} =====`);

      // 异步执行shell脚本
      const proc = spawn('/bin/bash', [scriptPath], {
        cwd: PROJECT_PATH
      });

      proc.stdout.on('data', buf => writeLog(buf.toString()));
      proc.stderr.on('data', buf => writeLog(`[ERR] ${buf.toString()}`));
      proc.on('error', error => {
        writeLog(`[ERR] 发布进程启动失败：${error.message}`);
        unlockTask();
      });

      proc.on('close', code => {
        writeLog(`===== 发布结束，退出码：${code} =====\n`);
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

server.listen(PORT, () => {
  console.log(`发布面板启动：http://localhost:${PORT}`);
})
