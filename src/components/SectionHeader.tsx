// src/components/SectionHeader.tsx
//
// 各セクションの上部にある「戻る / タイトル / 右側のボタン」の並びは
// 全画面でほぼ同じ形だったため、1 つの部品にまとめた。

import React from "react";
import {
  fixedHeaderStyle,
  contentMaxWidth,
  sectionTitleStyle,
  backButtonStyle,
} from "./uiStyles";

type Props = {
  title: string;
  onBack: () => void;
  /** 戻るボタンの文字（既定は ホーム） */
  backLabel?: string;
  /** タイトル左の小さな目印の色 */
  accentColor?: string;
  /** 右端に置く要素（追加ボタンなど）。無い場合は左右の重心を保つ余白が入る */
  action?: React.ReactNode;
  /** タイトル行の下に置く検索・絞り込みなど */
  children?: React.ReactNode;
};

const SectionHeader: React.FC<Props> = ({
  title,
  onBack,
  backLabel = "ホーム",
  accentColor,
  action,
  children,
}) => (
  <div style={fixedHeaderStyle}>
    <div
      style={{
        width: "100%",
        maxWidth: contentMaxWidth,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: children ? 12 : 0,
      }}
    >
      <button type="button" style={backButtonStyle} onClick={onBack}>
        <span style={{ fontSize: "1.5rem", lineHeight: 1, marginTop: -2 }}>‹</span>{backLabel}
      </button>

      <h2
        style={{
          ...sectionTitleStyle,
          fontSize: "1.1rem",
          margin: 0,
          whiteSpace: "nowrap",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {accentColor && <span style={{ width: 8, height: 8, borderRadius: 999, background: accentColor }} />}
        {title}
      </h2>

      {action ?? <div style={{ width: 64 }} />}
    </div>

    {children && (
      <div style={{ width: "100%", maxWidth: contentMaxWidth, display: "flex", flexDirection: "column", gap: 8 }}>
        {children}
      </div>
    )}
  </div>
);

export default SectionHeader;
