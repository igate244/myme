// src/components/strategy/FieldSettings.tsx — 真理図鑑の分野を編集する（名前・色・並び・追加・削除）
//
// 消した分野は一覧から消えるだけで、真理に付いていた印（id）は残す。
// 同じ名前で足し直しても別物になるので、消すときは確認を出す。
import React, { useState } from "react";
import type { TruthField } from "../../domain/models";
import { newId } from "../../utils/id";
import {
  modalOverlayStyle,
  modalContentStyle,
  sectionTitleStyle,
  inputStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  DANGER_COLOR,
  LINE,
  TEXT_MUTED,
  TEXT_SUB,
} from "../uiStyles";
import { FIELD_COLORS } from "./common";

type Props = {
  fields: TruthField[];
  /** 分野ごとに付いている真理の数 */
  counts: Map<string, number>;
  onSave: (next: TruthField[]) => Promise<void>;
  onClose: () => void;
};

const nextColor = (color: string): string => FIELD_COLORS[(FIELD_COLORS.indexOf(color) + 1) % FIELD_COLORS.length];

const smallBtn: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: TEXT_MUTED,
  fontSize: "0.95rem",
  padding: "6px 4px",
  lineHeight: 1,
};

const FieldSettings: React.FC<Props> = ({ fields, counts, onSave, onClose }) => {
  const [list, setList] = useState<TruthField[]>(fields);
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (id: string, patch: Partial<TruthField>): void =>
    setList((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const move = (index: number, delta: number): void =>
    setList((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const removeField = (field: TruthField): void => {
    const n = counts.get(field.id) ?? 0;
    const message = n > 0 ? `「${field.label}」を消しますか？\n付いている${n}個の真理からは、この分野の表示が消えます（真理は消えません）。` : `「${field.label}」を消しますか？`;
    if (window.confirm(message)) setList((prev) => prev.filter((f) => f.id !== field.id));
  };

  const add = (): void => {
    const label = newLabel.trim();
    if (!label) return;
    const used = new Set(list.map((f) => f.color));
    const color = FIELD_COLORS.find((c) => !used.has(c)) ?? FIELD_COLORS[list.length % FIELD_COLORS.length];
    setList((prev) => [...prev, { id: `f-${newId().slice(0, 8)}`, label, color }]);
    setNewLabel("");
  };

  const save = async (): Promise<void> => {
    // 名前を空にした分野は元の名前に戻す
    const cleaned = list.map((f) => ({ ...f, label: f.label.trim() || fields.find((o) => o.id === f.id)?.label || "分野" }));
    setSaving(true);
    try {
      await onSave(cleaned);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={sectionTitleStyle}>分野を編集</h3>
        <p style={{ color: TEXT_MUTED, fontSize: "0.8rem", marginTop: -6, lineHeight: 1.7 }}>
          丸をタップで色が変わる。名前はそのまま書き換えられる。
        </p>

        <div style={{ borderTop: `1px solid ${LINE}` }}>
          {list.map((field, index) => (
            <div key={field.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${LINE}` }}>
              <button
                type="button"
                onClick={() => update(field.id, { color: nextColor(field.color) })}
                aria-label="色を変える"
                style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 999, border: "none", background: field.color }}
              />
              <input
                style={{ ...inputStyle, flex: 1, minWidth: 0, padding: "9px 10px" }}
                value={field.label}
                onChange={(e) => update(field.id, { label: e.target.value })}
              />
              <span style={{ fontSize: "0.72rem", color: TEXT_MUTED, minWidth: 22, textAlign: "right" }}>{counts.get(field.id) ?? 0}</span>
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} style={smallBtn} aria-label="上へ">
                ↑
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === list.length - 1} style={smallBtn} aria-label="下へ">
                ↓
              </button>
              <button type="button" onClick={() => removeField(field)} style={{ ...smallBtn, color: DANGER_COLOR, fontSize: "0.8rem" }}>
                消す
              </button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, margin: "14px 0 18px" }}>
          <input
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="新しい分野（例：子育て）"
          />
          <button type="button" onClick={add} disabled={!newLabel.trim()} style={{ ...secondaryButtonStyle, flexShrink: 0, color: TEXT_SUB }}>
            足す
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => void save()} disabled={saving} style={{ ...primaryButtonStyle, flex: 2 }}>
            {saving ? "保存中…" : "保存"}
          </button>
          <button type="button" onClick={onClose} style={{ ...secondaryButtonStyle, flex: 1 }}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default FieldSettings;
