// src/components/strategy/ItemEditor.tsx — 教訓・定義・名言の追加と編集（下から出るシート）
import React, { useState } from "react";
import {
  categoryFromKind,
  type Emotion,
  type StrategyItem,
  type StrategyItemInput,
  type StrategyKind,
  type StrategyNote,
} from "../../domain/models";
import { newId } from "../../utils/id";
import {
  modalOverlayStyle,
  modalContentStyle,
  sectionTitleStyle,
  labelStyle,
  inputStyle,
  textareaStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  DANGER_COLOR,
  LINE,
  TEXT_MUTED,
  TEXT_SUB,
  WARN_COLOR,
} from "../uiStyles";
import { EmotionPicker, KIND_LABELS, todayString } from "./common";

type Props = {
  kind: StrategyKind;
  item: StrategyItem | null;
  emotions: Emotion[];
  saving: boolean;
  onSave: (input: StrategyItemInput) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const TEXT: Record<StrategyKind, { title: string; titlePh: string; detail: string; detailPh: string }> = {
  lesson: {
    title: "一言で",
    titlePh: "例：酒を飲むと人生クオリティ下がる",
    detail: "なぜ（きっかけ・失敗した話）",
    detailPh: "あとで読み返して効くように、その時の気持ちごと",
  },
  definition: {
    title: "言葉",
    titlePh: "例：仕事",
    detail: "自分なりの定義",
    detailPh: "今の自分ならどう言う？",
  },
  quote: {
    title: "言葉",
    titlePh: "例：勝ちに不思議の勝ちあり",
    detail: "作品・場面・メモ",
    detailPh: "例：マクロスF 3話",
  },
};

const ItemEditor: React.FC<Props> = ({ kind, item, emotions, saving, onSave, onDelete, onClose }) => {
  const t = TEXT[kind];
  const [title, setTitle] = useState(item?.title ?? "");
  const [detail, setDetail] = useState(item?.detail ?? "");
  const [source, setSource] = useState(item?.source ?? "");
  const [selected, setSelected] = useState<string[]>(item?.emotions ?? []);
  const [pinned, setPinned] = useState(item?.pinned ?? false);
  const [notes, setNotes] = useState<StrategyNote[]>(item?.notes ?? []);
  const [noteDraft, setNoteDraft] = useState("");

  const addNote = (): void => {
    const text = noteDraft.trim();
    if (!text) return;
    setNotes((prev) => [{ id: newId(), date: todayString(), text }, ...prev]);
    setNoteDraft("");
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!title.trim()) return;
    // 入力途中の振り返りメモも取りこぼさない
    const pending = noteDraft.trim();
    const allNotes = pending ? [{ id: newId(), date: todayString(), text: pending }, ...notes] : notes;
    onSave({
      kind,
      category: item && item.kind === kind ? item.category : categoryFromKind(kind),
      title: title.trim(),
      detail: detail.trim() || undefined,
      source: kind === "quote" ? source.trim() || undefined : item?.source,
      emotions: selected,
      pinned,
      notes: allNotes,
      verdict: item?.verdict ?? "none",
      strength: item?.strength ?? 2,
    });
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={sectionTitleStyle}>{item ? `${KIND_LABELS[kind]}を編集` : `${KIND_LABELS[kind]}を追加`}</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>{t.title}</label>
            <textarea
              style={{ ...textareaStyle, minHeight: 56, fontWeight: 600 }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.titlePh}
              required
            />
          </div>

          {kind === "quote" && (
            <div>
              <label style={labelStyle}>誰の言葉</label>
              <input style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)} placeholder="例：野村克也" />
            </div>
          )}

          <div>
            <label style={labelStyle}>{t.detail}</label>
            <textarea
              style={{ ...textareaStyle, minHeight: kind === "quote" ? 56 : 96 }}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder={t.detailPh}
            />
          </div>

          <div>
            <label style={labelStyle}>どんな気持ちのときに読みたい？</label>
            <EmotionPicker emotions={emotions} value={selected} onChange={setSelected} />
          </div>

          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            style={{
              ...secondaryButtonStyle,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              color: pinned ? WARN_COLOR : TEXT_SUB,
              borderColor: pinned ? WARN_COLOR : undefined,
            }}
          >
            {pinned ? "★ ピン留め中（最初に出る）" : "☆ ピン留めする"}
          </button>

          {kind === "lesson" && (
            <div>
              <label style={labelStyle}>振り返りメモ（また破った・効いた など）</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  placeholder="今日の一言"
                />
                <button type="button" onClick={addNote} style={{ ...secondaryButtonStyle, flexShrink: 0 }}>
                  足す
                </button>
              </div>
              {notes.length > 0 && (
                <div style={{ marginTop: 10, borderTop: `1px solid ${LINE}` }}>
                  {notes.map((note) => (
                    <div key={note.id} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
                      <span style={{ fontSize: "0.75rem", color: TEXT_MUTED, flexShrink: 0, marginTop: 2 }}>{note.date.slice(5).replace("-", "/")}</span>
                      <span style={{ flex: 1, fontSize: "0.9rem", lineHeight: 1.6 }}>{note.text}</span>
                      <button
                        type="button"
                        onClick={() => setNotes((prev) => prev.filter((n) => n.id !== note.id))}
                        style={{ background: "transparent", border: "none", color: TEXT_MUTED, fontSize: "0.8rem", flexShrink: 0 }}
                        aria-label="メモを消す"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="submit" disabled={saving} style={{ ...primaryButtonStyle, flex: 2 }}>
              {saving ? "保存中…" : "保存"}
            </button>
            <button type="button" onClick={onClose} style={{ ...secondaryButtonStyle, flex: 1 }}>
              閉じる
            </button>
          </div>
          {onDelete && (
            <button type="button" onClick={onDelete} style={{ ...secondaryButtonStyle, color: DANGER_COLOR, borderColor: `${DANGER_COLOR}66` }}>
              削除
            </button>
          )}
        </form>
      </div>
    </div>
  );
};

export default ItemEditor;
