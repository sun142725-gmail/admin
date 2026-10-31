// CSV 导出工具：生成带 BOM 的 CSV（Excel 直开不乱码）并触发下载。
export type CsvCell = string | number | null | undefined;

const escapeCell = (value: CsvCell): string => {
  const text = value === null || value === undefined ? '' : String(value);
  // 引号/逗号/换行需包引号并转义内部引号
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const buildCsv = (headers: string[], rows: CsvCell[][]): string => {
  const lines = [headers, ...rows].map((row) => row.map(escapeCell).join(','));
  return `\uFEFF${lines.join('\r\n')}`;
};

export const downloadCsv = (filename: string, headers: string[], rows: CsvCell[][]) => {
  const blob = new Blob([buildCsv(headers, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
