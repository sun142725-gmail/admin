// CSV 解析纯函数：RFC4180 双引号转义子集的逐字符状态机（不引第三方 CSV 库，AGENTS 离线依赖约定）。
// 转义规则与 frontend/src/utils/csv.ts escapeCell 互逆：含逗号/引号/换行的单元格包引号且内部引号双写。
// 【评审修正】不做任何归一预处理（预替换 \r\n 会改写引号内换行字段），行终结符判定并入状态机：
//   引号态内 \r/\n 原样入字段；引号态外 \r\n / \n 才是行终结符（单独 \r 不作终结符，旧 Mac 场景不支持）。
// 行号口径：物理行号（header 为 1，数据行从 2 起，每个终结符 +1；引号内换行同属一行不另计）。

export interface CsvParseError {
  line: number;
  reason: string;
}

export interface CsvRow {
  // 物理行号（header 为 1，数据行从 2 起）：导入层 rejected 明细直接引用，空行错位也不失准
  line: number;
  cells: string[];
}

export interface CsvParseResult {
  header: string[];
  rows: CsvRow[];
  errors: CsvParseError[];
}

export const parseCsvContent = (content: string): CsvParseResult => {
  // 文件首字符 BOM 剥离（frontend/src/utils/csv.ts:15 同款，Excel 导出常带）
  const text = content.startsWith('\uFEFF') ? content.slice(1) : content;

  const rows: CsvRow[] = [];
  const errors: CsvParseError[] = [];
  let header: string[] = [];

  let field = '';
  const fields: string[] = [];
  let inQuotes = false;
  let lineNumber = 1;

  const endField = () => {
    fields.push(field);
    field = '';
  };

  const endRow = () => {
    endField();
    if (fields.length === 1 && fields[0] === '') {
      // 空行跳过（占物理行号但不产生记录）
      fields.length = 0;
      lineNumber += 1;
      return;
    }
    if (lineNumber === 1) {
      header = fields.slice();
    } else if (fields.length !== header.length) {
      errors.push({ line: lineNumber, reason: `列数不符（期望 ${header.length} 列，实际 ${fields.length} 列）` });
    } else {
      rows.push({ line: lineNumber, cells: fields.slice() });
    }
    fields.length = 0;
    lineNumber += 1;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        // "" 转义为字面引号并消费两字符；单个 " 退出引号态
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        // 引号态内逗号/换行/其余字符一律原样入字段
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      endField();
      continue;
    }
    if (char === '\n') {
      endRow();
      continue;
    }
    if (char === '\r' && text[i + 1] === '\n') {
      // \r\n 吞掉 \r 不入字段值
      endRow();
      i += 1;
      continue;
    }
    field += char;
  }
  // 文件尾无终结符的末行正常收尾
  if (field !== '' || fields.length > 0 || inQuotes) {
    endRow();
  }

  return { header, rows, errors };
};
