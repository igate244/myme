// src/infrastructure/firebaseClient.ts
//
// Firebase はログイン（Firebase Authentication）にだけ使う。データ本体は端末内の IndexedDB。
// ログインのユーザー ID が端末内データの持ち主のキーになっているので、
// Firebase プロジェクト（myme-c829c）は旧 MYME から変えないこと。
//
// SDK は npm に入れず gstatic から動的に読み込む（スマホだけでビルド・公開するための構成）。

import { FIREBASE_CONFIG, FIREBASE_SDK } from "../config";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type AuthSdk = { auth: any; mod: any };

let sdkPromise: Promise<AuthSdk> | null = null;

export const loadAuth = (): Promise<AuthSdk> => {
  if (!sdkPromise) {
    sdkPromise = (async () => {
      const appMod: any = await import(/* @vite-ignore */ `${FIREBASE_SDK}/firebase-app.js`);
      const mod: any = await import(/* @vite-ignore */ `${FIREBASE_SDK}/firebase-auth.js`);
      const app = appMod.getApps()[0] ?? appMod.initializeApp(FIREBASE_CONFIG);
      const auth = mod.getAuth(app);
      return { auth, mod };
    })();
    // 失敗したら次回やり直せるようにする（電波の弱い場所で開いたときなど）
    sdkPromise.catch(() => {
      sdkPromise = null;
    });
  }
  return sdkPromise;
};
