// 角色参考图安全读取：路径归一 + 限根校验 + 转 data URL。
// 参考图路径由登录用户经 DTO 任意传入，读盘前必须限根 uploads——否则可把本机任意
// png/jpg 读出并发往第三方生图上游（路径穿越风险）。
// 纯函数（sanitizeImageRelative/extensionToMime/toDataUrl）与薄 IO 封装（readImageAsDataUrl）
// 分离，纯函数离线单测，IO 层不测（AGENTS 规则 4）。
import { readFile } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';

/** uploads 静态根目录（与 files.controller.ts / novel-pipeline.service 落盘口径一致）。 */
export const uploadsRoot = (): string => join(process.cwd(), 'uploads');

/** MIME → data URL 前缀拼装（base64）。 */
export const toDataUrl = (mime: string, buffer: Buffer): string =>
  `data:${mime};base64,${buffer.toString('base64')}`;

/** 扩展名 → MIME：仅放行 png/jpg/jpeg（部分上游 images/edits 仅认 jpg/png），其余 null。 */
export const extensionToMime = (ext: string): string | null => {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    default:
      return null;
  }
};

/**
 * 参考图路径归一：files/upload 返回 '/uploads/<biz>/<ts>.<ext>'（files.controller.ts:72），
 * 前端会原样存入 reference_images——先剥掉 '/uploads/' 前缀（否则 join 拼成
 * uploads/uploads/... 全部静默读失败）再做限根校验。
 * 含 '..' 段 / 前导 '/' 的绝对路径 / resolve 后逃出 uploads 根一律返回 null。
 * 合法输入返回相对 uploads 的安全路径。
 */
export const sanitizeImageRelative = (raw: string): string | null => {
  const input = (raw ?? '').trim();
  if (!input) {
    return null;
  }
  // 剥离静态前缀后按「相对 uploads」语义处理；残留前导 '/' 视为绝对路径直接拒绝。
  let cleaned = input.startsWith('/uploads/') ? input.slice('/uploads/'.length) : input;
  if (cleaned.startsWith('/')) {
    return null;
  }
  // 显式拒绝 '..' 段（纵深防御：即使 resolve 归一后仍在根内也不放行带穿越段的输入）。
  const segments = cleaned.split(/[\\/]+/);
  if (segments.some((segment) => segment === '..')) {
    return null;
  }
  cleaned = segments.join('/');
  if (!cleaned) {
    return null;
  }
  const root = uploadsRoot();
  // 限根：resolve 归一后必须仍位于 uploads 根之内（拦截符号逃逸等残余形态）。
  const absolute = resolve(root, cleaned);
  if (!absolute.startsWith(root + sep)) {
    return null;
  }
  return absolute.slice(root.length + 1);
};

/**
 * 薄 IO 封装：先过限根校验，再按扩展名判 MIME 读盘转 data URL。
 * 非法路径 / 不支持的扩展名 / 读盘失败一律返回 null（调用方跳过该图，不阻塞出片）。
 */
export const readImageAsDataUrl = async (raw: string): Promise<string | null> => {
  const relative = sanitizeImageRelative(raw);
  if (!relative) {
    return null;
  }
  const mime = extensionToMime(extname(relative));
  if (!mime) {
    return null;
  }
  try {
    const buffer = await readFile(join(uploadsRoot(), relative));
    return toDataUrl(mime, buffer);
  } catch {
    return null;
  }
};
