// src/components/strategy/QuoteEditor.tsx — 名言の追加と編集（下から出るシート）
import React, { useState } from "react";
import { categoryFromKind, type StrategyItem, type StrategyItemInput } from "../../domain/models";
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
  TEXT_SUB,
  WARN_COLOR,
} from "../uiStyles";
import { todayString } from "./common";

type Props = {
  item: StrategyItem | null;
  saving: boolean;
  onSave: (input: StrategyItemInput) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const QuoteEditor: React.FC<Props> = ({ item, saving, onSave, onDelete, onClose }) => {
  const [title, setTitle] = useState(item?.title ?? "");
  const [source, setSource] = useState(item?.source ?? "");
  const [detail, setDetail] = useState(item?.detail ?? "");
  const [pinned, setPinned] = useState(item?.pinned ?? false);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!title.trim()) return;
    onSave({
      kind: "quote",
      category: item?.kind === "quote" ? item.category : categoryFromKind("quote"),
      title: title.trim(),
      source: source.trim() || undefined,
      detail: detail.trim() || undefined,
      pinned,
      // 画面から外した項目も、消さずにそのまま持ち回す
      emotions: item?.emotions ?? [],
      notes: item?.notes ?? [],
      field: item?.field,
      origin: item?.origin,
      foundDate: item?.foundDate || todayString(),
      lifeLogId: item?.lifeLogId,
      verdict: item?.verdict ?? "none",
      strength: item?.strength ?? 2,
    });
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={sectionTitleStyle}>{item ? "名言を編集" : "名言を追加"}</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>言葉</label>
            <textarea
              style={{ ...textareaStyle, minHeight: 64, fontWeight: 600 }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：勝ちに不思議の勝ちあり"
              required
            />
          </div>
          <div>
            <label style={labelStyle}>誰の言葉</label>
            <input style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)} placeholder="例：野村克也" />
          </div>
          <div>
            <label style={labelStyle}>作品・場面・メモ</label>
            <textarea style={{ ...textareaStyle, minHeight: 56 }} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="例：マクロスF 3話" />
          </div>
          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            style={{ ...secondaryButtonStyle, color: pinned ? WARN_COLOR : TEXT_SUB, borderColor: pinned ? WARN_COLOR : undefined }}
          >
            {pinned ? "★ お気に入り" : "☆ お気に入りにする"}
          </button>
          <div style={{ display: "flex", gap: 8 }}>
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

export default QuoteEditor;
