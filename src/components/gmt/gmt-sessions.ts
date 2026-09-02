/** 交易所时段计算（07 市场脉搏 / 08 全球指数 共用）— 仅按常规时段，节假日未核实 */

export type SessionStatus = "PRE" | "OPEN" | "LUNCH" | "CLOSED";

export interface Exchange {
  code: string;
  name: string;
  tz: string;
  /** 常规时段 [开, 收] 本地分钟，可有午休两段 */
  sessions: [number, number][];
  region: "CN" | "HK" | "JP" | "UK" | "US";
}

const m = (h: number, mm = 0) => h * 60 + mm;

export const EXCHANGES: Exchange[] = [
  { code: "SSE", name: "上交所", tz: "Asia/Shanghai", sessions: [[m(9, 30), m(11, 30)], [m(13), m(15)]], region: "CN" },
  { code: "HKEX", name: "港交所", tz: "Asia/Hong_Kong", sessions: [[m(9, 30), m(12)], [m(13), m(16)]], region: "HK" },
  { code: "TSE", name: "东证", tz: "Asia/Tokyo", sessions: [[m(9), m(11, 30)], [m(12, 30), m(15, 30)]], region: "JP" },
  { code: "LSE", name: "伦交所", tz: "Europe/London", sessions: [[m(8), m(16, 30)]], region: "UK" },
  { code: "NYSE", name: "纽交所", tz: "America/New_York", sessions: [[m(9, 30), m(16)]], region: "US" },
];

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function partsIn(tz: string, d: Date): { minutes: number; weekday: number; hh: string; mm: string } {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false, weekday: "short" });
    fmtCache.set(tz, f);
  }
  const parts = f.formatToParts(d);
  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
  return { minutes: (parseInt(hh, 10) % 24) * 60 + parseInt(mm, 10), weekday, hh: String(parseInt(hh, 10) % 24).padStart(2, "0"), mm };
}

export interface SessionInfo {
  status: SessionStatus;
  localTime: string;
  /** 距下一状态变化的分钟数 */
  nextIn: number;
  nextLabel: string;
}

export function sessionOf(ex: Exchange, now = new Date()): SessionInfo {
  const { minutes, weekday, hh, mm } = partsIn(ex.tz, now);
  const localTime = `${hh}:${mm}`;
  const weekend = weekday === 0 || weekday === 6;
  const first = ex.sessions[0][0];
  if (weekend) {
    const daysToMon = weekday === 6 ? 2 : 1;
    return { status: "CLOSED", localTime, nextIn: daysToMon * 1440 - minutes + first, nextLabel: "开盘" };
  }
  for (let i = 0; i < ex.sessions.length; i++) {
    const [o, c] = ex.sessions[i];
    if (minutes >= o && minutes < c) return { status: "OPEN", localTime, nextIn: c - minutes, nextLabel: i === ex.sessions.length - 1 ? "收盘" : "午休" };
    if (i < ex.sessions.length - 1 && minutes >= c && minutes < ex.sessions[i + 1][0])
      return { status: "LUNCH", localTime, nextIn: ex.sessions[i + 1][0] - minutes, nextLabel: "复盘" };
  }
  if (minutes < first) return { status: minutes >= first - 60 ? "PRE" : "CLOSED", localTime, nextIn: first - minutes, nextLabel: "开盘" };
  const daysToNext = weekday === 5 ? 3 : 1;
  return { status: "CLOSED", localTime, nextIn: daysToNext * 1440 - minutes + first, nextLabel: "开盘" };
}

export const STATUS_LABEL: Record<SessionStatus, string> = { PRE: "盘前", OPEN: "交易中", LUNCH: "午休", CLOSED: "已收盘" };

export function fmtCountdown(mins: number): string {
  if (mins >= 1440) return `${Math.floor(mins / 1440)}天${Math.floor((mins % 1440) / 60)}时`;
  if (mins >= 60) return `${Math.floor(mins / 60)}时${mins % 60}分`;
  return `${mins}分`;
}

/** 该交易所各时段换算成北京时间的 [开, 收] 分钟（用于时段甘特）；跨日以 0–1440 截断 */
export function sessionsInBeijing(ex: Exchange, now = new Date()): [number, number][] {
  const bj = partsIn("Asia/Shanghai", now).minutes;
  const loc = partsIn(ex.tz, now).minutes;
  let offset = bj - loc;
  if (offset > 720) offset -= 1440;
  if (offset < -720) offset += 1440;
  const out: [number, number][] = [];
  for (const [o, c] of ex.sessions) {
    let a = o + offset;
    let b = c + offset;
    if (b <= 0) {
      a += 1440;
      b += 1440;
    }
    if (a >= 1440) {
      a -= 1440;
      b -= 1440;
    }
    if (b > 1440) {
      out.push([a, 1440], [0, b - 1440]);
    } else out.push([Math.max(0, a), b]);
  }
  return out;
}
