// src/components/strategy/TruthDetail.tsx — 真理を1つ開いたところ（読む用）。「また実感した」をここで足す
import React, { useState } from "react";
import type { LifeLog, StrategyItem } from "../../domain/models";
import {
  modalOverlayStyle,
  modalContentStyle,
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  LINE,
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_SUB,
  ACCENT,
} from "../uiStyles";
import { FIELD_LABELS, ORIGIN_LABELS, certainty, formatDate, formatNo, truthLead, truthText } from "./common";

type Props = {
  item: StrategyItem;
  no?: number;
  lifeLog?: LifeLog;
  saving: boolean;
  onReconfirm: (text: string) => Promise<boolean>;
  onRemoveReconfirm: (noteId: string) => void;
  onEdit: () => void;
  onClose: () => void;
};

const TruthDetail: React.FC<Props> = ({ item, no, lifeLog, saving, onReconfirm, onRemoveReconfirm, onEdit, onClose }) => {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const field = item.field ? FIELD_LABELS[item.field] : null;
  const count = certainty(item);
  const lead = truthLead(item);

  const submit = async (): Promise<void> => {
    if (await onReconfirm(text.trim())) {
      setText("");
      setAdding(false);
    }
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={{ ...modalContentStyle, borderTop: `3px solid ${field?.color ?? ACCENT}` }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.78rem", color: TEXT_MUTED, marginBottom: 14 }}>
          <span style={{ letterSpacing: "0.06em" }}>{formatNo(no)}</span>
          {field && <span style={{ color: field.color }}>{field.label}</span>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onEdit} style={{ background: "transparent", border: "none", color: TEXT_SUB, fontSize: "0.85rem", padding: 4 }}>
            編集
          </button>
        </div>

        {lead && <div style={{ color: TEXT_MUTED, fontSize: "0.9rem", marginBottom: 4 }}>{lead}</div>}
        <div style={{ fontSize: "1.35rem", fontWeight: 700, lineHeight: 1.6, color: TEXT_MAIN, whiteSpace: "pre-wrap" }}>{truthText(item)}</div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "14px 0 4px" }}>
          {Array.from({ length: Math.min(count, 10) }, (_, i) => (
            <span key={i} style={{ width: 8, height: 8, borderRadius: 999, background: field?.color ?? ACCENT, opacity: 0.85 }} />
          ))}
          <span style={{ fontSize: "0.8rem", color: TEXT_SUB, marginLeft: 4 }}>{count === 1 ? "見つけたばかり" : `${count}回実感`}</span>
        </div>

        <div style={{ fontSize: "0.82rem", color: TEXT_MUTED, lineHeight: 1.8, marginTop: 10 }}>
          {item.foundDate && <div>見つけた日　{formatDate(item.foundDate)}</div>}
          {item.origin && (
            <div>
              出どころ　{ORIGIN_LABELS[item.origin]}
              {item.source ? `（${item.source}）` : ""}
            </div>
          )}
          {lifeLog && (
            <div>
              きっかけ　{formatDate(lifeLog.date)} {lifeLog.title}
            </div>
          )}
        </div>

        {item.kind !== "definition" && item.detail && (
          <div style={{ marginTop: 14, padding: "12px 14px", border: `1px solid ${LINE}`, borderRadius: 12, color: TEXT_SUB, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
            {item.detail}
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 600, color: TEXT_MUTED, marginBottom: 8 }}>また実感した</div>
          {adding ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input style={inputStyle} value={text} onChange={(e) => setText(e.target.value)} placeholder="どんな場面で？（一言、空でもOK）" autoFocus />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => void submit()} disabled={saving} style={{ ...primaryButtonStyle, flex: 2 }}>
                  残す
                </button>
                <button type="button" onClick={() => setAdding(false)} style={{ ...secondaryButtonStyle, flex: 1 }}>
                  やめる
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} style={{ ...secondaryButtonStyle, width: "100%", color: ACCENT, borderColor: `${ACCENT}88` }}>
              ＋ また実感した
            </button>
          )}
          {item.notes.length > 0 && (
            <div style={{ marginTop: 10 }}>
              {item.notes.map((note) => (
                <div key={note.id} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ fontSize: "0.75rem", color: TEXT_MUTED, flexShrink: 0, marginTop: 2 }}>{formatDate(note.date)}</span>
                  <span style={{ flex: 1, fontSize: "0.9rem", lineHeight: 1.6, color: note.text ? TEXT_MAIN : TEXT_MUTED }}>{note.text || "（ひとことなし）"}</span>
                  <button
                    type="button"
                    onClick={() => window.confirm("この記録を消しますか？") && onRemoveReconfirm(note.id)}
                    style={{ background: "transparent", border: "none", color: TEXT_MUTED, fontSize: "0.8rem", flexShrink: 0 }}
                    aria-label="消す"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button type="button" onClick={onClose} style={{ ...secondaryButtonStyle, width: "100%", marginTop: 20 }}>
          閉じる
        </button>
      </div>
    </div>
  );
};

export default TruthDetail;
