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
  const q = mod.query(mod.collection(db, "users", uid, "health"), mod.orderBy(mod.documentId(), "desc"), mod.limit(days));
  const snap = await mod.getDocs(q);
  const result: BodyDay[] = snap.docs.map((d: any) => normalizeBodyDayPlain(d.id, d.data()));
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
