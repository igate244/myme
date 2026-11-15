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

/* ------------------------------------------------------ その日の調子（5段階） */

/** 1〜5 の調子。自分で付ける記録なので、中継アプリの上書きに巻き込まれないよう別のコレクション（bodyRatings）に置く */
export const RATING_LABELS: Record<number, string> = { 1: "だめ", 2: "いまいち", 3: "ふつう", 4: "いい", 5: "最高" };

/** 1〜5 の整数だけ通す。それ以外は null */
export const normalizeRating = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;

/* ------------------------------------------------------------ 表示用の整形 */

/** 分 → 「7時間32分」「45分」 */
export const formatMinutes = (min: number | null): string => {
  if (min === null) return "—";
  const m = Math.round(min);
  if (m < 60) return `${m}分`;
  return `${Math.floor(m / 60)}時間${String(m % 60).padStart(2, "0")}分`;
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
