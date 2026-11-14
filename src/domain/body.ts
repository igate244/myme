// src/domain/body.ts — 「からだ」（スマートバンドの日々の記録）のデータの形と変換
//
// バンド → ヘルスコネクト → 中継アプリ（android/）→ Firestore（users/{uid}/health/{日付}）→ ここ、の順で届く。
// 端末内の DB（IndexedDB）には入れない。Firestore が元データで、見るたびに読み直す。
// 画面や通信の部品に依存しない純粋な関数だけを置く（テストしやすいように）。

export type Workout = { type: number; startMs: number; endMs: number; distanceM: number | null };

export type BodyDay = {
  /** YYYY-MM-DD（睡眠は起きた日に入る） */
  date: string;
  steps: number | null;
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

/** 普通の値になったドキュメント（SDK の data()）を BodyDay にする。欠けている項目は null */
export const normalizeBodyDayPlain = (id: string, f: Record<string, unknown> | undefined): BodyDay => {
  const d = f ?? {};
  return {
    date: id,
    steps: num(d.steps),
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
