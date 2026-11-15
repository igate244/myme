// src/domain/body.ts — 「からだ」（スマートバンドの日々の記録）のデータの形と変換
//
// バンド → ヘルスコネクト → 中継アプリ（android/）→ Firestore（users/{uid}/health/{日付}）→ ここ、の順で届く。
// 端末内の DB（IndexedDB）には入れない。Firestore が元データで、見るたびに読み直す。
// 画面や通信の部品に依存しない純粋な関数だけを置く（テストしやすいように）。

/** 眠りの段階の区切り。stage は 0=覚醒 1=レム 2=浅い 3=深い */
export type SleepSegment = { stage: 0 | 1 | 2 | 3; startMs: number; endMs: number };
/** 時刻つきの値（心拍・血中酸素など） */
export type SeriesPoint = { ms: number; value: number };

export type Workout = { type: number; startMs: number; endMs: number; distanceM: number | null };

export type BodyDay = {
  /** YYYY-MM-DD（睡眠は起きた日に入る） */
  date: string;
  steps: number | null;
  /** 睡眠中の心拍（平均・最低）回/分。最低は安静時心拍の目安 */
  hrSleepAvg: number | null;
  hrSleepMin: number | null;
  /** 総消費カロリー（基礎代謝＋活動）kcal */
  kcalTotal: number | null;
  /** 活動で使ったカロリー kcal */
  kcalActive: number | null;
  hrMin: number | null;
  hrAvg: number | null;
  hrMax: number | null;
  spo2Avg: number | null;
  spo2Min: number | null;
  sleepMin: number | null;
  deepMin: number | null;
  lightMin: number | null;
  remMin: number | null;
  awakeMin: number | null;
  sleepStartMs: number | null;
  sleepEndMs: number | null;
  /** 睡眠の段階の区切り（中継アプリ1.5〜。無ければ空） */
  sleepStages: SleepSegment[];
  /** 睡眠中の心拍（10分ごとの平均）と血中酸素 */
  hrSeries: SeriesPoint[];
  spo2Series: SeriesPoint[];
  workouts: Workout[];
  updatedAt: number | null;
};

/* ----------------------------------------------- Firestore（REST）の値の読み取り */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type FsValue = {
  stringValue?: string;
  integerValue?: string | number;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, FsValue> };
  arrayValue?: { values?: FsValue[] };
};

/** REST の {integerValue:"12"} のような形を普通の値にする */
export const decodeFsValue = (v: FsValue | undefined): unknown => {
  if (!v) return null;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue) return (v.arrayValue.values ?? []).map(decodeFsValue);
  if (v.mapValue) {
    const out: Record<string, unknown> = {};
    for (const [k, inner] of Object.entries(v.mapValue.fields ?? {})) out[k] = decodeFsValue(inner);
    return out;
  }
  return null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const parseWorkouts = (raw: unknown): Workout[] => {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: Workout[] = [];
    for (const w of arr as any[]) {
      const startMs = num(w?.s);
      const endMs = num(w?.e);
      if (startMs === null || endMs === null) continue;
      out.push({ type: num(w?.t) ?? 0, startMs, endMs, distanceM: num(w?.d) });
    }
    return out.sort((a, b) => a.startMs - b.startMs);
  } catch {
    return [];
  }
};

/** 中継アプリが送る眠りの段階：JSON の [{g,s,e},…]（g=0〜3、s/e=ミリ秒）。壊れた要素は飛ばす */
export const parseSleepStages = (raw: unknown): SleepSegment[] => {
  if (typeof raw !== "string" || raw === "") return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out: SleepSegment[] = [];
    for (const x of arr as any[]) {
      const g = num(x?.g);
      const startMs = num(x?.s);
      const endMs = num(x?.e);
      if (g === null || startMs === null || endMs === null || ![0, 1, 2, 3].includes(g) || endMs <= startMs) continue;
      out.push({ stage: g as 0 | 1 | 2 | 3, startMs, endMs });
    }
    return out.sort((a, b) => a.startMs - b.startMs);
  } catch {
    return [];
  }
};

/** 「ミリ秒,値;ミリ秒,値;…」の並び（心拍・血中酸素）を読む。壊れた行は飛ばす */
export const parseSeries = (raw: unknown): SeriesPoint[] => {
  if (typeof raw !== "string" || raw === "") return [];
  const out: SeriesPoint[] = [];
  for (const part of raw.split(";")) {
    const [m, v] = part.split(",").map(Number);
    if (Number.isFinite(m) && Number.isFinite(v)) out.push({ ms: m, value: v });
  }
  return out.sort((a, b) => a.ms - b.ms);
};

/** 普通の値になったドキュメント（SDK の data()）を BodyDay にする。欠けている項目は null */
export const normalizeBodyDayPlain = (id: string, f: Record<string, unknown> | undefined): BodyDay => {
  const d = f ?? {};
  return {
    date: id,
    steps: num(d.steps),
    hrSleepAvg: num(d.hrSleepAvg),
    hrSleepMin: num(d.hrSleepMin),
    kcalTotal: num(d.kcalTotal),
    kcalActive: num(d.kcalActive),
    hrMin: num(d.hrMin),
    hrAvg: num(d.hrAvg),
    hrMax: num(d.hrMax),
    spo2Avg: num(d.spo2Avg),
    spo2Min: num(d.spo2Min),
    sleepMin: num(d.sleepMin),
    deepMin: num(d.deepMin),
    lightMin: num(d.lightMin),
    remMin: num(d.remMin),
    awakeMin: num(d.awakeMin),
    sleepStartMs: num(d.sleepStartMs),
    sleepEndMs: num(d.sleepEndMs),
    sleepStages: parseSleepStages(d.stages),
    hrSeries: parseSeries(d.hrSeries),
    spo2Series: parseSeries(d.spo2Series),
    workouts: parseWorkouts(d.workouts),
    updatedAt: num(d.updatedAt),
  };
};

/** Firestore のドキュメント（id = 日付、fields = REST の形）を BodyDay にする */
export const normalizeBodyDay = (id: string, fields: Record<string, FsValue> | undefined): BodyDay => {
  const f: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields ?? {})) f[k] = decodeFsValue(v);
  return normalizeBodyDayPlain(id, f);
};

/* ------------------------------------------------------ 部屋の温湿度（SwitchBot） */

/** 中継アプリが users/{uid}/room/{日付} の文字列 s に貯める「分,気温,湿度;分,気温,湿度;…」（分＝エポックからの分） */
export type RoomSample = { ms: number; temp: number; hum: number };

export const parseRoomSamples = (raw: unknown): RoomSample[] => {
  if (typeof raw !== "string" || raw === "") return [];
  const out: RoomSample[] = [];
  for (const part of raw.split(";")) {
    const [m, t, h] = part.split(",").map(Number);
    if (Number.isFinite(m) && Number.isFinite(t) && Number.isFinite(h)) out.push({ ms: m * 60000, temp: t, hum: h });
  }
  return out.sort((a, b) => a.ms - b.ms);
};

/** SwitchBot アプリの履歴の書き出し（CSV）を読む。日時は端末の時刻（日本）として扱う。列は見出しの名前で探す */
export const parseSwitchBotCsv = (text: string): RoomSample[] => {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const head = lines[0].split(",").map((h) => h.trim());
  const iDate = head.findIndex((h) => /^date/i.test(h));
  const iTemp = head.findIndex((h) => /^temperature/i.test(h));
  const iHum = head.findIndex((h) => /humidity/i.test(h) && !/^abs/i.test(h) && /^relative|^humidity/i.test(h));
  if (iDate < 0 || iTemp < 0 || iHum < 0) return [];
  const out: RoomSample[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})/.exec((c[iDate] ?? "").trim());
    const temp = Number(c[iTemp]);
    const hum = Number(c[iHum]);
    if (!m || !Number.isFinite(temp) || !Number.isFinite(hum) || c[iTemp].trim() === "" || c[iHum].trim() === "") continue;
    const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime();
    out.push({ ms, temp, hum });
  }
  return out.sort((a, b) => a.ms - b.ms);
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

/** 記録を日付（端末の時刻）ごとの文字列に分ける。形は parseRoomSamples が読むものと同じ */
export const groupRoomByDate = (samples: RoomSample[]): Record<string, string> => {
  const parts: Record<string, string[]> = {};
  for (const x of samples) {
    const d = new Date(x.ms);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    (parts[key] ??= []).push(`${Math.round(x.ms / 60000)},${x.temp.toFixed(1)},${Math.round(x.hum)}`);
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parts)) out[k] = v.join(";");
  return out;
};

/** 2つの文字列を、同じ分の記録は1つにして合わせる（先にある方を残す） */
export const mergeRoomStrings = (a: string, b: string): string => {
  const seen = new Map<number, RoomSample>();
  for (const x of [...parseRoomSamples(b), ...parseRoomSamples(a)]) seen.set(Math.round(x.ms / 60000), x);
  return [...seen.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([m, x]) => `${m},${x.temp.toFixed(1)},${Math.round(x.hum)}`)
    .join(";");
};

export type RoomSummary = { tempAvg: number; tempMin: number; tempMax: number; humAvg: number; count: number };

/** startMs〜endMs の間の記録をまとめる。1件も無ければ null */
export const summarizeRoom = (samples: RoomSample[], startMs: number, endMs: number): RoomSummary | null => {
  const inside = samples.filter((x) => x.ms >= startMs && x.ms <= endMs);
  if (inside.length === 0) return null;
  const temps = inside.map((x) => x.temp);
  return {
    tempAvg: temps.reduce((a, b) => a + b, 0) / temps.length,
    tempMin: Math.min(...temps),
    tempMax: Math.max(...temps),
    humAvg: inside.reduce((a, x) => a + x.hum, 0) / inside.length,
    count: inside.length,
  };
};

/* ------------------------------------------------------ その日の調子（3段階） */

/** 1〜3 の調子。自分で付ける記録なので、中継アプリの上書きに巻き込まれないよう別のコレクション（bodyRatings）に置く */
export const RATING_LABELS: Record<number, string> = { 1: "いまいち", 2: "ふつう", 3: "いい" };

/** 1〜3 の整数だけ通す。それ以外は null */
export const normalizeRating = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 3 ? v : null;

/** 5段階だった頃の記録（scale が無い）を3段階にする：1・2→1、3→2、4・5→3 */
export const migrateOldRating = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? (v <= 2 ? 1 : v === 3 ? 2 : 3) : null;

/* ------------------------------------------------------------ 月のカレンダー */

/** 睡眠が足りているかの基準（分）。7時間 */
export const SLEEP_TARGET_MIN = 420;

/** 睡眠の判定：足りてる / 足りない / 記録なし */
export type SleepJudge = "enough" | "short" | "none";
export const judgeSleep = (sleepMin: number | null): SleepJudge =>
  sleepMin === null ? "none" : sleepMin >= SLEEP_TARGET_MIN ? "enough" : "short";

/** 月カレンダーの1マス。date が null のマスは前後の月の空き */
export type MonthCell = { date: string | null; day: number | null };

/** month は 1〜12。日曜はじまりで、週ごとの配列にする（最後の週は空きで埋める） */
export const buildMonthGrid = (year: number, month: number): MonthCell[][] => {
  const first = new Date(year, month - 1, 1).getDay();
  const last = new Date(year, month, 0).getDate();
  const cells: MonthCell[] = [];
  for (let i = 0; i < first; i++) cells.push({ date: null, day: null });
  for (let d = 1; d <= last; d++) cells.push({ date: `${year}-${pad2(month)}-${pad2(d)}`, day: d });
  while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
  const weeks: MonthCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
};

export type MonthSummary = { enough: number; short: number; none: number; avgSleepMin: number | null; ratingCounts: Record<1 | 2 | 3, number> };

/** その月の集計。today より後の日は「記録なし」に数えない（まだ来てないだけ） */
export const summarizeMonth = (
  weeks: MonthCell[][],
  sleepOf: (date: string) => number | null,
  ratingOf: (date: string) => number | null,
  today: string,
): MonthSummary => {
  let enough = 0;
  let short = 0;
  let none = 0;
  let sum = 0;
  let n = 0;
  const ratingCounts: Record<1 | 2 | 3, number> = { 1: 0, 2: 0, 3: 0 };
  for (const c of weeks.flat()) {
    if (!c.date || c.date > today) continue;
    const m = sleepOf(c.date);
    const j = judgeSleep(m);
    if (j === "enough") enough++;
    else if (j === "short") short++;
    else none++;
    if (m !== null) {
      sum += m;
      n++;
    }
    const r = ratingOf(c.date);
    if (r === 1 || r === 2 || r === 3) ratingCounts[r]++;
  }
  return { enough, short, none, avgSleepMin: n === 0 ? null : sum / n, ratingCounts };
};

/* ------------------------------------------------------------ 分析（睡眠・調子・歩数の関係） */

/** 「2026-11-16」に n 日足す（引くときは負の数） */
export const shiftDate = (date: string, n: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
};

const meanOf = (xs: number[]): number | null => (xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length);

/** 調子の内訳（n = 調子が付いている日の数） */
export type RatingSplit = { n: number; counts: Record<1 | 2 | 3, number> };

/** 睡眠が足りた日／足りない日で、その日の調子がどう分かれるか。睡眠か調子の記録が無い日は数えない */
export const sleepVsRating = (days: BodyDay[], ratingOf: (date: string) => number | null): { enough: RatingSplit; short: RatingSplit } => {
  const make = (): RatingSplit => ({ n: 0, counts: { 1: 0, 2: 0, 3: 0 } });
  const out = { enough: make(), short: make() };
  for (const d of days) {
    const j = judgeSleep(d.sleepMin);
    const r = ratingOf(d.date);
    if (j === "none" || (r !== 1 && r !== 2 && r !== 3)) continue;
    const g = j === "enough" ? out.enough : out.short;
    g.n++;
    g.counts[r]++;
  }
  return out;
};

export type NightStats = { n: number; sleepAvg: number | null; deepPctAvg: number | null };

/** 歩いた日（steps が target 以上）／少なかった日の「その夜の睡眠」。睡眠は起きた日に入るので、翌日の記録を見る */
export const stepsVsNextNight = (days: BodyDay[], target: number): { active: NightStats; quiet: NightStats } => {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const acc = { active: { sleeps: [] as number[], deeps: [] as number[] }, quiet: { sleeps: [] as number[], deeps: [] as number[] } };
  for (const d of days) {
    if (d.steps === null) continue;
    const next = byDate.get(shiftDate(d.date, 1));
    if (!next || next.sleepMin === null || next.sleepMin <= 0) continue;
    const g = d.steps >= target ? acc.active : acc.quiet;
    g.sleeps.push(next.sleepMin);
    if (next.deepMin !== null) g.deeps.push((next.deepMin / next.sleepMin) * 100);
  }
  const stat = (g: { sleeps: number[]; deeps: number[] }): NightStats => ({ n: g.sleeps.length, sleepAvg: meanOf(g.sleeps), deepPctAvg: meanOf(g.deeps) });
  return { active: stat(acc.active), quiet: stat(acc.quiet) };
};

/** today までの windowDays 日で、7時間に足りなかった分の合計（分）。記録のある日だけ数える */
export const sleepDebt = (days: BodyDay[], today: string, windowDays: number): { debtMin: number; recorded: number } => {
  const from = shiftDate(today, -(windowDays - 1));
  let debtMin = 0;
  let recorded = 0;
  for (const d of days) {
    if (d.date < from || d.date > today || d.sleepMin === null) continue;
    recorded++;
    debtMin += Math.max(0, SLEEP_TARGET_MIN - d.sleepMin);
  }
  return { debtMin, recorded };
};

/** 就寝時刻。min は正午からの分（22:00=600、0:00=720、翌2:00=840）。夜をまたいでも並べられるように */
export type Bedtime = { date: string; min: number };

/** 寝た時刻（sleepStartMs）が18:00〜翌12:00の日だけ。昼寝や、途中から記録された日は除く */
export const bedtimesOf = (days: BodyDay[]): Bedtime[] => {
  const out: Bedtime[] = [];
  for (const d of days) {
    if (d.sleepStartMs === null) continue;
    const t = new Date(d.sleepStartMs);
    let min = t.getHours() * 60 + t.getMinutes() - 720;
    if (min < 0) min += 1440;
    if (min < 360) continue;
    out.push({ date: d.date, min });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
};

/** 正午からの分 → 「23:40」 */
export const formatBedtime = (min: number): string => {
  const t = Math.round(min + 720) % 1440;
  return `${Math.floor(t / 60)}:${pad2(t % 60)}`;
};

/** 平均と、ばらつき（標準偏差・分）。2件未満は null */
export const bedtimeSpread = (list: Bedtime[]): { avg: number; sd: number } | null => {
  if (list.length < 2) return null;
  const avg = list.reduce((a, b) => a + b.min, 0) / list.length;
  const sd = Math.sqrt(list.reduce((a, b) => a + (b.min - avg) ** 2, 0) / list.length);
  return { avg, sd };
};

/** 7時間以上の連続日数。current は today（まだ記録が無ければ昨日）から遡った連続、longest は期間内の最長。記録の無い日は途切れ扱い */
export const sleepStreaks = (days: BodyDay[], today: string): { current: number; longest: number } => {
  if (days.length === 0) return { current: 0, longest: 0 };
  const byDate = new Map(days.map((d) => [d.date, d]));
  const ok = (date: string): boolean => judgeSleep(byDate.get(date)?.sleepMin ?? null) === "enough";
  const first = days.reduce((a, d) => (d.date < a ? d.date : a), days[0].date);
  let longest = 0;
  let run = 0;
  for (let date = first; date <= today; date = shiftDate(date, 1)) {
    run = ok(date) ? run + 1 : 0;
    if (run > longest) longest = run;
  }
  let current = 0;
  let date = byDate.get(today)?.sleepMin == null ? shiftDate(today, -1) : today;
  while (ok(date)) {
    current++;
    date = shiftDate(date, -1);
  }
  return { current, longest };
};

export type PeriodAvg = { sleepAvg: number | null; stepsAvg: number | null; ratingAvg: number | null; kcalActiveAvg: number | null };

/** today までの7日と、その前の7日の平均（記録のある日だけで平均する） */
export const weekCompare = (days: BodyDay[], ratingOf: (date: string) => number | null, today: string): { thisWeek: PeriodAvg; lastWeek: PeriodAvg } => {
  const avgBetween = (from: string, to: string): PeriodAvg => {
    const inside = days.filter((d) => d.date >= from && d.date <= to);
    const ratings = inside.map((d) => ratingOf(d.date)).filter((r): r is number => r !== null);
    return {
      sleepAvg: meanOf(inside.map((d) => d.sleepMin).filter((v): v is number => v !== null)),
      stepsAvg: meanOf(inside.map((d) => d.steps).filter((v): v is number => v !== null)),
      ratingAvg: meanOf(ratings),
      kcalActiveAvg: meanOf(inside.map((d) => d.kcalActive).filter((v): v is number => v !== null)),
    };
  };
  return { thisWeek: avgBetween(shiftDate(today, -6), today), lastWeek: avgBetween(shiftDate(today, -13), shiftDate(today, -7)) };
};

/* ------------------------------------------------------------ 分析（カロリー） */

/** 中央値（空なら null） */
export const medianOf = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 === 1 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export type KcalSummary = { n: number; activeAvg: number | null; totalAvg: number | null; activeShare: number | null };

/** 活動カロリー・総消費の平均と、「総消費のうち活動が占める割合（%）」。割合は両方ある日だけで出す */
export const kcalSummary = (days: BodyDay[]): KcalSummary => {
  const active = days.map((d) => d.kcalActive).filter((v): v is number => v !== null);
  const total = days.map((d) => d.kcalTotal).filter((v): v is number => v !== null);
  const both = days.filter((d) => d.kcalActive !== null && d.kcalTotal !== null && d.kcalTotal > 0);
  const share = both.length === 0 ? null : (both.reduce((a, d) => a + (d.kcalActive as number), 0) / both.reduce((a, d) => a + (d.kcalTotal as number), 0)) * 100;
  return { n: active.length, activeAvg: meanOf(active), totalAvg: meanOf(total), activeShare: share };
};

/** 曜日ごと（0=日〜6=土）の活動カロリーの平均。記録が無い曜日は avg が null */
export const kcalByWeekday = (days: BodyDay[]): { avg: number | null; n: number }[] => {
  const buckets: number[][] = [[], [], [], [], [], [], []];
  for (const d of days) {
    if (d.kcalActive === null) continue;
    const [y, m, dd] = d.date.split("-").map(Number);
    buckets[new Date(y, m - 1, dd).getDay()].push(d.kcalActive);
  }
  return buckets.map((b) => ({ avg: meanOf(b), n: b.length }));
};

/** 日のグループの集計：日数・活動カロリーの平均・その夜（翌朝の記録）の睡眠・その日の調子の内訳 */
export type DayGroupStats = { n: number; kcalAvg: number | null; nextSleepAvg: number | null; nextSleepN: number; rating: RatingSplit };

const groupStats = (list: BodyDay[], byDate: Map<string, BodyDay>, ratingOf: (date: string) => number | null): DayGroupStats => {
  const rating: RatingSplit = { n: 0, counts: { 1: 0, 2: 0, 3: 0 } };
  const sleeps: number[] = [];
  for (const d of list) {
    const next = byDate.get(shiftDate(d.date, 1));
    if (next && next.sleepMin !== null && next.sleepMin > 0) sleeps.push(next.sleepMin);
    const r = ratingOf(d.date);
    if (r === 1 || r === 2 || r === 3) {
      rating.n++;
      rating.counts[r]++;
    }
  }
  return {
    n: list.length,
    kcalAvg: meanOf(list.map((d) => d.kcalActive).filter((v): v is number => v !== null)),
    nextSleepAvg: meanOf(sleeps),
    nextSleepN: sleeps.length,
    rating,
  };
};

/** 活動カロリーが多い日／少ない日（期間内の中央値で2つに分ける。中央値ちょうどは多い側） */
export const splitByKcal = (days: BodyDay[], ratingOf: (date: string) => number | null): { threshold: number | null; high: DayGroupStats; low: DayGroupStats } => {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const withK = days.filter((d) => d.kcalActive !== null);
  const threshold = medianOf(withK.map((d) => d.kcalActive as number));
  const high = threshold === null ? [] : withK.filter((d) => (d.kcalActive as number) >= threshold);
  const low = threshold === null ? [] : withK.filter((d) => (d.kcalActive as number) < threshold);
  return { threshold, high: groupStats(high, byDate, ratingOf), low: groupStats(low, byDate, ratingOf) };
};

/** 運動（ワークアウト）をした日／しなかった日。歩数かカロリーの記録がある日だけを対象にする */
export const splitByWorkout = (days: BodyDay[], ratingOf: (date: string) => number | null): { withWorkout: DayGroupStats; without: DayGroupStats } => {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const recorded = days.filter((d) => d.steps !== null || d.kcalActive !== null);
  return {
    withWorkout: groupStats(recorded.filter((d) => d.workouts.length > 0), byDate, ratingOf),
    without: groupStats(recorded.filter((d) => d.workouts.length === 0), byDate, ratingOf),
  };
};

/* ------------------------------------------------------------ 表示用の整形 */

/** 分 → 「7:32」「0:45」（時:分） */
export const formatMinutes = (min: number | null): string => {
  if (min === null) return "—";
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};

/** 時刻（ミリ秒）→ 「22:34」（端末の時刻） */
export const formatClock = (ms: number | null): string => {
  if (ms === null) return "—";
  const d = new Date(ms);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** 「2026-11-14」→「11/14（土）」 */
export const formatDayLabel = (date: string): string => {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return date;
  const week = ["日", "月", "火", "水", "木", "金", "土"][new Date(y, m - 1, d).getDay()];
  return `${m}/${d}（${week}）`;
};

const WORKOUT_NAMES: Record<number, string> = { 56: "ランニング", 79: "ウォーキング", 8: "サイクリング", 37: "ハイキング" };

/** ヘルスコネクトの運動の種類番号 → 名前（知らない種類は「運動」） */
export const workoutName = (type: number): string => WORKOUT_NAMES[type] ?? "運動";

/* -------------------------------------------------------- ペアリング用コード */

/**
 * 中継アプリに貼る連携コード。uid と、この端末のログインの更新用トークンを base64url にしたもの。
 * 人に見せない（自分のアカウントで Firestore に書ける鍵になる）。
 */
export const encodePairingCode = (uid: string, refreshToken: string): string =>
  btoa(JSON.stringify({ v: 1, u: uid, r: refreshToken }))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
