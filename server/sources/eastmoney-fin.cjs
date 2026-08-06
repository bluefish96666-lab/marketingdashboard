// 东财财报源 — 单公司主指标/盈利榜/业绩预告
"use strict";

module.exports = function createEastmoneyFin(ctx) {
  const { fetchTextAny, num, toMarketCode6 } = ctx;

  // 统一走 fetch/curl 双通道, Referer 为东财数据中心
  async function emDataGet(url) {
    const text = await fetchTextAny(url, { referer: "https://data.eastmoney.com/" });
    const j = JSON.parse(text);
    return j?.result?.data || [];
  }

  // 带分页元信息(页数): pageSize=1 时 pages 即总行数, 用于"已披露 N 家"
  async function emDataPages(url) {
    const text = await fetchTextAny(url, { referer: "https://data.eastmoney.com/" });
    const j = JSON.parse(text);
    return j?.result?.pages || 0;
  }

  // sh600519/sz000001/bj920748/nq872094 或裸 6 位 → SECUCODE(600519.SH); 有前缀优先用前缀, 否则 6→SH, 0/2/3→SZ, 8→NQ, 4/9→BJ
  function secuCode(raw) {
    const m = String(raw || "").toLowerCase().match(/^(sh|sz|bj|nq)?(\d{6})$/);
    if (!m) return null;
    const prefix = m[1];
    const c = m[2];
    const ex = prefix ? prefix.toUpperCase() : toMarketCode6(c).slice(0, 2).toUpperCase();
    return `${c}.${ex}`;
  }

  // 按当前月份回推最近报告期: 1-3月→上年Q3, 4-6月→Q1, 7-9月→中报, 10-12月→Q3
  function defaultReportPeriod() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    if (m <= 3) return `${y - 1}-09-30`;
    if (m <= 6) return `${y}-03-31`;
    if (m <= 9) return `${y}-06-30`;
    return `${y}-09-30`;
  }

  const validPeriod = (p) => (/^\d{4}-\d{2}-\d{2}$/.test(p || "") ? p : defaultReportPeriod());

  // 单公司近 12 期主指标(F10)
  async function handleFinanceMain(code) {
    const secu = secuCode(code);
    if (!secu) {
      // 入参校验失败属客户端错误, 带 status 让分发层回 400 而非 502
      const err = new Error(`bad code: ${code}`);
      err.status = 400;
      throw err;
    }
    const finUrl =
      `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA` +
      `&columns=ALL&filter=${encodeURIComponent(`(SECUCODE="${secu}")`)}` +
      `&pageNumber=1&pageSize=12&sortTypes=-1&sortColumns=REPORT_DATE&source=HSF10&client=PC`;
    const orgUrl =
      `https://datacenter.eastmoney.com/securities/api/data/v1/get?reportName=RPT_F10_ORG_BASICINFO` +
      `&columns=ALL&filter=${encodeURIComponent(`(SECUCODE="${secu}")`)}` +
      `&pageNumber=1&pageSize=1&source=HSF10&client=PC`;
    const [finRows, orgRows] = await Promise.all([emDataGet(finUrl), emDataGet(orgUrl).catch(() => [])]);
    const org = orgRows[0] || {};
    // 行业: 优先二级行业(与 finance-board 的 BOARD_NAME 对应), 降级一级/三级/证监会行业
    const industry = org.BOARD_NAME_2LEVEL || org.BOARD_NAME_1LEVEL || org.BOARD_NAME_3LEVEL || org.CSRC_INDUSTRY_NAME || "";

    // 主营构成 + 负债/应收 + 现金流(emweb F10 页面接口, 取最新报告期; 失败静默降级为空)
    const emwebJson = async (url) => {
      try { return JSON.parse(await fetchTextAny(url, { referer: "https://emweb.securities.eastmoney.com/" })); }
      catch { return null; }
    };
    let mainop = [];
    let mainopHistory = [];
    let balance = {};
    let cash = {};
    const latestDate = finRows[0]?.REPORT_DATE ? String(finRows[0].REPORT_DATE).slice(0, 10) : "";
    const emCode = secu ? secu.split(".").reverse().join("") : ""; // "600519.SH" -> "SH600519"
    if (latestDate && emCode) {
      const [opJson, zcJson, xjJson] = await Promise.all([
        emwebJson(`https://emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/PageAjax?code=${emCode}`),
        emwebJson(`https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/zcfzbAjaxNew?companyType=4&reportDateType=0&reportType=1&dates=${latestDate}&code=${emCode}`),
        emwebJson(`https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/xjllbAjaxNew?companyType=4&reportDateType=0&reportType=1&dates=${latestDate}&code=${emCode}`),
      ]);
      // 主营构成: 取 zygcfx 自身最新报告期(该接口与 datacenter 最新期不同),
      // 优先按产品(MAINOP_TYPE=2), 降级按行业(1); 取收入 Top 8
      const opRows = opJson?.zygcfx || [];
      // MAINOP_TYPE 为字符串("1"/"2"), 须数字比较
      const isType = (r, t) => Number(r.MAINOP_TYPE) === t;
      const opLatest = [...new Set(opRows.map((r) => String(r.REPORT_DATE).slice(0, 10)))].sort().reverse()[0] || "";
      const opPeriod = opRows.filter((r) => String(r.REPORT_DATE).slice(0, 10) === opLatest);
      const typed = opPeriod.some((r) => isType(r, 2)) ? opPeriod.filter((r) => isType(r, 2)) : opPeriod.filter((r) => isType(r, 1));
      mainop = typed
        .sort((a, b) => num(b.MAIN_BUSINESS_INCOME) - num(a.MAIN_BUSINESS_INCOME))
        .slice(0, 8)
        .map((r) => ({
          name: r.ITEM_NAME || "",
          income: num(r.MAIN_BUSINESS_INCOME),
          incomeRatio: num(r.MBI_RATIO),
          profit: num(r.MAIN_BUSINESS_RPOFIT),
          profitRatio: num(r.MBR_RATIO),
          margin: num(r.GROSS_RPOFIT_RATIO), // 该业务毛利率
        }));

      // 主营构成全历史(按产品优先, 降级行业): 每报告期段列表, 供趋势堆叠柱
      const opByPeriod = new Map();
      for (const r of opRows) {
        const key = String(r.REPORT_DATE).slice(0, 10);
        if (!opByPeriod.has(key)) opByPeriod.set(key, []);
        opByPeriod.get(key).push(r);
      }
      mainopHistory = [...opByPeriod.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .slice(-40)
        .map(([date, rows]) => {
          const typedRows = rows.some((r) => isType(r, 2)) ? rows.filter((r) => isType(r, 2)) : rows.filter((r) => isType(r, 1));
          return {
            date,
            segments: typedRows
              .sort((a, b) => num(b.MAIN_BUSINESS_INCOME) - num(a.MAIN_BUSINESS_INCOME))
              .slice(0, 6)
              .map((r) => ({
                name: r.ITEM_NAME || "",
                income: num(r.MAIN_BUSINESS_INCOME),
                profit: num(r.MAIN_BUSINESS_RPOFIT),
                margin: num(r.GROSS_RPOFIT_RATIO),
              })),
          };
        });
      const zc = zcJson?.data?.[0] || {};
      const xj = xjJson?.data?.[0] || {};
      balance = { totalLiabilities: num(zc.TOTAL_LIABILITIES), accountsReceivable: num(zc.ACCOUNTS_RECE) };
      cash = {
        operate: num(xj.NETCASH_OPERATE),
        capex: num(xj.CONSTRUCT_LONG_ASSET), // 购建固定资产、无形资产等支付的现金
        free: num(xj.NETCASH_OPERATE) - num(xj.CONSTRUCT_LONG_ASSET), // 自由现金流 = 经营 - 资本开支
      };
    }

    return {
      name: finRows[0]?.SECURITY_NAME_ABBR || "",
      industry,
      mainop,
      mainopHistory,
      balance,
      cash,
      reports: finRows.map((r) => ({
        label: r.REPORT_DATE_NAME || "",
        date: String(r.REPORT_DATE || "").slice(0, 10),
        revenue: num(r.TOTALOPERATEREVE),
        netProfit: num(r.PARENTNETPROFIT),
        revenueYoY: num(r.TOTALOPERATEREVETZ),
        profitYoY: num(r.PARENTNETPROFITTZ),
        roe: num(r.ROEJQ),
        grossMargin: num(r.XSMLL),
        netMargin: num(r.XSJLL),
        debtRatio: num(r.ZCFZL),
        roic: num(r.ROIC),
        eps: num(r.EPSJB),
        ocfPerShare: num(r.MGJYXJJE),
      })),
    };
  }

  const finBoardUrl = (period, extra) =>
    `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_LICO_FN_CPD&columns=ALL` +
    `&filter=${encodeURIComponent(`(REPORTDATE='${period}')`)}&pageNumber=1&sortTypes=-1&source=WEB&client=WEB&${extra}`;

  // 宏观数据包: 个股盈利榜 TOP300(含同业对比用) + 行业聚合 TOP15 + 披露日历 60 条 + 已披露家数
  async function handleFinanceBoard(period) {
    const [stockRows, indRows, calRows, disclosed] = await Promise.all([
      emDataGet(finBoardUrl(period, "sortColumns=PARENT_NETPROFIT&pageSize=300")),
      emDataGet(finBoardUrl(period, "sortColumns=PARENT_NETPROFIT&pageSize=500")),
      emDataGet(finBoardUrl(period, "sortColumns=NOTICE_DATE&pageSize=60")),
      emDataPages(finBoardUrl(period, "sortColumns=NOTICE_DATE&pageSize=1")),
    ]);
    const stocks = stockRows
      .filter((r) => r.BOARD_NAME) // 排除行业为 null 的股票(如中欣晶圆)
      .map((r) => ({
        code: r.SECURITY_CODE || "",
        name: r.SECURITY_NAME_ABBR || "",
        industry: r.BOARD_NAME || "",
        netProfit: num(r.PARENT_NETPROFIT),
        profitYoY: num(r.SJLTZ),
        revenueYoY: num(r.YSTZ),
        roe: num(r.WEIGHTAVG_ROE),
        eps: num(r.BASIC_EPS),
      }));
    // 行业聚合: 净利润合计 + 家数 + 平均净利同比
    const agg = new Map();
    for (const r of indRows) {
      const k = r.BOARD_NAME || "其他";
      let a = agg.get(k);
      if (!a) { a = { name: k, netProfit: 0, count: 0, yoySum: 0, yoyN: 0 }; agg.set(k, a); }
      a.netProfit += num(r.PARENT_NETPROFIT);
      a.count += 1;
      if (Number.isFinite(parseFloat(r.SJLTZ))) { a.yoySum += num(r.SJLTZ); a.yoyN += 1; }
    }
    const industries = [...agg.values()]
      .sort((a, b) => b.netProfit - a.netProfit)
      .slice(0, 15)
      .map((a) => ({ name: a.name, netProfit: a.netProfit, count: a.count, yoy: a.yoyN ? +(a.yoySum / a.yoyN).toFixed(2) : 0 }));
    const calendar = calRows.map((r) => ({
      date: String(r.NOTICE_DATE || "").slice(0, 10),
      code: r.SECURITY_CODE || "",
      name: r.SECURITY_NAME_ABBR || "",
      period: r.QDATE || "",
    }));
    return { period, disclosed, stocks, industries, calendar };
  }

  // 业绩预告: 类型从 FORECASTCONTENT 提取, 统计预喜/预悲/不确定
  const FORECAST_TYPES = ["预增", "预减", "扭亏", "首亏", "略增", "略减", "减亏", "增亏"];
  const FORECAST_GOOD = new Set(["预增", "略增", "扭亏", "减亏"]);
  const FORECAST_BAD = new Set(["预减", "略减", "首亏", "增亏"]);

  async function handleFinanceForecast(period) {
    const url =
      `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_PUBLIC_OP_PREDICT&columns=ALL` +
      `&filter=${encodeURIComponent(`(REPORTDATE='${period}')`)}` +
      `&sortColumns=NOTICE_DATE&sortTypes=-1&pageSize=60&source=WEB&client=WEB`;
    const rows = await emDataGet(url);
    const items = rows.map((r) => {
      // 上游自带 FORECASTTYPE(预增/预减/扭亏/首亏/略增/略减/减亏/增亏/续盈/续亏), 缺失时从正文提取
      const content = String(r.FORECASTCONTENT || "");
      const type = String(r.FORECASTTYPE || "").trim() || FORECAST_TYPES.find((t) => content.includes(t)) || "不确定";
      return {
        date: String(r.NOTICE_DATE || "").slice(0, 10),
        code: r.SECURITY_CODE || "",
        name: r.SECURITY_NAME_ABBR || "",
        type,
        profitLow: num(r.FORECASTL),
        profitHigh: num(r.FORECASTT),
        yoyLow: num(r.INCREASEL),
        yoyHigh: num(r.INCREASET),
      };
    });
    const stats = { good: 0, bad: 0, neutral: 0 };
    for (const it of items) {
      if (FORECAST_GOOD.has(it.type)) stats.good += 1;
      else if (FORECAST_BAD.has(it.type)) stats.bad += 1;
      else stats.neutral += 1;
    }
    return { period, stats, items };
  }

  return { handleFinanceMain, handleFinanceBoard, handleFinanceForecast, validPeriod };
};
