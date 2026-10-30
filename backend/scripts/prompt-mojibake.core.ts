// 提示词库乱码判定与还原纯函数（不依赖 DB/网络，jest 可单测）。
//
// 根因（2026-10 审计实测结论）：prompt_templates id=2..6 五行中文文本是一次性手工 SQL 写入的
// 历史脏数据——写入时容器内 mysql 客户端未带 --default-character-set=utf8mb4，UTF-8 字节流被按
// latin1（MySQL 的 latin1 实为 cp1252）逐字节解释成字符后再以 utf8mb4 落盘，即「双重编码」。
// 「官方示例」等来源字样不在任何源码中，属纯数据问题；现行 TypeORM/Go 写链路字符集均健康。
// 运维约定：容器内手工 SQL 必须显式 --default-character-set=utf8mb4。
//
// 判定五条件（全过才认定为可无损还原的乱码）：
//   a) 值不含任何 CJK（已含 CJK 说明正常或已修复，跳过）；
//   b) 每个字符可经 cp1252 反查为单字节（27 项特殊映射 + ISO-8859-1 恒等）；
//   c) 反查出的字节序列是合法 UTF-8（解码无 U+FFFD）；
//   d) 解码结果含 ≥1 个 CJK 字符（ASCII 字段在此天然不命中，不会被误伤）；
//   e) 无损往返：还原文再经「UTF-8 字节 → cp1252 编码」须与原串逐字符相等。
// 支持最多 3 轮迭代防双重乱码，每轮都必须通过条件 e。
import { createHash } from 'crypto';

/** CJK 判定：CJK 扩展 A / 基本区 / 兼容表意区（覆盖简繁日韩常用汉字）。 */
const CJK_PATTERN = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/;

/** 还原迭代上限：防双重/三重乱码无限循环。 */
export const MAX_RESTORE_ROUNDS = 3;

// cp1252 对 0x80–0x9F 的 27 项特殊映射（0x81/0x8D/0x8F/0x90/0x9D 在 cp1252 中未定义）。
// 这是 MySQL latin1 连接字符集语义的依据：UTF-8 字节 0x80–0x9F 被解释成这些字符而非 C1 控制符。
// 字节表与字符表按下标一一对应（顺序经过审计样本 ç§»åŠ¨ç«¯↔移动端 与 HEX 前缀 C3A6C2B0C2B4 逐字节验证）。
const CP1252_SPECIAL_BYTES = [
  0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8e,
  0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9e, 0x9f
];
const CP1252_SPECIALS = new Map<string, number>(
  [
    '€', '‚', 'ƒ', '„', '…', '†', '‡', 'ˆ', '‰', 'Š', '‹', 'Œ', 'Ž',
    '‘', '’', '“', '”', '•', '–', '—', '˜', '™', 'š', '›', 'œ', 'ž', 'Ÿ'
  ].map((char, index) => [char, CP1252_SPECIAL_BYTES[index]] as const)
);

// cp1252 字节 → 字符（正向表）：27 项特殊映射 + 未定义 5 字节回落 C1 控制位 + 其余恒等。
// 未定义字节回落 C1 控制符与 MySQL latin1→utf8mb4 的行为一致（如 0x8F → U+008F）。
const BYTE_TO_CHAR: string[] = (() => {
  const table = new Array<string>(256);
  for (let byte = 0; byte < 256; byte += 1) {
    table[byte] = String.fromCharCode(byte);
  }
  for (const [char, byte] of CP1252_SPECIALS) {
    table[byte] = char;
  }
  return table;
})();

/** 值是否含 CJK（条件 a；修复后字段含 CJK，重跑天然不命中 → 幂等）。 */
export const containsCjk = (text: string): boolean => CJK_PATTERN.test(text);

/** 单字符反查 cp1252 字节（条件 b）：27 项特殊表 + ASCII/Latin-1 恒等 + C1 控制位；失败返回 null。 */
const charToByte = (char: string): number | null => {
  const special = CP1252_SPECIALS.get(char);
  if (special !== undefined) {
    return special;
  }
  const code = char.codePointAt(0) ?? NaN;
  if (!Number.isFinite(code) || code > 0xff) {
    return null; // 超出 Latin-1/特殊表范围（含 U+0100 以上与代理对）：不可反查
  }
  return code; // ASCII 0x00–0x7F、C1 控制位 0x80–0x9F、Latin-1 增补 0xA0–0xFF 恒等
};

/** 单字节 → cp1252 字符（正向，用于往返验证）。 */
const byteToChar = (byte: number): string => BYTE_TO_CHAR[byte] ?? String.fromCharCode(byte);

/** 严格 UTF-8 解码：非法字节序列返回 null（条件 c）。 */
const decodeUtf8Strict = (bytes: Buffer): string | null => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
};

/** 条件 e：还原文按 UTF-8 编码回字节、再按 cp1252 逐字节还原字符，须与原串逐字符相等。 */
const roundTrips = (original: string, restored: string): boolean => {
  let out = '';
  for (const byte of Buffer.from(restored, 'utf8')) {
    out += byteToChar(byte);
  }
  return out === original;
};

export interface RestoreAttempt {
  ok: boolean;
  text: string;
  reason?: string;
}

/** 单轮还原：字符 → cp1252 字节 → 严格 UTF-8 解码；任一字符不可反查或字节非法即失败。 */
const restoreOnce = (text: string): RestoreAttempt => {
  const bytes: number[] = [];
  for (const char of text) {
    const byte = charToByte(char);
    if (byte === null) {
      const code = char.codePointAt(0) ?? 0;
      return { ok: false, text, reason: `含不可反查字符 U+${code.toString(16).toUpperCase().padStart(4, '0')}` };
    }
    bytes.push(byte);
  }
  const decoded = decodeUtf8Strict(Buffer.from(bytes));
  if (decoded === null) {
    return { ok: false, text, reason: '字节序列不是合法 UTF-8' };
  }
  if (!roundTrips(text, decoded)) {
    return { ok: false, text, reason: '往返校验失败（还原不可无损）' };
  }
  return { ok: true, text: decoded };
};

export interface MojibakeJudgement {
  restorable: boolean;
  /** 还原后的文本（restorable=true 时有值）。 */
  restored?: string;
  /** 不可还原原因（restorable=false 时有值）。 */
  reason?: string;
  /** 实际执行的还原轮数。 */
  rounds: number;
}

/**
 * 五条件判定 + 还原：最多 MAX_RESTORE_ROUNDS 轮，每轮过条件 e；出现 CJK（条件 d）即认定可还原。
 * 纯 ASCII/纯西文文本会被条件 d 拒绝（还原后仍无 CJK），不会误伤。
 */
export const isRestorableMojibake = (text: string): MojibakeJudgement => {
  if (!text) {
    return { restorable: false, reason: '空值', rounds: 0 };
  }
  if (containsCjk(text)) {
    return { restorable: false, reason: '已含 CJK，非乱码（或已修复），跳过', rounds: 0 };
  }
  let current = text;
  for (let round = 1; round <= MAX_RESTORE_ROUNDS; round += 1) {
    const attempt = restoreOnce(current);
    if (!attempt.ok) {
      return { restorable: false, reason: attempt.reason, rounds: round - 1 };
    }
    current = attempt.text;
    if (containsCjk(current)) {
      return { restorable: true, restored: current, rounds: round };
    }
    // 未出现 CJK：可能是双重乱码，继续下一轮；也可能是纯西文，3 轮耗尽后如实拒绝。
  }
  return { restorable: false, reason: `还原 ${MAX_RESTORE_ROUNDS} 轮仍未出现 CJK（疑为纯西文/非乱码）`, rounds: MAX_RESTORE_ROUNDS };
};

/**
 * 逆向构造（仅供测试/校验锚点）：把明文按「UTF-8 字节 → cp1252 字符」编码成乱码串。
 * 与审计还原报告逐字节互逆（ç§»åŠ¨ç«¯ ↔ 移动端 即由本函数生成并经 HEX 比对验证）。
 */
export const toCp1252Mojibake = (text: string): string => {
  let out = '';
  for (const byte of Buffer.from(text, 'utf8')) {
    out += byteToChar(byte);
  }
  return out;
};

/** 幂等键：sha256(trim(template))。与 prompt-library.service.ts 的 hashPrompt 口径完全一致。 */
export const computePromptHash = (template: string): string =>
  createHash('sha256').update(template.trim()).digest('hex');
