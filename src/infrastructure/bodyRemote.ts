// src/infrastructure/bodyRemote.ts — 「からだ」のデータを Firestore から読む
//
// Firestore の SDK は gstatic から、「からだ」を開いたときだけ読み込む。
// 取れたものは localStorage に控えて、オフラインでも前回の分を見られるようにする。

import { encodePairingCode, groupRoomByDate, mergeRoomStrings, migrateOldRating, normalizeBodyDayPlain, normalizeRating } from "../domain/body";
import type { RoomSample } from "../domain/body";
import type { BodyDay } from "../domain/body";
import { loadAuth, loadFirestore } from "./firebaseClient";

const CACHE_KEY = "myme.bodyDays";

/* eslint-disable @typescript-eslint/no-explicit-any */
const currentUserOf = async (uid: string): Promise<any> => {
  const { auth } = await loadAuth();
  const current = auth.currentUser;
  if (!current || current.uid !== uid) throw new Error("ログインが確認できません");
  return current;
};

/** 前回取れた分（なければ空） */
export const loadCachedBodyDays = (): BodyDay[] => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    // 古い控え（カロリー項目が無かった頃）でも落ちないよう、欠けた項目は null で埋める
    return Array.isArray(parsed) ? (parsed as BodyDay[]).map((d) => ({ ...d, kcalTotal: d.kcalTotal ?? null, kcalActive: d.kcalActive ?? null, hrSleepAvg: d.hrSleepAvg ?? null, hrSleepMin: d.hrSleepMin ?? null, sleepStages: d.sleepStages ?? [], hrSeries: d.hrSeries ?? [], spo2Series: d.spo2Series ?? [] })) : [];
  } catch {
    return [];
  }
};

/** 控えに残すのは新しい側の日数だけ（localStorage の容量を食いつぶさないため）。Firestore 側には全部残っている */
const CACHE_DAYS = 120;

/** 今日から days 日前までの分を取る。取れたら控えも更新する（Firestore の記録自体は消えずにずっと残る） */
export const fetchBodyDays = async (uid: string, days = 90): Promise<BodyDay[]> => {
  await currentUserOf(uid); // ログインの確認（Firestore のルールもこのログインで判定される）
  const { db, mod } = await loadFirestore();
  // 並べ替え（新しい順）を Firestore に頼むと専用の索引が要るので、
  // 日付の範囲だけ絞って取り、並べ替えは自分でやる（1日1件なので数もわずか）
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceId = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
  const q = mod.query(mod.collection(db, "users", uid, "health"), mod.where(mod.documentId(), ">=", sinceId));
  const snap = await mod.getDocs(q);
  const result: BodyDay[] = snap.docs
    .map((d: any) => normalizeBodyDayPlain(d.id, d.data()))
    .sort((a: BodyDay, b: BodyDay) => (a.date < b.date ? 1 : -1));
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(result.slice(0, CACHE_DAYS)));
  } catch {
    /* 控えられなくても表示には困らない */
  }
  return result;
};

/** 中継アプリに貼る連携コードをつくる */
export const makePairingCode = async (uid: string): Promise<string> => {
  const user = await currentUserOf(uid);
  if (!user.refreshToken) throw new Error("連携コードを作れませんでした。ログインし直してください");
  return encodePairingCode(uid, String(user.refreshToken));
};

/* ------------------------------------------------ その日の調子（users/{uid}/bodyRatings/{日付}） */

// 3段階にした時に控えの名前も変えた（5段階の値が混ざらないように）
const RATING_CACHE_KEY = "myme.bodyRatings3";

export type RatingMap = Record<string, number>;

export const loadCachedRatings = (): RatingMap => {
  try {
    const raw = localStorage.getItem(RATING_CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as RatingMap) : {};
  } catch {
    return {};
  }
};

const cacheRatings = (map: RatingMap): void => {
  try {
    localStorage.setItem(RATING_CACHE_KEY, JSON.stringify(map));
  } catch {
    /* 控えられなくても困らない */
  }
};

/** 付けた調子を全部読む（1日1件なので数はわずか） */
export const fetchRatings = async (uid: string): Promise<RatingMap> => {
  await currentUserOf(uid);
  const { db, mod } = await loadFirestore();
  const snap = await mod.getDocs(mod.collection(db, "users", uid, "bodyRatings"));
  const map: RatingMap = {};
  snap.docs.forEach((d: any) => {
    const data = d.data();
    // scale: 3 が付いていれば3段階。付いていない古い記録は5段階なので変換する
    const r = data?.scale === 3 ? normalizeRating(data?.rating) : migrateOldRating(data?.rating);
    if (r !== null) map[d.id] = r;
  });
  cacheRatings(map);
  return map;
};

/** その日の調子を保存する。null で消す */
export const saveRating = async (uid: string, date: string, rating: number | null): Promise<void> => {
  await currentUserOf(uid);
  const { db, mod } = await loadFirestore();
  const ref = mod.doc(db, "users", uid, "bodyRatings", date);
  if (rating === null) await mod.deleteDoc(ref);
  else await mod.setDoc(ref, { rating, scale: 3, updatedAt: Date.now() });
};

/** 控えの調子を 1 日分だけ書き換える（保存の成功を待たず画面に出すため） */
export const cacheRating = (map: RatingMap, date: string, rating: number | null): RatingMap => {
  const next = { ...map };
  if (rating === null) delete next[date];
  else next[date] = rating;
  cacheRatings(next);
  return next;
};

/* ------------------------------------------------ 部屋の温湿度（users/{uid}/room/{日付}、中継アプリが書く） */

const ROOM_CACHE_KEY = "myme.roomDays";
/** 日付 → 貯めた文字列（形は domain/body.ts の parseRoomSamples を見る） */
export type RoomDocs = Record<string, string>;

export const loadCachedRoomDocs = (): RoomDocs => {
  try {
    const raw = localStorage.getItem(ROOM_CACHE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as RoomDocs) : {};
  } catch {
    return {};
  }
};

/** 今日から days 日前（夜をまたぐ分として＋1日）まで。控えには新しい側の120日だけ残す */
export const fetchRoomDocs = async (uid: string, days: number): Promise<RoomDocs> => {
  await currentUserOf(uid);
  const { db, mod } = await loadFirestore();
  const since = new Date();
  since.setDate(since.getDate() - days - 1);
  const sinceId = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, "0")}-${String(since.getDate()).padStart(2, "0")}`;
  const snap = await mod.getDocs(mod.query(mod.collection(db, "users", uid, "room"), mod.where(mod.documentId(), ">=", sinceId)));
  const docs: RoomDocs = {};
  snap.docs.forEach((d: any) => {
    const v = d.data()?.s;
    if (typeof v === "string") docs[d.id] = v;
  });
  try {
    const keep = Object.keys(docs).sort().slice(-CACHE_DAYS);
    const cut: RoomDocs = {};
    keep.forEach((k) => (cut[k] = docs[k]));
    localStorage.setItem(ROOM_CACHE_KEY, JSON.stringify(cut));
  } catch {
    /* 控えられなくても困らない */
  }
  return docs;
};

/** SwitchBot の履歴（CSV）から読んだ記録を、日ごとに合わせて保存する。もうある分とは同じ分を1つにして合わせるので、何度入れても増えない。入れた日数を返す */
export const importRoomSamples = async (uid: string, samples: RoomSample[]): Promise<number> => {
  await currentUserOf(uid);
  const { db, mod } = await loadFirestore();
  const grouped = groupRoomByDate(samples);
  const existing = await mod.getDocs(mod.collection(db, "users", uid, "room"));
  const have: RoomDocs = {};
  existing.docs.forEach((d: any) => {
    if (typeof d.data()?.s === "string") have[d.id] = d.data().s;
  });
  const dates = Object.keys(grouped);
  for (let i = 0; i < dates.length; i += 400) {
    const batch = mod.writeBatch(db);
    for (const date of dates.slice(i, i + 400)) {
      const s = have[date] ? mergeRoomStrings(have[date], grouped[date]) : grouped[date];
      batch.set(mod.doc(db, "users", uid, "room", date), { s, updatedAt: Date.now() }, { merge: true });
    }
    await batch.commit();
  }
  return dates.length;
};
