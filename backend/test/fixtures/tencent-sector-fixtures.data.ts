// 腾讯板块 rank 接口 fixture（纯数据模块，不带任何 jest 注册语句）：
// 取自 2026-10-31 实抓 proxy.finance.qq.com 响应（board_type=hy），字段结构与真实响应一致；
// 行内容按测试需求扩展（缺 zgb / 缺 code 的边界行），数值已脱敏。
// 真实响应为完整 JSON（非 JSONP），直接 JSON.parse 即得 TencentSectorRankResponse。
//
// 数据与自检 spec 拆成两个文件的原因：被 import 的模块若含顶层 describe/it，会把用例注册进
// 导入方（stock-indicators.spec.ts）的套件；而 tencent-sector-fixtures.ts 这个路径本身需要
// 是可被 jest 独立运行的自检套件（见该文件头注释），故数据落在本文件。

// 完整 6 行：前 4 行含 zgb/lzg 完整数据，第 5 行缺 zgb，第 6 行缺 code（应被过滤）。
export const TENCENT_SECTOR_RANK_HY_JSON = JSON.stringify({
  code: 0,
  msg: 'ok',
  data: {
    rank_list: [
      {
        code: 'pt01801120',
        hsl: '2.31',
        lb: '1.31',
        ltsz: '37534.11',
        lzg: { code: 'sz000716', name: '黑芝麻', zd: '0.48', zdf: '10.08', zxj: '5.24' },
        name: '食品饮料',
        speed: '0.03',
        stock_type: 'BK-HY-1',
        turnover: '4751753',
        volume: '21435587.00',
        zd: '396.18',
        zdf: '2.84',
        zdf_d20: '6.56',
        zdf_d5: '3.29',
        zgb: '71/122',
        zljlr: '289753.05',
        zsz: '38597.58',
        zxj: '14341.39'
      },
      {
        code: 'pt01801960',
        lzg: { code: 'sh600688', name: '上海石化', zd: '0.25', zdf: '8.93', zxj: '3.05' },
        name: '石油石化',
        stock_type: 'BK-HY-1',
        zdf: '0.91',
        zgb: '15/47'
      },
      {
        code: 'pt01801170',
        lzg: { code: 'sh601083', name: '锦江航运', zd: '1.27', zdf: '10.03', zxj: '13.93' },
        name: '交通运输',
        stock_type: 'BK-HY-1',
        zdf: '0.91',
        zgb: '48/126'
      },
      {
        code: 'pt01801950',
        lzg: { code: 'sh600348', name: '华阳股份', zd: '0.27', zdf: '3.19', zxj: '8.73' },
        name: '煤炭',
        stock_type: 'BK-HY-1',
        zdf: '0.63',
        zgb: '12/33'
      },
      {
        // 缺 zgb：涨跌家数不可知，字段应省略
        code: 'pt01801110',
        lzg: { code: 'sz301187', name: '欧圣电气', zd: '2.80', zdf: '20.00', zxj: '16.80' },
        name: '家用电器',
        stock_type: 'BK-HY-1',
        zdf: '0.60'
      },
      {
        // 缺 code：整行应被过滤
        name: '无码板块',
        stock_type: 'BK-HY-1',
        zdf: '1.00',
        zgb: '5/10'
      }
    ]
  }
});

// 概念板样例（board_type=gn，实抓自 2026-10-31）：验证 gn 与 hy 走同一解析。
export const TENCENT_SECTOR_RANK_GN_JSON = JSON.stringify({
  code: 0,
  msg: 'ok',
  data: {
    rank_list: [
      {
        code: 'pt02090002',
        lzg: { code: 'sh601919', name: '中远海控', zd: '1.17', zdf: '7.02', zxj: '17.84' },
        name: '波罗的海干散货指数(BDI)',
        stock_type: 'BK-GN',
        zdf: '2.58',
        zgb: '7/7'
      },
      {
        // 概念板 code 含大写字母（pt02GN2174），isTencentSectorCode 的 i 标志需覆盖
        code: 'pt02GN2174',
        lzg: { code: 'sz002172', name: '澳洋健康', zd: '0.54', zdf: '10.06', zxj: '5.91' },
        name: '高压氧舱',
        stock_type: 'BK-GN',
        zdf: '1.32',
        zgb: '6/10'
      }
    ]
  }
});
