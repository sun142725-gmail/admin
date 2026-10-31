// UA 解析纯函数单测：覆盖主流浏览器/系统/设备与特例优先级（vitest，不依赖网络与组件）。
import { describe, expect, it } from 'vitest';
import { formatUaShort, parseUserAgent } from './ua';

describe('parseUserAgent', () => {
  it('空/空白 UA 返回 null', () => {
    expect(parseUserAgent(undefined)).toBeNull();
    expect(parseUserAgent('')).toBeNull();
    expect(parseUserAgent('   ')).toBeNull();
  });

  it('Windows Chrome', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    expect(info).toEqual({
      browser: 'Chrome',
      browserVersion: '120',
      os: 'Windows',
      osVersion: '10+',
      device: '桌面端'
    });
  });

  it('Edge 优先于 Chrome（UA 同时含 Edg 与 Chrome 标识）', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91'
    );
    expect(info?.browser).toBe('Edge');
    expect(info?.browserVersion).toBe('120');
  });

  it('macOS Safari 版本取自 Version/ 标识', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15'
    );
    expect(info?.browser).toBe('Safari');
    expect(info?.browserVersion).toBe('17');
    expect(info?.os).toBe('macOS');
    expect(info?.osVersion).toBe('10.15');
  });

  it('iPhone Safari 识别为移动端 + iOS', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1'
    );
    expect(info?.browser).toBe('Safari');
    expect(info?.os).toBe('iOS');
    expect(info?.osVersion).toBe('17.1');
    expect(info?.device).toBe('移动端');
  });

  it('Android Chrome 识别为移动端', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36'
    );
    expect(info?.browser).toBe('Chrome');
    expect(info?.browserVersion).toBe('119');
    expect(info?.os).toBe('Android');
    expect(info?.osVersion).toBe('13');
    expect(info?.device).toBe('移动端');
  });

  it('iPad 识别为平板', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
    );
    expect(info?.device).toBe('平板');
    expect(info?.os).toBe('iOS');
  });

  it('微信内置浏览器优先于 Chrome', () => {
    const info = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.42(0x18002a33) NetType/WIFI'
    );
    expect(info?.browser).toBe('微信');
    expect(info?.browserVersion).toBe('8');
  });

  it('无法识别的 UA 返回未知但不抛异常', () => {
    const info = parseUserAgent('curl/8.4.0');
    expect(info?.browser).toBe('未知');
    expect(info?.os).toBe('未知');
    expect(info?.device).toBe('桌面端');
  });
});

describe('formatUaShort', () => {
  it('输出 "浏览器 版本 · 系统 版本" 短格式', () => {
    expect(
      formatUaShort(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      )
    ).toBe('Chrome 120 · Windows 10+');
  });

  it('解析失败回退原始 UA', () => {
    expect(formatUaShort('curl/8.4.0')).toBe('curl/8.4.0');
    expect(formatUaShort(undefined)).toBe('-');
  });
});
