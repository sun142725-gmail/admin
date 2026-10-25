"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ths_f10_api_1 = require("./src/modules/stock/market/ths-f10.api");
(async () => {
    const res = await fetch((0, ths_f10_api_1.buildThsF10Url)('600519'), {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0', Referer: 'https://basic.10jqka.com.cn/' },
        signal: AbortSignal.timeout(10000)
    });
    const html = new TextDecoder('gbk').decode(await res.arrayBuffer());
    console.log('real page parse:', JSON.stringify((0, ths_f10_api_1.parseThsFinancials)(html)));
})();
//# sourceMappingURL=verify-fin.tmp.js.map