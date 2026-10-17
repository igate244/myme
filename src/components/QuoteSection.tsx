// src/components/QuoteSection.tsx — 名言
//
// 2026年10月に指針から分けた。データは指針と同じ表（kind = "quote"）に入っている。
// 指針の「気持ち」から開いたときは、名言も混ぜて出す。
import React, { useMemo, useState } from "react";
import type { StrategyItem } from "../domain/models";
import SectionHeader from "./SectionHeader";
import { useBackClose } from "../hooks/useBackClose";
import ItemEditor from "./strategy/ItemEditor";
import { useStrategyItems } from "./strategy/useStrategyItems";
import { EmotionTag, useEmotions } from "./strategy/common";
import {
  outerStyle,
  scrollAreaStyle,
  contentMaxWidth,
  addButtonStyle,
  inputStyle,
  chipStyle,
  chipRowStyle,
  errorTextStyle,
  emptyStateStyle,
  SURFACE,
  LINE,
  TEXT_MUTED,
  TEXT_SUB,
  WARN_COLOR,
  SECTION_COLORS,
} from "./uiStyles";

type Props = { onBack: () => void };

const QuoteSection: React.FC<Props> = ({ onBack }) => {
  const { items, loading, saving, error, save, remove } = useStrategyItems();
  const { all: emotions } = useEmotions();
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ item: StrategyItem | null } | null>(null);

  useBackClose(editing !== null, () => setEditing(null));

  const quotes = useMemo(() => items.filter((i) => i.kind === "quote"), [items]);

  // 2件以上ある人だけを絞り込みに出す（1件ずつの人まで並べるとチップが増えすぎる）
  const people = useMemo(() => {
    const count = new Map<string, number>();
    for (const q of quotes) if (q.source) count.set(q.source, (count.get(q.source) ?? 0) + 1);
    return [...count.entries()].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [quotes]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return quotes
      .filter((item) => !person || item.source === person)
      .filter((item) => !q || [item.title, item.source, item.detail].some((v) => v?.toLowerCase().includes(q)))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt));
  }, [quotes, query, person]);

  return (
    <div style={outerStyle}>
      <SectionHeader
        title="名言"
        onBack={onBack}
        accentColor={SECTION_COLORS.quotes}
        action={
          <button type="button" onClick={() => setEditing({ item: null })} style={addButtonStyle}>
            ＋ 追加
          </button>
        }
      >
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="言葉・人・作品で検索"
          style={{ ...inputStyle, padding: "9px 12px", fontSize: "0.9rem" }}
        />
        {people.length > 0 && (
          <div style={chipRowStyle}>
            <button type="button" onClick={() => setPerson(null)} style={chipStyle(person === null)}>
              すべて
            </button>
            {people.map((name) => (
              <button key={name} type="button" onClick={() => setPerson(person === name ? null : name)} style={chipStyle(person === name)}>
                {name}
              </button>
            ))}
          </div>
        )}
      </SectionHeader>

      <div style={scrollAreaStyle}>
        <div style={{ width: "100%", maxWidth: contentMaxWidth, paddingBottom: 48, display: "flex", flexDirection: "column", gap: 10 }}>
          {error && <p style={errorTextStyle}>{error}</p>}
          {loading ? (
            <p style={{ textAlign: "center", color: TEXT_MUTED, marginTop: 24 }}>読み込み中…</p>
          ) : shown.length === 0 ? (
            <p style={emptyStateStyle}>{quotes.length === 0 ? "まだ名言がありません。刺さった言葉を残しておこう。" : "見つかりませんでした。"}</p>
          ) : (
            shown.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEditing({ item })}
                style={{
                  textAlign: "left",
                  background: SURFACE,
                  border: `1px solid ${LINE}`,
                  borderRadius: 14,
                  padding: "16px 16px 14px",
                  color: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: "1.05rem", fontWeight: 600, lineHeight: 1.65 }}>
                  {item.pinned && <span style={{ color: WARN_COLOR, marginRight: 6, fontSize: "0.85rem" }}>★</span>}「{item.title}」
                </div>
                {(item.source || item.detail) && (
                  <div style={{ fontSize: "0.82rem", color: TEXT_SUB, textAlign: "right" }}>
                    — {[item.source, item.detail].filter(Boolean).join("　")}
                  </div>
                )}
                {item.emotions.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {item.emotions.map((id) => {
                      const e = emotions.find((x) => x.id === id);
                      return <EmotionTag key={id} emotion={e} label={e?.label ?? id} />;
                    })}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {editing && (
        <ItemEditor
          kind="quote"
          item={editing.item}
          emotions={emotions}
          saving={saving}
          onSave={(input) => void save(editing.item?.id ?? null, input).then((ok) => ok && setEditing(null))}
          onDelete={editing.item ? () => void remove(editing.item!.id).then((ok) => ok && setEditing(null)) : undefined}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

export default QuoteSection;
