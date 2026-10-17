// src/auth/AuthContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { loadAuth } from "../infrastructure/firebaseClient";

/** 画面側で使うのは uid と表示名だけ */
export type User = { uid: string; displayName: string | null; email: string | null };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  error: null,
  login: async () => {},
  logout: async () => {},
});

export const useAuth = (): AuthContextValue => useContext(AuthContext);

/* eslint-disable @typescript-eslint/no-explicit-any */
const toUser = (u: any): User | null =>
  u ? { uid: String(u.uid), displayName: u.displayName ?? null, email: u.email ?? null } : null;

/** ホーム画面から起動したアプリ（PWA）として動いているか */
const isStandalone = (): boolean =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // 画面確認用：手元の開発サーバー（localhost）で ?demo を付けたときだけログインを省く
    if (location.hostname === "localhost" && new URLSearchParams(location.search).has("demo")) {
      setUser({ uid: "demo", displayName: "デモ", email: null });
      setLoading(false);
      return;
    }
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    loadAuth()
      .then(({ auth, mod }) => {
        if (cancelled) return;
        // リダイレクトでログインして戻ってきた場合の結果を受け取る
        mod.getRedirectResult(auth).catch((redirectError: unknown) => {
          console.error("ログインに失敗しました", redirectError);
          setError("ログインに失敗しました。もう一度お試しください。");
        });
        unsubscribe = mod.onAuthStateChanged(auth, (current: any) => {
          setUser(toUser(current));
          setLoading(false);
        });
      })
      .catch((loadError: unknown) => {
        console.error("ログイン部品の読み込みに失敗しました", loadError);
        setError("ログイン部品を読み込めませんでした。電波の良い場所で開き直してください。");
        setLoading(false);
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // 画面側で使う値。中身が変わらない限り同じ参照を返して余計な再描画を防ぐ。
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      error,
      login: async () => {
        try {
          setError(null);
          const { auth, mod } = await loadAuth();
          const provider = new mod.GoogleAuthProvider();
          try {
            await mod.signInWithPopup(auth, provider);
          } catch (popupError: any) {
            // インストールしたアプリではポップアップが塞がれることがあるので、リダイレクトでやり直す
            const code = String(popupError?.code ?? "");
            if (code.includes("popup-blocked") || code.includes("operation-not-supported") || isStandalone()) {
              if (code.includes("popup-closed-by-user") || code.includes("cancelled-popup-request")) throw popupError;
              await mod.signInWithRedirect(auth, provider);
              return;
            }
            throw popupError;
          }
        } catch (loginError) {
          console.error("ログインに失敗しました", loginError);
          setError("ログインに失敗しました。もう一度お試しください。");
        }
      },
      logout: async () => {
        try {
          const { auth, mod } = await loadAuth();
          await mod.signOut(auth);
        } catch (logoutError) {
          console.error("ログアウトに失敗しました", logoutError);
          setError("ログアウトに失敗しました。");
        }
      },
    }),
    [user, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
