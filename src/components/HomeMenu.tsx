// src/components/HomeMenu.tsx — ホーム画面
//
// 2026年10月の一新で、ゲーム風のタイル（冒険の記録・クエスト…）から落ち着いた一覧に変えた。
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

type MenuItem = { view: SectionView; title: string; desc: string };

const GROUPS: Array<{ label: string; items: MenuItem[] }> = [
  {
    label: "記録する",
    items: [
      { view: "lifeLog", title: "ライフログ", desc: "人生の出来事・転機" },
      { view: "growth", title: "子どもの記録", desc: "成長・できるようになったこと" },
    ],
  },
  {
    label: "考える",
    items: [
      { view: "bucketList", title: "やりたいこと", desc: "いつかやること・進めていること" },
      { view: "strategy", title: "指針", desc: "考え方・学び・決めごと" },
    ],
  },
  {
    label: "残す",
    items: [
      { view: "legacy", title: "遺すもの", desc: "手紙・思い出・伝えたいこと" },
      { view: "profile", title: "自分", desc: "プロフィール・自己分析・設定" },
    ],
  },
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
        {GROUPS.map((group) => (
          <section key={group.label} style={{ marginTop: 20 }}>
            <div style={{ fontSize: "0.75rem", color: TEXT_MUTED, fontWeight: 600, margin: "0 4px 8px" }}>{group.label}</div>
            <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
              {group.items.map((item, index) => (
                <button
                  key={item.view}
                  type="button"
                  onClick={() => onSelect(item.view)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "15px 16px",
                    background: "transparent",
                    border: "none",
                    borderTop: index === 0 ? "none" : `1px solid ${LINE}`,
                    textAlign: "left",
                    color: TEXT_MAIN,
                  }}
                >
                  <span
                    style={{ width: 10, height: 10, borderRadius: 999, background: SECTION_COLORS[item.view as keyof typeof SECTION_COLORS], flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 600, fontSize: "1rem" }}>{item.title}</span>
                    <span style={{ display: "block", fontSize: "0.78rem", color: TEXT_MUTED, marginTop: 1 }}>{item.desc}</span>
                  </span>
                  <span style={{ color: TEXT_MUTED, fontSize: "1.3rem", lineHeight: 1 }}>›</span>
                </button>
              ))}
            </div>
          </section>
        ))}

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
