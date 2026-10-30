// 线上脚本纯函数单元测试：白名单校验/扩展名解析/目录扫描/参数拼装/审计结构。
// 全部离线，仅用临时目录 fixture，不依赖网络与 Nest 容器（node:test）。
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  OUTPUT_TAIL_BYTES,
  parseAllowedExts,
  validateScriptName,
  listOnlineScripts,
  buildRunnerArgs,
  secretFingerprint,
  buildAuditRecord,
  appendAuditFile,
  readAuditTail
} = require('../lib/online-scripts.js');

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ---------- validateScriptName：穿越/绝对路径/子目录/特殊名/扩展名 ----------

test('validateScriptName 拒绝相对路径穿越 ../', () => {
  const result = validateScriptName('../../etc/passwd.sql', ['.sql']);
  assert.equal(result.ok, false);
  assert.match(result.reason, /路径分隔符/);
});

test('validateScriptName 拒绝绝对路径', () => {
  const result = validateScriptName('/etc/shadow.sql', ['.sql']);
  assert.equal(result.ok, false);
});

test('validateScriptName 拒绝子目录名', () => {
  assert.equal(validateScriptName('sub/a.sql', ['.sql']).ok, false);
  assert.equal(validateScriptName('a.sql/b.sql', ['.sql']).ok, false);
});

test('validateScriptName 拒反斜杠路径分隔符', () => {
  assert.equal(validateScriptName('sub\\a.sql', ['.sql']).ok, false);
});

test('validateScriptName 拒绝 . 与 ..', () => {
  assert.equal(validateScriptName('.', ['.sql']).ok, false);
  assert.equal(validateScriptName('..', ['.sql']).ok, false);
});

test('validateScriptName 拒绝隐藏文件', () => {
  assert.equal(validateScriptName('.hidden.sql', ['.sql']).ok, false);
});

test('validateScriptName 拒绝空串与非字符串', () => {
  assert.equal(validateScriptName('', ['.sql']).ok, false);
  assert.equal(validateScriptName(undefined, ['.sql']).ok, false);
  assert.equal(validateScriptName(null, ['.sql']).ok, false);
  assert.equal(validateScriptName(123, ['.sql']).ok, false);
});

test('validateScriptName 拒绝非白名单扩展名', () => {
  const result = validateScriptName('evil.sh', ['.sql']);
  assert.equal(result.ok, false);
  assert.match(result.reason, /扩展名/);
});

test('validateScriptName 拒绝无扩展名', () => {
  assert.equal(validateScriptName('readme', ['.sql']).ok, false);
});

test('validateScriptName 接受合法时间戳命名 SQL', () => {
  const result = validateScriptName('20261030_0001_example_probe.sql', ['.sql']);
  assert.equal(result.ok, true);
});

test('validateScriptName 尊重自定义扩展名白名单', () => {
  assert.equal(validateScriptName('task.sh', ['.sql', '.sh']).ok, true);
  assert.equal(validateScriptName('task.sql', ['.sh']).ok, false);
});

test('validateScriptName 允许名中含点与连字符但拒绝危险变体', () => {
  assert.equal(validateScriptName('a..b.sql', ['.sql']).ok, true);
  assert.equal(validateScriptName('a-b_c1.sql', ['.sql']).ok, true);
  // 「..」单独出现已被上面的用例覆盖；「..」结尾的合法扩展名不应被误判为目录穿越
  assert.equal(validateScriptName('a.sql.', ['.sql']).ok, false);
});

// ---------- parseAllowedExts ----------

test('parseAllowedExts 默认返回 [".sql"]', () => {
  assert.deepEqual(parseAllowedExts(undefined), ['.sql']);
  assert.deepEqual(parseAllowedExts(''), ['.sql']);
  assert.deepEqual(parseAllowedExts('   '), ['.sql']);
});

test('parseAllowedExts 逗号解析并去空白', () => {
  assert.deepEqual(parseAllowedExts(' .sql , .sh '), ['.sql', '.sh']);
});

test('parseAllowedExts 非法输入回退默认', () => {
  assert.deepEqual(parseAllowedExts('sql'), ['.sql']);
  assert.deepEqual(parseAllowedExts('.,.sh'), ['.sh']);
  assert.deepEqual(parseAllowedExts(null), ['.sql']);
});

// ---------- listOnlineScripts ----------

test('listOnlineScripts 过滤子目录与非白名单扩展，输出 name/size/mtime', () => {
  const dir = makeTmpDir('rbac-online-scan-');
  try {
    fs.writeFileSync(path.join(dir, 'a.sql'), 'SELECT 1;\n');
    fs.writeFileSync(path.join(dir, 'b.txt'), 'not allowed');
    fs.writeFileSync(path.join(dir, '.hidden.sql'), 'hidden');
    fs.mkdirSync(path.join(dir, 'sub'));
    fs.writeFileSync(path.join(dir, 'sub', 'nested.sql'), 'nested');

    const items = listOnlineScripts(dir, ['.sql']);
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'a.sql');
    assert.equal(items[0].size, 'SELECT 1;\n'.length);
    assert.equal(typeof items[0].mtime, 'string');
    assert.ok(!Number.isNaN(Date.parse(items[0].mtime)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('listOnlineScripts 目录不存在返回空数组', () => {
  assert.deepEqual(listOnlineScripts('/nonexistent-path-for-rbac-test', ['.sql']), []);
});

test('listOnlineScripts 使用自定义扩展名过滤', () => {
  const dir = makeTmpDir('rbac-online-scan2-');
  try {
    fs.writeFileSync(path.join(dir, 'run.sh'), 'echo hi');
    fs.writeFileSync(path.join(dir, 'run.sql'), 'SELECT 1;');
    const items = listOnlineScripts(dir, ['.sh']);
    assert.equal(items.length, 1);
    assert.equal(items[0].name, 'run.sh');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- buildRunnerArgs ----------

test('buildRunnerArgs 产出固定 /bin/bash + 数组参数', () => {
  const { command, args } = buildRunnerArgs('/app/scripts/run-online.sh', 'a.sql');
  assert.equal(command, '/bin/bash');
  assert.ok(Array.isArray(args));
  assert.deepEqual(args, ['/app/scripts/run-online.sh', 'a.sql']);
});

test('buildRunnerArgs 元素不含 shell 元字符与换行', () => {
  const dangerous = ['a;ls.sql', 'a|b.sql', 'a&b.sql', 'a$b.sql', 'a`id`.sql', 'a\nb.sql', 'a\rb.sql'];
  for (const name of dangerous) {
    assert.throws(() => buildRunnerArgs('/app/runner.sh', name), /非法字符/);
  }
  assert.throws(() => buildRunnerArgs('/app/ro;unner.sh', 'a.sql'), /非法字符/);
  assert.throws(() => buildRunnerArgs('', 'a.sql'), /不能为空/);
  assert.throws(() => buildRunnerArgs('/app/runner.sh', ''), /不能为空/);
});

// ---------- secretFingerprint / buildAuditRecord ----------

test('secretFingerprint 输出 sha256 前 8 位十六进制', () => {
  const fp = secretFingerprint('test-secret');
  assert.match(fp, /^[0-9a-f]{8}$/);
  assert.equal(fp, require('node:crypto').createHash('sha256').update('test-secret').digest('hex').slice(0, 8));
  assert.equal(secretFingerprint(''), '');
});

test('buildAuditRecord 字段齐全且 outputTail 截断', () => {
  const before = Date.now();
  const record = buildAuditRecord({
    scriptName: 'a.sql',
    ip: '127.0.0.1',
    secret: 'test-secret',
    exitCode: 0,
    durationMs: 1234,
    timedOut: false,
    output: 'x'.repeat(OUTPUT_TAIL_BYTES + 500)
  });
  const after = Date.now();

  assert.equal(record.script, 'a.sql');
  assert.equal(record.ip, '127.0.0.1');
  assert.equal(record.secretFingerprint, secretFingerprint('test-secret'));
  assert.equal(record.exitCode, 0);
  assert.equal(record.durationMs, 1234);
  assert.equal(record.timedOut, false);
  assert.equal(record.outputTail.length, OUTPUT_TAIL_BYTES);
  const time = Date.parse(record.time);
  assert.ok(time >= before && time <= after);
});

test('buildAuditRecord 非法数值记 null、超时置 timedOut', () => {
  const record = buildAuditRecord({
    scriptName: 'sleep.sql',
    ip: '::1',
    secret: 'test-secret',
    exitCode: null,
    durationMs: undefined,
    timedOut: true,
    output: ''
  });
  assert.equal(record.exitCode, null);
  assert.equal(record.durationMs, null);
  assert.equal(record.timedOut, true);
  assert.equal(record.outputTail, '');
});

// ---------- appendAuditFile / readAuditTail ----------

test('appendAuditFile 写 JSONL，readAuditTail 读末 N 条并跳过坏行', () => {
  const dir = makeTmpDir('rbac-online-audit-');
  const file = path.join(dir, 'nested', 'audit.jsonl');
  try {
    const r1 = buildAuditRecord({ scriptName: 'a.sql', ip: '127.0.0.1', secret: 's', exitCode: 0, durationMs: 10, timedOut: false, output: 'one' });
    const r2 = buildAuditRecord({ scriptName: 'b.sql', ip: '127.0.0.1', secret: 's', exitCode: 3, durationMs: 20, timedOut: false, output: 'two' });
    appendAuditFile(file, r1);
    appendAuditFile(file, r2);
    fs.appendFileSync(file, '{broken json\n');

    assert.deepEqual(readAuditTail(file, 50), [r1, r2]);
    const tail = readAuditTail(file, 1);
    assert.equal(tail.length, 1);
    assert.equal(tail[0].script, 'b.sql');
    assert.deepEqual(readAuditTail(path.join(dir, 'missing.jsonl'), 50), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
