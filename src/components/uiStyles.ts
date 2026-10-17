// src/components/uiStyles.ts
//
// 見た目の共通部品。2026年10月に「落ち着いたデザイン」に一新した。
//   * グラデーション・光彩・すりガラスはやめて、平らな面と細い線で区切る
//   * 色は基本モノトーン。アクセント（ACCENT）は 1 色だけ、各セクションの色はくすませた色を差し色に使う
// export している名前は旧版と同じなので、画面側はこのファイルを差し替えるだけで新しい見た目になる。

import type { CSSProperties } from "react";

/* ---------------------------------------------------------------- 色 */

export const BG_COLOR = "#111214";
export const SURFACE = "#18191c";
export const SURFACE_2 = "#1f2024";
export const LINE = "#2a2b30";
export const LINE_2 = "#36373d";
export const TEXT_MAIN = "#e8e6e3";
export const TEXT_SUB = "#b9b7b3";
export const TEXT_MUTED = "#8b8a87";
export const ACCENT = "#a5b4fc";
export const ACCENT_STRONG = "#818cf8";
export const DANGER_COLOR = "#e5786d";
export const OK_COLOR = "#7fbf9a";
export const WARN_COLOR = "#d9b26f";

/** セクションごとの差し色（彩度を落とした色） */
export const SECTION_COLORS = {
  lifeLog: "#b4a0d8",
  growth: "#8fc4a1",
  bucketList: "#d9bd7a",
  strategy: "#8fb4d4",
  legacy: "#d1a0c4",
  profile: "#8cc5c0",
} as const;

export const FONT_SANS = '-apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP", "Segoe UI", sans-serif';

/* ------------------------------------------------------- レイアウト */

export const contentMaxWidth = 600;

export const outerStyle: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  background: BG_COLOR,
  color: TEXT_MAIN,
  fontFamily: FONT_SANS,
  padding: 0,
};

export const fixedHeaderStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  backgroundColor: "rgba(17, 18, 20, 0.96)",
  zIndex: 100,
  flexShrink: 0,
  borderBottom: `1px solid ${LINE}`,
  padding: "calc(10px + env(safe-area-inset-top)) 16px 10px",
  position: "sticky",
  top: 0,
};

export const scrollAreaStyle: CSSProperties = {
  width: "100%",
  flexGrow: 1,
  padding: "16px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
};

export const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: contentMaxWidth,
  background: SURFACE,
  border: `1px solid ${LINE}`,
  borderRadius: 14,
  padding: 16,
  marginBottom: 12,
  boxSizing: "border-box",
};

/* ----------------------------------------------------------- モーダル */

export const modalOverlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  backgroundColor: "rgba(0, 0, 0, 0.6)",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-end",
  zIndex: 1000,
  padding: 0,
  boxSizing: "border-box",
};

export const modalContentStyle: CSSProperties = {
  width: "100%",
  maxWidth: 560,
  maxHeight: "88dvh",
  overflowY: "auto",
  margin: 0,
  backgroundColor: SURFACE,
  border: `1px solid ${LINE}`,
  borderBottom: "none",
  borderRadius: "18px 18px 0 0",
  padding: "20px 16px calc(20px + env(safe-area-inset-bottom))",
  boxSizing: "border-box",
  color: TEXT_MAIN,
};

/* ------------------------------------------------------------- 文字 */

export const sectionTitleStyle: CSSProperties = {
  fontSize: "1.1rem",
  fontWeight: 700,
  margin: 0,
  color: TEXT_MAIN,
  letterSpacing: "0.02em",
};

export const labelStyle: CSSProperties = {
  display: "block",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: TEXT_MUTED,
  marginBottom: 6,
};

/* ----------------------------------------------------------- 入力欄 */

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 10,
  border: `1px solid ${LINE_2}`,
  backgroundColor: BG_COLOR,
  color: TEXT_MAIN,
  fontSize: "1rem",
  outline: "none",
  boxSizing: "border-box",
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  resize: "vertical",
  lineHeight: 1.7,
};

/* ----------------------------------------------------------- ボタン */

export const primaryButtonStyle: CSSProperties = {
  width: "100%",
  padding: "13px 18px",
  borderRadius: 10,
  border: "none",
  cursor: "pointer",
  background: ACCENT,
  color: "#14151a",
  fontWeight: 700,
  fontSize: "0.95rem",
};

export const secondaryButtonStyle: CSSProperties = {
  padding: "10px 14px",
  borderRadius: 10,
  border: `1px solid ${LINE_2}`,
  cursor: "pointer",
  background: "transparent",
  color: TEXT_SUB,
  fontWeight: 500,
  fontSize: "0.9rem",
};

export const backButtonStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  padding: "6px 8px 6px 2px",
  border: "none",
  background: "transparent",
  color: TEXT_SUB,
  fontSize: "0.95rem",
  cursor: "pointer",
};

export const tabButtonStyle: CSSProperties = {
  flex: 1,
  padding: "10px 0",
  background: "transparent",
  border: "none",
  borderBottom: "2px solid transparent",
  color: TEXT_MUTED,
  fontWeight: 600,
  cursor: "pointer",
};

export const menuButtonStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "14px 16px",
  borderRadius: 12,
  border: `1px solid ${LINE}`,
  background: SURFACE,
  color: TEXT_MAIN,
  cursor: "pointer",
  fontSize: "1rem",
  fontWeight: 600,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

/* ----------------------------------------------------- 共通パーツ */

/** 絞り込み用のチップ（丸いタグボタン） */
export const chipStyle = (active: boolean, color = ACCENT): CSSProperties => ({
  padding: "5px 12px",
  borderRadius: 999,
  fontSize: "0.78rem",
  whiteSpace: "nowrap",
  cursor: "pointer",
  border: active ? `1px solid ${color}` : `1px solid ${LINE_2}`,
  background: active ? `${color}1f` : "transparent",
  color: active ? color : TEXT_MUTED,
  fontWeight: active ? 700 : 500,
});

/** 絞り込みチップを横に並べる行 */
export const chipRowStyle: CSSProperties = {
  display: "flex",
  gap: 6,
  overflowX: "auto",
  paddingBottom: 2,
};

/** ヘッダー右側の「＋追加」ボタン */
export const addButtonStyle: CSSProperties = {
  ...primaryButtonStyle,
  width: "auto",
  padding: "7px 14px",
  fontSize: "0.88rem",
  minWidth: 64,
};

/** 背景も枠も持たないアイコンだけのボタン */
export const iconButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  fontSize: "1.1rem",
  cursor: "pointer",
  padding: 4,
  lineHeight: 1,
  color: TEXT_MUTED,
};

export const errorTextStyle: CSSProperties = {
  color: DANGER_COLOR,
  fontSize: "0.85rem",
  margin: "8px 0 0",
};

/** 「まだ記録がありません」等の案内 */
export const emptyStateStyle: CSSProperties = {
  textAlign: "center",
  color: TEXT_MUTED,
  marginTop: 32,
  padding: 20,
  border: `1px dashed ${LINE_2}`,
  borderRadius: 12,
  fontSize: "0.9rem",
  lineHeight: 1.8,
};

export const progressTrackStyle: CSSProperties = {
  width: "100%",
  height: 4,
  background: LINE,
  borderRadius: 2,
  overflow: "hidden",
};

export const progressFillStyle = (percent: number, color: string): CSSProperties => ({
  width: `${Math.max(0, Math.min(100, percent))}%`,
  height: "100%",
  background: color,
  borderRadius: 2,
  transition: "width 0.3s",
});
