// src/components/AutoBackupManager.tsx
//
// 画面には出ず、裏で定期的に Google ドライブへバックアップする。
//
// 変更点:
//  * 連携状態とアップロード処理は useDriveSync に集約した
//  * 前回から中身が変わっていなければ送らない（同じ内容のファイルが増え続けていた）
//  * タブを離れるときにも保存する（15 分の区切りを待たずに残せる）

import React, { useEffect, useRef, useState } from "react";
import { useDriveSync } from "../hooks/useDriveSync";

const BACKUP_INTERVAL_MS = 15 * 60 * 1000;
/** タブを離れたときの保存は、この間隔を空けて実行する */
const MIN_HIDDEN_BACKUP_GAP_MS = 2 * 60 * 1000;

export const AutoBackupManager: React.FC = () => {
  const { signedIn, backupNow } = useDriveSync();
  const [notice, setNotice] = useState<string | null>(null);
  const lastBackupAtRef = useRef(0);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!signedIn) return;

    let disposed = false;

    const run = async (showNotice: boolean): Promise<void> => {
      // 前回の処理が終わる前に次が始まらないようにする
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const ok = await backupNow({ label: "Auto", silent: true, skipIfUnchanged: true });
        lastBackupAtRef.current = Date.now();
        if (ok && showNotice && !disposed) {
          setNotice("ドライブに自動で保存しました");
          setTimeout(() => {
            if (!disposed) setNotice(null);
          }, 4000);
        }
      } finally {
        runningRef.current = false;
      }
    };

    const intervalId = setInterval(() => void run(true), BACKUP_INTERVAL_MS);

    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== "hidden") return;
      if (Date.now() - lastBackupAtRef.current < MIN_HIDDEN_BACKUP_GAP_MS) return;
      void run(false);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      disposed = true;
      clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [signedIn, backupNow]);

  if (!notice) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        background: "#1f2024",
        color: "#8fc4a1",
        border: "1px solid #8fc4a1",
        padding: "12px 20px",
        borderRadius: 8,
        boxShadow: "none",
        fontSize: "0.9rem",
        fontWeight: 600,
        zIndex: 9999,
        animation: "fadeIn 0.3s ease-out",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      
      {notice}
    </div>
  );
};
