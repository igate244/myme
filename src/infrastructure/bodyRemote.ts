// src/infrastructure/bodyRemote.ts — 「からだ」のデータを Firestore から読む
//
// Firebase SDK の Firestore は読み込まず、REST で必要な分だけ取る（ログインの ID トークンを付ける）。
// 取れたものは localStorage に控えて、オフラインでも前回の分を見られるようにする。

import { FIREBASE_CONFIG } from "../config";
import { encodePairingCode, normalizeBodyDay } from "../domain/body";
import type { BodyDay, FsValue } from "../domain/body";
import { loadAuth } from "./firebaseClient";

const CACHE_KEY = "myme.bodyDays";
const BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;

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
  const user = await currentUserOf(uid);
  const token: string = await user.getIdToken();
  const res = await fetch(`${BASE}/users/${encodeURIComponent(uid)}:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "health" }],
        orderBy: [{ field: { fieldPath: "__name__" }, direction: "DESCENDING" }],
        limit: days,
      },
    }),
  });
  if (!res.ok) throw new Error(`読み込みに失敗しました（${res.status}）`);
  const rows: Array<{ document?: { name: string; fields?: Record<string, FsValue> } }> = await res.json();
  const result = rows
    .filter((row) => row.document)
    .map((row) => {
      const doc = row.document!;
      return normalizeBodyDay(doc.name.split("/").pop() ?? "", doc.fields);
    });
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
