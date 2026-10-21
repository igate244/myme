// src/components/HomeMenu.tsx — ホーム画面
//
// 2026年10月の一新で落ち着いた見た目に。タイルの並びはオーナーの好みで残している。
// 人物名鑑（→人間図鑑アプリ）とカウンター（→KEEP）は独立アプリに移したので並べていない。
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLifeStore } from "../domain/LifeStoreContext";
import type { StrategyItem } from "../domain/models";
import { useDriveSync } from "../hooks/useDriveSync";
import type { SectionView } from "../views";
import { FIELD_LABELS, isTruth, isUnfound, pickOfTheDay, truthLead, truthText } from "./strategy/common";
import {
  outerStyle,
  contentMaxWidth,
  SURFACE,
  LINE,
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_SUB,
  ACCENT,
  OK_COLOR,
  WARN_COLOR,
  SECTION_COLORS,
} from "./uiStyles";

type Props = {
  onSelect: (view: SectionView) => void;
};

type MenuItem = { view: SectionView; title: string; desc: string; icon: string; wide?: boolean };

// 2列のタイル。並びは旧 MYME のホームに合わせている
const MENU_ITEMS: MenuItem[] = [
  { view: "lifeLog", title: "ライフログ", desc: "人生の出来事", icon: "📖" },
  { view: "growth", title: "子どもの記録", desc: "成長の記録", icon: "🌱" },
  { view: "bucketList", title: "やりたいこと", desc: "いつかやること", icon: "🚩" },
  { view: "strategy", title: "真理図鑑", desc: "人生で見つけた真理", icon: "📜" },
  { view: "quotes", title: "名言", desc: "刺さった言葉", icon: "💬" },
  { view: "legacy", title: "遺すもの", desc: "手紙・思い出", icon: "✉️" },
  { view: "profile", title: "自分", desc: "プロフィール・設定", icon: "👤", wide: true },
];

const formatToday = (): string => {
  const d = new Date();
  const week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${week}）`;
};

/** 最後のバックアップを「○分前」「今日 21:05」「4日前」で */
const formatAgo = (ms: number): string => {
  const diff = Date.now() - ms;
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.round(diff / 60000))}分前`;
  const d = new Date(ms);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return `今日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${Math.max(1, Math.round(diff / 86400000))}日前`;
};

const HomeMenu: React.FC<Props> = ({ onSelect }) => {
  const { user } = useAuth();
  const store = useLifeStore();
  const drive = useDriveSync();
  const [items, setItems] = useState<StrategyItem[]>([]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void store
      .getStrategies(user.uid)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((e: unknown) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [user, store]);

  // 今日の一枚：中身のある真理から、日付ごとに同じ1つを選ぶ
  const todays = useMemo(() => pickOfTheDay(items.filter((i) => isTruth(i) && !isUnfound(i)).sort((a, b) => a.id.localeCompare(b.id))), [items]);
  const todaysField = todays?.field ? FIELD_LABELS[todays.field] : null;

  // 一度連携したのに今つながっていない＝自動バックアップが止まっている
  const stopped = drive.configured && !drive.signedIn && (drive.linked || drive.lastBackupAt !== null);

  return (
    <div style={{ ...outerStyle, paddingBottom: "calc(32px + env(safe-area-inset-bottom))" }}>
      <div style={{ width: "100%", maxWidth: contentMaxWidth, padding: "calc(28px + env(safe-area-inset-top)) 20px 8px" }}>
        <div style={{ fontSize: "0.8rem", color: TEXT_MUTED }}>{formatToday()}</div>
        <h1 style={{ margin: "2px 0 0", fontSize: "1.7rem", fontWeight: 800, letterSpacing: "0.08em", color: TEXT_MAIN }}>
          MYME
        </h1>
      </div>

      <div style={{ width: "100%", maxWidth: contentMaxWidth, padding: "0 16px" }}>
        {stopped && (
          <button
            type="button"
            onClick={() => void drive.connect()}
            disabled={drive.busy}
            style={{
              width: "100%",
              marginTop: 12,
              display: "flex",
              alignItems: "center",
              gap: 10,
              textAlign: "left",
              padding: "12px 14px",
              background: `${WARN_COLOR}14`,
              border: `1px solid ${WARN_COLOR}88`,
              borderRadius: 12,
              color: TEXT_MAIN,
            }}
          >
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: "0.92rem", color: WARN_COLOR }}>バックアップが止まってる</span>
              <span style={{ display: "block", fontSize: "0.76rem", color: TEXT_SUB, marginTop: 2 }}>
                {drive.lastBackupAt ? `最後の保存：${formatAgo(drive.lastBackupAt)}` : "アプリを開き直すと連携が切れます"}
              </span>
            </span>
            <span style={{ flexShrink: 0, fontSize: "0.85rem", fontWeight: 700, color: WARN_COLOR }}>{drive.busy ? "再開中…" : "再開する ›"}</span>
          </button>
        )}

        {todays && (
          <button
            type="button"
            onClick={() => onSelect("strategy")}
            style={{
              width: "100%",
              marginTop: 16,
              textAlign: "left",
              padding: "14px 16px 16px",
              background: SURFACE,
              border: `1px solid ${LINE}`,
              borderLeft: `3px solid ${todaysField?.color ?? SECTION_COLORS.strategy}`,
              borderRadius: 14,
              color: TEXT_MAIN,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", color: TEXT_MUTED, marginBottom: 6 }}>
              今日の真理
              {todaysField && <span style={{ color: todaysField.color }}>{todaysField.label}</span>}
            </span>
            {truthLead(todays) && <span style={{ display: "block", fontSize: "0.82rem", color: TEXT_MUTED }}>{truthLead(todays)}</span>}
            <span style={{ display: "block", fontSize: "1.08rem", fontWeight: 700, lineHeight: 1.6 }}>{truthText(todays)}</span>
          </button>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10, marginTop: 16 }}>
          {MENU_ITEMS.map((item) => {
            const color = SECTION_COLORS[item.view as keyof typeof SECTION_COLORS];
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => onSelect(item.view)}
                style={{
                  position: "relative",
                  gridColumn: item.wide ? "1 / -1" : undefined,
                  minHeight: item.wide ? 72 : 108,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "14px 14px 12px",
                  background: SURFACE,
                  border: `1px solid ${LINE}`,
                  borderRadius: 14,
                  textAlign: "left",
                  color: TEXT_MAIN,
                  overflow: "hidden",
                }}
              >
                <span style={{ position: "absolute", left: 0, top: 0, right: 0, height: 3, background: color, opacity: 0.8 }} />
                <span style={{ fontSize: "1.6rem", lineHeight: 1 }}>{item.icon}</span>
                <span style={{ minWidth: 0, width: "100%" }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: "1rem" }}>{item.title}</span>
                  <span style={{ display: "block", fontSize: "0.74rem", color: TEXT_MUTED, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.desc}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {drive.configured && (
          <section style={{ marginTop: 28 }}>
            <div style={{ fontSize: "0.75rem", color: TEXT_MUTED, fontWeight: 600, margin: "0 4px 8px" }}>バックアップ</div>
            <div
              style={{
                background: SURFACE,
                border: `1px solid ${LINE}`,
                borderRadius: 14,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: drive.signedIn ? OK_COLOR : stopped ? WARN_COLOR : TEXT_MUTED,
                  flexShrink: 0,
                }}
              />
              <span style={{ flex: 1, minWidth: 0, fontSize: "0.88rem", color: TEXT_SUB }}>
                {!drive.ready ? "準備中…" : drive.signedIn ? "Googleドライブに自動で保存中" : stopped ? "止まってる" : "Googleドライブ未連携"}
                {drive.lastBackupAt && (
                  <span style={{ display: "block", fontSize: "0.74rem", color: TEXT_MUTED }}>最後の保存：{formatAgo(drive.lastBackupAt)}</span>
                )}
              </span>
              {drive.ready && !drive.signedIn && (
                <button
                  type="button"
                  onClick={() => void drive.connect()}
                  disabled={drive.busy}
                  style={{ border: `1px solid ${ACCENT}`, color: ACCENT, background: "transparent", borderRadius: 8, padding: "6px 12px", fontSize: "0.82rem", fontWeight: 600 }}
                >
                  {stopped ? "再開する" : "連携する"}
                </button>
              )}
              {drive.ready && drive.signedIn && (
                <button
                  type="button"
                  onClick={() => void drive.backupNow({ label: "Manual" })}
                  disabled={drive.busy}
                  style={{ border: `1px solid ${LINE}`, color: TEXT_SUB, background: "transparent", borderRadius: 8, padding: "6px 12px", fontSize: "0.82rem" }}
                >
                  {drive.busy ? "保存中…" : "今すぐ保存"}
                </button>
              )}
            </div>
            {drive.message && (
              <p style={{ fontSize: "0.8rem", color: TEXT_MUTED, margin: "8px 4px 0" }}>{drive.message}</p>
            )}
          </section>
        )}

        <p style={{ textAlign: "center", fontSize: "0.7rem", color: "#55544f", marginTop: 32 }}>ビルド {__BUILD_TIME__}</p>
      </div>
    </div>
  );
};

export default HomeMenu;
