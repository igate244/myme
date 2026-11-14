// src/infrastructure/bodyRemote.ts — 「からだ」のデータを Firestore から読む
//
// Firestore の SDK は gstatic から、「からだ」を開いたときだけ読み込む。
// 取れたものは localStorage に控えて、オフラインでも前回の分を見られるようにする。

import { encodePairingCode, normalizeBodyDayPlain } from "../domain/body";
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
    return Array.isArray(parsed) ? (parsed as BodyDay[]) : [];
  } catch {
    return [];
  }
};

/** 新しい日から days 日分を取る。取れたら控えも更新する */
export const fetchBodyDays = async (uid: string, days = 30): Promise<BodyDay[]> => {
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
    localStorage.setItem(CACHE_KEY, JSON.stringify(result));
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
