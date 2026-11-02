// buildCsv 纯函数单测（vitest，纯 node 环境）：转义规则与 BOM。
// downloadCsv 是 DOM 副作用薄封装（Blob/anchor），与 utils/errorMessage.test.ts 纯函数口径一致不测。
import { describe, expect, it } from 'vitest';
import { buildCsv } from './csv';

describe('buildCsv', () => {
  it('普通行以逗号拼接并以 CRLF 换行', () => {
    expect(buildCsv(['a', 'b'], [['1', '2'], ['3', '4']])).toBe('\uFEFFa,b\r\n1,2\r\n3,4');
  });

  it('含逗号的单元格包引号', () => {
    expect(buildCsv(['name'], [['张三,李四']])).toBe('\uFEFFname\r\n"张三,李四"');
  });

  it('含引号的单元格包引号且内部引号双写转义', () => {
    expect(buildCsv(['quote'], [['he said "hi"']])).toBe('\uFEFFquote\r\n"he said ""hi"""');
  });

  it('含换行的单元格包引号', () => {
    expect(buildCsv(['multi'], [['line1\nline2'], ['line1\r\nline2']])).toBe(
      '\uFEFFmulti\r\n"line1\nline2"\r\n"line1\r\nline2"'
    );
  });

  it('中文原样不转义', () => {
    expect(buildCsv(['模型'], [['用量报表']])).toBe('\uFEFF模型\r\n用量报表');
  });

  it('null 与 undefined 输出空串', () => {
    expect(buildCsv(['a', 'b', 'c'], [[null, undefined, 'x']])).toBe('\uFEFFa,b,c\r\n,,x');
  });

  it('首行 BOM 防 Excel 乱码', () => {
    expect(buildCsv(['h'], [['v']]).charCodeAt(0)).toBe(0xfeff);
  });
});
