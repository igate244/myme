// src/components/HomeMenu.tsx — ホーム画面
//
// 2026年10月の一新で落ち着いた見た目に。タイルの並びはオーナーの好みで残している。
// 人物名鑑（→人間図鑑アプリ）とカウンター（→KEEP）は独立アプリに移したので並べていない。
import React from "react";
import { useDriveSync } from "../hooks/useDriveSync";
import type { SectionView } from "../views";
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
  SECTION_COLORS,
} from "./uiStyles";

type Props = {
  onSelect: (view: SectionView) => void;
};

type MenuItem = { view: SectionView; title: string; desc: string; icon: string };

// 2列のタイル。並びは旧 MYME のホームに合わせている
const MENU_ITEMS: MenuItem[] = [
  { view: "lifeLog", title: "ライフログ", desc: "人生の出来事", icon: "📖" },
  { view: "growth", title: "子どもの記録", desc: "成長の記録", icon: "🌱" },
  { view: "bucketList", title: "やりたいこと", desc: "いつかやること", icon: "🚩" },
  { view: "strategy", title: "指針", desc: "考え方・学び", icon: "♟️" },
  { view: "legacy", title: "遺すもの", desc: "手紙・思い出", icon: "✉️" },
  { view: "profile", title: "自分", desc: "プロフィール・設定", icon: "👤" },
];

const formatToday = (): string => {
  const d = new Date();
  const week = ["日", "月", "火", "水", "木", "金", "土"][d.getDay()];
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${week}）`;
};

const HomeMenu: React.FC<Props> = ({ onSelect }) => {
  const drive = useDriveSync();

  return (
    <div style={{ ...outerStyle, paddingBottom: "calc(32px + env(safe-area-inset-bottom))" }}>
      <div style={{ width: "100%", maxWidth: contentMaxWidth, padding: "calc(28px + env(safe-area-inset-top)) 20px 8px" }}>
        <div style={{ fontSize: "0.8rem", color: TEXT_MUTED }}>{formatToday()}</div>
        <h1 style={{ margin: "2px 0 0", fontSize: "1.7rem", fontWeight: 800, letterSpacing: "0.08em", color: TEXT_MAIN }}>
          MYME
        </h1>
      </div>

      <div style={{ width: "100%", maxWidth: contentMaxWidth, padding: "0 16px" }}>
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
                  minHeight: 108,
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
                style={{ width: 8, height: 8, borderRadius: 999, background: drive.signedIn ? OK_COLOR : TEXT_MUTED, flexShrink: 0 }}
              />
              <span style={{ flex: 1, fontSize: "0.88rem", color: TEXT_SUB }}>
                {!drive.ready ? "準備中…" : drive.signedIn ? "Googleドライブに自動で保存中" : "Googleドライブ未連携"}
              </span>
              {drive.ready && !drive.signedIn && (
                <button
                  type="button"
                  onClick={() => void drive.connect()}
                  disabled={drive.busy}
                  style={{ border: `1px solid ${ACCENT}`, color: ACCENT, background: "transparent", borderRadius: 8, padding: "6px 12px", fontSize: "0.82rem", fontWeight: 600 }}
                >
                  連携する
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
