// src/hooks/useDriveSync.ts
//
// Google ドライブ連携の状態と操作を 1 か所にまとめたフック。
// 以前はホーム・ステータス・自動バックアップの 3 箇所に、ほぼ同じ処理が
// それぞれ別の state を持って重複していて、片方で連携しても
// もう片方の表示が更新されないことがあった。

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLifeStore } from "../domain/LifeStoreContext";
import { driveService, DriveAuthError } from "../infrastructure/GoogleDriveService";
import { toFileTimestamp } from "../utils/dateUtils";

/** 直前にアップロードした内容。変化がなければ自動バックアップを送らないために使う。 */
let lastUploadedSignature: string | null = null;

export interface BackupOptions {
  /** ファイル名に入れる種別（例: Auto / Manual） */
  label?: string;
  /** 画面にメッセージを出さない（自動バックアップ用） */
  silent?: boolean;
  /** 前回と内容が同じならアップロードを省く */
  skipIfUnchanged?: boolean;
}

export interface DriveSync {
  /** VITE_GOOGLE_CLIENT_ID が設定されているか */
  configured: boolean;
  /** Google のスクリプト読み込みが終わったか */
  ready: boolean;
  signedIn: boolean;
  busy: boolean;
  message: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  backupNow: (options?: BackupOptions) => Promise<boolean>;
  restoreLatest: () => Promise<boolean>;
}

export const useDriveSync = (): DriveSync => {
  const { user } = useAuth();
  const store = useLifeStore();

  const [ready, setReady] = useState(driveService.isReady);
  const [signedIn, setSignedIn] = useState(driveService.isSignedIn);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const mountedRef = useRef(true);
  const messageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const sync = (): void => {
      if (!mountedRef.current) return;
      setReady(driveService.isReady);
      setSignedIn(driveService.isSignedIn);
    };

    const unsubscribe = driveService.subscribe(sync);
    if (driveService.isConfigured) {
      void driveService.init().then(sync).catch(() => {
        // 初期化に失敗しても「準備中」のまま表示するだけで、アプリ本体は動かせる
      });
    }
    sync();

    return () => {
      mountedRef.current = false;
      if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
      unsubscribe();
    };
  }, []);

  const notify = useCallback((text: string | null, autoClearMs = 4000) => {
    if (!mountedRef.current) return;
    setMessage(text);
    if (messageTimerRef.current) clearTimeout(messageTimerRef.current);
    if (text !== null && autoClearMs > 0) {
      messageTimerRef.current = setTimeout(() => {
        if (mountedRef.current) setMessage(null);
      }, autoClearMs);
    }
  }, []);

  const connect = useCallback(async () => {
    try {
      setBusy(true);
      await driveService.signIn();
      notify("Google と連携しました");
    } catch (error) {
      notify(error instanceof Error ? error.message : "連携を開始できませんでした");
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [notify]);

  const disconnect = useCallback(() => {
    driveService.signOut();
    lastUploadedSignature = null;
    notify("連携を解除しました");
  }, [notify]);

  const backupNow = useCallback(
    async (options: BackupOptions = {}): Promise<boolean> => {
      const { label = "Manual", silent = false, skipIfUnchanged = false } = options;
      if (!user) return false;

      try {
        if (!silent) {
          setBusy(true);
          notify("バックアップを作成中...", 0);
        }

        const data = await store.exportAllData(user.uid);
        const json = JSON.stringify(data, null, 2);

        if (skipIfUnchanged && json === lastUploadedSignature) {
          if (!silent) notify(null);
          return true;
        }

        await driveService.uploadBackup(`MYME_${label}Backup_${toFileTimestamp()}.json`, json);
        lastUploadedSignature = json;

        if (!silent) notify("バックアップ完了 ✅");
        return true;
      } catch (error) {
        if (error instanceof DriveAuthError) {
          notify("連携が切れました。もう一度連携してください。");
        } else if (!silent) {
          notify(error instanceof Error ? `バックアップ失敗: ${error.message}` : "バックアップに失敗しました");
        }
        return false;
      } finally {
        if (!silent && mountedRef.current) setBusy(false);
      }
    },
    [user, store, notify],
  );

  const restoreLatest = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      setBusy(true);
      notify("バックアップを探しています...", 0);

      const files = await driveService.listBackups();
      if (files.length === 0) {
        notify("バックアップが見つかりませんでした");
        return false;
      }

      const latest = files[0];
      const createdAt = new Date(latest.createdTime);
      const createdLabel = Number.isNaN(createdAt.getTime()) ? latest.createdTime : createdAt.toLocaleString();
      const confirmed = window.confirm(
        `最新のバックアップが見つかりました。\n\nファイル名: ${latest.name}\n作成日時: ${createdLabel}\n\n` +
          "現在この端末に入っているデータは、このバックアップの内容で置き換わります。よろしいですか？",
      );
      if (!confirmed) {
        notify("復元を中止しました");
        return false;
      }

      notify("ダウンロード中...", 0);
      const data = await driveService.downloadBackup(latest.id);

      notify("復元中...", 0);
      await store.importData(user.uid, data);

      notify("復元しました。読み込み直します...", 0);
      setTimeout(() => window.location.reload(), 1200);
      return true;
    } catch (error) {
      notify(error instanceof Error ? `復元失敗: ${error.message}` : "復元に失敗しました");
      return false;
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }, [user, store, notify]);

  return {
    configured: driveService.isConfigured,
    ready,
    signedIn,
    busy,
    message,
    connect,
    disconnect,
    backupNow,
    restoreLatest,
  };
};
