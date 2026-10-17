// src/components/strategy/common.tsx — 指針・名言で共通に使う部品
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLifeStore } from "../../domain/LifeStoreContext";
import { DEFAULT_EMOTIONS, type Emotion, type StrategyItem, type StrategyKind } from "../../domain/models";
import { ACCENT, LINE_2, SURFACE_2, TEXT_MUTED, TEXT_SUB, WARN_COLOR } from "../uiStyles";

export const KIND_LABELS: Record<StrategyKind, string> = {
  lesson: "教訓",
  definition: "定義",
  quote: "名言",
};

/** 旧「採用／不採用」は、教訓では「やってよかった／やめた」として見せる */
export const verdictLabel = (verdict: StrategyItem["verdict"]): string =>
  verdict === "adopted" ? "やってよかった" : verdict === "rejected" ? "やめた" : "";

export const HARD_COLOR = "#d39bb8";
export const GOOD_COLOR = "#8fc4a1";

/** 決まっている気持ち＋自分で足した気持ち */
export const useEmotions = () => {
  const store = useLifeStore();
  const [custom, setCustom] = useState<Emotion[]>([]);

  const reload = useCallback(async () => {
    try {
      setCustom(await store.getCustomEmotions());
    } catch (loadError) {
      console.error("気持ちの設定の読み込みに失敗しました", loadError);
    }
  }, [store]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const all = useMemo(() => [...DEFAULT_EMOTIONS, ...custom], [custom]);
  const labelOf = useCallback((id: string) => all.find((e) => e.id === id)?.label ?? id, [all]);

  const saveCustom = useCallback(
    async (next: Emotion[]) => {
      await store.saveCustomEmotions(next);
      setCustom(next);
    },
    [store],
  );

  return { all, custom, labelOf, saveCustom };
};

export const emotionColor = (emotion: Emotion | undefined): string => (emotion?.group === "good" ? GOOD_COLOR : HARD_COLOR);

/** 小さな気持ちの札 */
export const EmotionTag: React.FC<{ emotion?: Emotion; label: string }> = ({ emotion, label }) => {
  const color = emotionColor(emotion);
  return (
    <span
      style={{
        fontSize: "0.7rem",
        color,
        border: `1px solid ${color}55`,
        borderRadius: 999,
        padding: "1px 8px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
};

/** 一覧の1行（教訓・定義・名言で共通） */
export const ItemRow: React.FC<{
  item: StrategyItem;
  emotions: Emotion[];
  onClick: () => void;
}> = ({ item, emotions, onClick }) => {
  const empty = item.kind === "definition" && !item.detail;
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        display: "block",
        padding: "12px 14px",
        background: "transparent",
        border: "none",
        borderTop: `1px solid ${LINE_2}55`,
        color: "inherit",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        {item.pinned && <span style={{ color: WARN_COLOR, fontSize: "0.8rem", marginTop: 2 }}>★</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, lineHeight: 1.45 }}>
            {item.kind === "quote" ? `「${item.title}」` : item.title}
            {item.kind === "lesson" && item.verdict !== "none" && (
              <span style={{ fontSize: "0.72rem", fontWeight: 500, color: TEXT_MUTED, marginLeft: 8 }}>{verdictLabel(item.verdict)}</span>
            )}
          </div>
          {empty ? (
            <div style={{ fontSize: "0.78rem", color: TEXT_MUTED, marginTop: 2 }}>まだ書いてない</div>
          ) : (
            (item.detail || item.source) && (
              <div
                style={{
                  fontSize: "0.78rem",
                  color: TEXT_MUTED,
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.kind === "quote" ? [item.source, item.detail].filter(Boolean).join("　") : item.detail}
              </div>
            )
          )}
          {item.emotions.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
              {item.emotions.map((id) => {
                const e = emotions.find((x) => x.id === id);
                return <EmotionTag key={id} emotion={e} label={e?.label ?? id} />;
              })}
            </div>
          )}
        </div>
        {item.kind === "lesson" && item.notes.length > 0 && (
          <span style={{ fontSize: "0.7rem", color: TEXT_SUB, background: SURFACE_2, borderRadius: 999, padding: "1px 7px" }}>
            メモ{item.notes.length}
          </span>
        )}
      </div>
    </button>
  );
};

/** 気持ちを複数選ぶチップ */
export const EmotionPicker: React.FC<{
  emotions: Emotion[];
  value: string[];
  onChange: (next: string[]) => void;
}> = ({ emotions, value, onChange }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    {(["hard", "good"] as const).map((group) => (
      <div key={group} style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {emotions
          .filter((e) => e.group === group)
          .map((e) => {
            const active = value.includes(e.id);
            const color = emotionColor(e);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onChange(active ? value.filter((v) => v !== e.id) : [...value, e.id])}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  fontSize: "0.82rem",
                  border: `1px solid ${active ? color : LINE_2}`,
                  background: active ? `${color}22` : "transparent",
                  color: active ? color : TEXT_MUTED,
                  fontWeight: active ? 700 : 500,
                }}
              >
                {e.label}
              </button>
            );
          })}
      </div>
    ))}
  </div>
);

export const shuffle = <T,>(list: T[]): T[] => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export const todayString = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const accentLink: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: ACCENT,
  fontSize: "0.85rem",
  padding: "6px 0",
};
