// 产业链股票解析(本地正则, 无需 LLM)
"use strict";

const { toMarketCode6 } = require("./format.cjs");

function handleChainParse(body) {
  const { name = "", content = "" } = body || {};
  const warnings = [];

  if (!content.trim()) {
    return { name, source: "local", segments: [], warnings: ["content is empty"] };
  }

  // 尝试按 iWenCai 段落标题分段: 上游·材料/设备、中游·制造/封测、下游·应用/终端
  const sectionHeaders = [
    { key: "上游", name: "上游·材料/设备", desc: "原材料、设备与零部件等上游环节" },
    { key: "中游", name: "中游·制造/封测", desc: "代工、制造与封测等中游环节" },
    { key: "下游", name: "下游·应用/终端", desc: "应用、终端与整车等下游客群" },
  ];

  // 提取股票代码: 支持 NAME(CODE.SZ) 和 CODE NAME 两种格式
  const stocksFromText = (text) => {
    const results = [];
    const seen = new Set();
    // 给代码加上市场前缀(统一映射)
    const prefixed = (code) => toMarketCode6(code.replace(/\D/g, "").slice(-6).padStart(6, "0"));
    // 格式1: 中文名称（CODE.SH/SZ/BJ）或 中文名称(CODE)
    const re1 = /([\u4e00-\u9fa5]{2,6})[（(]\s*(?:sh|sz|bj)?(\d{6})[^）)]*[）)]/gi;
    let m;
    while ((m = re1.exec(text)) !== null) {
      const code = prefixed(m[2]);
      const key = `${code}:${m[1]}`;
      if (!seen.has(key)) { seen.add(key); results.push({ code, name: m[1] }); }
    }
    // 格式2: CODE.SH/SZ/BJ 中文名称 或 CODE 中文名称
    const re2 = /(?:sh|sz|bj)?(\d{6})\s*([\u4e00-\u9fa5]{2,6})/g;
    while ((m = re2.exec(text)) !== null) {
      const code = prefixed(m[1]);
      const key = `${code}:${m[2]}`;
      if (!seen.has(key)) { seen.add(key); results.push({ code, name: m[2] }); }
    }
    return results;
  };

  // 先按段落标题切分
  const lines = content.split("\n");
  let currentSection = -1; // -1 = 未进入任何段落
  const sectionTexts = ["", "", ""];

  for (const line of lines) {
    const trimmed = line.trim();
    for (let i = 0; i < sectionHeaders.length; i++) {
      if (trimmed.includes(sectionHeaders[i].key) && (trimmed.includes("上游") || trimmed.includes("中游") || trimmed.includes("下游"))) {
        // 检查是否真的是段落标题（包含材料/制造/应用或类似关键词，或只有标题没有股票）
        if (trimmed.length < 20 || !trimmed.match(/[\u4e00-\u9fa5]{2,6}[（(]\s*\d{4}/)) {
          currentSection = i;
          break;
        }
      }
    }
    if (currentSection >= 0 && currentSection < 3) {
      // 跳过标题行本身
      if (!trimmed.includes(sectionHeaders[currentSection].key) || trimmed.length < 15) {
        sectionTexts[currentSection] += "\n" + trimmed;
      }
    }
  }

  // 如果段落切分成功（至少两段有股票），用段落方式
  const segments = sectionHeaders.map((header, i) => {
    const stocks = sectionTexts[i] ? stocksFromText(sectionTexts[i]) : [];
    return { name: header.name, desc: header.desc, stocks: stocks.slice(0, 10) };
  });

  const totalBySections = segments.reduce((s, seg) => s + seg.stocks.length, 0);

  // 段落切分不理想时，回退：全文提取 + 关键词匹配
  if (totalBySections < 3) {
    const allStocks = stocksFromText(content);
    if (allStocks.length === 0) {
      return { name, source: "local", segments: [], warnings: ["未从文本中提取到任何A股股票"] };
    }

    // 按股票名称关键词分配到三段
    const segmentKeywords = [
      { keywords: ["材料", "设备", "原料", "矿产", "化工", "硅", "锂", "稀土", "靶材", "晶圆", "气体", "试剂", "新材", "半导体", "芯片", "元器件", "元件", "部件", "模组"] },
      { keywords: ["代工", "制造", "封测", "组装", "加工", "铸造", "冶炼", "封装", "测试", "PCB", "面板", "光伏", "绿能", "电池", "电芯", "电机", "集成", "系统"] },
      { keywords: ["应用", "终端", "整车", "车企", "汽车", "消费", "手机", "电脑", "服务器", "机器人", "无人机", "储能", "运营", "服务", "互联网", "平台", "AI", "智能", "数据", "软件", "方案", "车"] },
    ];

    const unassigned = [...allStocks];
    const fallbackSegments = segmentKeywords.map((rule) => {
      const stocks = [];
      for (let i = unassigned.length - 1; i >= 0; i--) {
        if (stocks.length >= 10) break;
        if (rule.keywords.some((kw) => unassigned[i].name.includes(kw))) {
          stocks.push(unassigned[i]);
          unassigned.splice(i, 1);
        }
      }
      stocks.reverse();
      return stocks;
    });

    if (unassigned.length > 0 && unassigned.length < allStocks.length) {
      warnings.push(`${unassigned.length} 只股票未能匹配产业链关键词: ${unassigned.map(s => s.name).join("、")}`);
    }

    return {
      name, source: "local",
      segments: sectionHeaders.map((h, i) => ({ name: h.name, desc: h.desc, stocks: fallbackSegments[i] })),
      warnings,
    };
  }

  return { name, source: "local", segments, warnings };
}

module.exports = { handleChainParse };
