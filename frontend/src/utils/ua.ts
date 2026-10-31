// User-Agent 解析纯函数：把浏览器原始 UA 拆成 浏览器/操作系统/设备 三类识别结果。
// 仅依赖字符串规则，不引入第三方库；规则按优先级排列（包含关系的 UA 要先判特例，如 Edge/微信含 Chrome 标识）。

export interface UaInfo {
  browser: string;
  browserVersion?: string;
  os: string;
  osVersion?: string;
  device: '桌面端' | '移动端' | '平板';
}

interface BrowserRule {
  name: string;
  pattern: RegExp;
  // 版本默认取 pattern 捕获组 1，个别 UA 版本在别的标识里（如 Safari 用 Version/x）
  versionPattern?: RegExp;
}

// 顺序即优先级：特例在前
const BROWSER_RULES: BrowserRule[] = [
  { name: '微信', pattern: /MicroMessenger\/([\d.]+)/i },
  { name: 'QQ浏览器', pattern: /MQQBrowser\/([\d.]+)/i },
  { name: 'Edge', pattern: /Edg(?:e|A|iOS)?\/([\d.]+)/i },
  { name: 'Chrome', pattern: /Chrome\/([\d.]+)/i },
  { name: 'Firefox', pattern: /Firefox\/([\d.]+)/i },
  { name: 'Safari', pattern: /Safari\/[\d.]+/i, versionPattern: /Version\/([\d.]+)/i }
];

const OS_RULES: Array<{ name: string; pattern: RegExp; versionPattern?: RegExp; transform?: (v: string) => string }> = [
  {
    name: 'Windows',
    pattern: /Windows NT ([\d.]+)/i,
    // NT 10.0 覆盖 Win10/11，UA 无法区分，统一显示 10+
    transform: (v) => (v === '10.0' ? '10+' : v)
  },
  {
    name: 'macOS',
    pattern: /Mac OS X ([\d_]+)/i,
    // 只取主次版本（10_15_7 → 10.15），细版本对排查意义不大
    transform: (v) => v.replace(/_/g, '.').split('.').slice(0, 2).join('.')
  },
  {
    name: 'iOS',
    pattern: /(?:iPhone|iPad|iPod).*?OS ([\d_]+)/i,
    transform: (v) => v.replace(/_/g, '.').split('.').slice(0, 2).join('.')
  },
  { name: 'Android', pattern: /Android ([\d.]+)/i },
  { name: 'Linux', pattern: /Linux/i }
];

export const parseUserAgent = (userAgent?: string | null): UaInfo | null => {
  if (!userAgent || !userAgent.trim()) {
    return null;
  }
  const ua = userAgent.trim();

  let browser = '未知';
  let browserVersion: string | undefined;
  for (const rule of BROWSER_RULES) {
    const matched = ua.match(rule.pattern);
    if (matched) {
      browser = rule.name;
      const versionSource = rule.versionPattern ? ua.match(rule.versionPattern) : matched;
      if (versionSource?.[1]) {
        // 主版本号即可定位问题，完整串在原始 UA 里始终可见
        browserVersion = versionSource[1].split('.')[0];
      }
      break;
    }
  }

  let os = '未知';
  let osVersion: string | undefined;
  for (const rule of OS_RULES) {
    const matched = ua.match(rule.pattern);
    if (matched) {
      os = rule.name;
      const rawVersion = matched[1];
      if (rawVersion) {
        osVersion = rule.transform ? rule.transform(rawVersion) : rawVersion;
      }
      break;
    }
  }

  let device: UaInfo['device'] = '桌面端';
  if (/iPad|Tablet/i.test(ua)) {
    device = '平板';
  } else if (/Mobi|iPhone|iPod|Android.*Mobile/i.test(ua)) {
    device = '移动端';
  }

  return { browser, browserVersion, os, osVersion, device };
};

// 列表列用的短格式："Chrome 120 · macOS 14"；浏览器与系统都识别不出时回退原始 UA
export const formatUaShort = (userAgent?: string | null): string => {
  const info = parseUserAgent(userAgent);
  if (!info || (info.browser === '未知' && info.os === '未知')) {
    return userAgent ?? '-';
  }
  const browser = info.browserVersion ? `${info.browser} ${info.browserVersion}` : info.browser;
  const os = info.osVersion ? `${info.os} ${info.osVersion}` : info.os;
  return `${browser} · ${os}`;
};
