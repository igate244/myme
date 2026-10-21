// src/components/strategy/TruthEditor.tsx — 真理の追加と編集（下から出るシート）
//
// 書き方は2通り：
//   * 一言の真理（「睡眠を削ると全部が崩れる」）＝ kind "lesson"
//   * 「〇〇とは」の形（「仕事とは、誰かの困りごとを減らすこと」）＝ kind "definition"
import React, { useMemo, useState } from "react";
import {
  categoryFromKind,
  TRUTH_ORIGINS,
  type LifeLog,
  type StrategyItem,
  type StrategyItemInput,
  type StrategyKind,
  type TruthField,
  type TruthOrigin,
} from "../../domain/models";
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
  LINE_2,
  TEXT_MUTED,
  ACCENT,
} from "../uiStyles";
import { ORIGIN_LABELS, accentLink, isUnfound, todayString } from "./common";

type Props = {
  item: StrategyItem | null;
  /** 新しく書くときの形（定義の「まだ見つけてない真理」から開いたときは definition） */
  defaultKind?: StrategyKind;
  lifeLogs: LifeLog[];
  fields: TruthField[];
  onEditFields: () => void;
  saving: boolean;
  onSave: (input: StrategyItemInput) => void;
  onDelete?: () => void;
  onClose: () => void;
};

const pill = (active: boolean, color = ACCENT): React.CSSProperties => ({
  padding: "7px 12px",
  borderRadius: 999,
  fontSize: "0.82rem",
  border: `1px solid ${active ? color : LINE_2}`,
  background: active ? `${color}22` : "transparent",
  color: active ? color : TEXT_MUTED,
  fontWeight: active ? 700 : 500,
});

const TruthEditor: React.FC<Props> = ({ item, defaultKind = "lesson", lifeLogs, fields, onEditFields, saving, onSave, onDelete, onClose }) => {
  const [kind, setKind] = useState<StrategyKind>(item?.kind === "definition" ? "definition" : item ? "lesson" : defaultKind);
  // 一言の真理は title が本文。「〇〇とは」は title が言葉、detail が本文
  const [word, setWord] = useState(item?.kind === "definition" ? item.title : "");
  const [truth, setTruth] = useState(item ? (item.kind === "definition" ? (item.detail ?? "") : item.title) : "");
  const [story, setStory] = useState(item?.kind === "definition" ? "" : (item?.detail ?? ""));
  const [selected, setSelected] = useState<string[]>(item?.fields ?? []);
  const toggleField = (id: string): void => setSelected((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  const [origin, setOrigin] = useState<TruthOrigin>(item?.origin ?? "experience");
  const [source, setSource] = useState(item?.source ?? "");
  // 「まだ見つけてない真理」に初めて答えを書くときは、今日を見つけた日にする
  const [foundDate, setFoundDate] = useState(item && !isUnfound(item) && item.foundDate ? item.foundDate : todayString());
  const [lifeLogId, setLifeLogId] = useState(item?.lifeLogId ?? "");

  const logOptions = useMemo(() => [...lifeLogs].sort((a, b) => b.date.localeCompare(a.date)), [lifeLogs]);

  const canSave = kind === "definition" ? word.trim() !== "" : truth.trim() !== "";

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      kind,
      category: item && item.kind === kind ? item.category : categoryFromKind(kind),
      title: kind === "definition" ? word.trim() : truth.trim(),
      // 「〇〇とは」の形では、きっかけは書かない（本文が detail に入るため）
      detail: kind === "definition" ? truth.trim() || undefined : story.trim() || undefined,
      source: origin === "experience" ? undefined : source.trim() || undefined,
      fields: selected,
      origin,
      foundDate,
      lifeLogId: lifeLogId || undefined,
      // 画面から外した項目も、消さずにそのまま持ち回す
      emotions: item?.emotions ?? [],
      pinned: item?.pinned ?? false,
      notes: item?.notes ?? [],
      verdict: item?.verdict ?? "none",
      strength: item?.strength ?? 2,
    });
  };

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={sectionTitleStyle}>{item ? "真理を編集" : "真理を見つけた"}</h3>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" onClick={() => setKind("lesson")} style={{ ...pill(kind === "lesson"), flex: 1 }}>
              一言で
            </button>
            <button type="button" onClick={() => setKind("definition")} style={{ ...pill(kind === "definition"), flex: 1 }}>
              「〇〇とは」
            </button>
          </div>

          {kind === "definition" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1, minWidth: 0, fontWeight: 700 }}
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="例：仕事"
                  required
                />
                <span style={{ flexShrink: 0, color: TEXT_MUTED }}>とは</span>
              </div>
              <textarea
                style={{ ...textareaStyle, minHeight: 84 }}
                value={truth}
                onChange={(e) => setTruth(e.target.value)}
                placeholder="今の自分ならどう言う？（空のままなら「まだ見つけてない真理」として残る）"
              />
            </div>
          ) : (
            <>
              <div>
                <label style={labelStyle}>真理</label>
                <textarea
                  style={{ ...textareaStyle, minHeight: 64, fontWeight: 600 }}
                  value={truth}
                  onChange={(e) => setTruth(e.target.value)}
                  placeholder="例：睡眠を削ると全部が崩れる"
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>どうやって気づいた？</label>
                <textarea
                  style={{ ...textareaStyle, minHeight: 84 }}
                  value={story}
                  onChange={(e) => setStory(e.target.value)}
                  placeholder="何があって、そう思ったか"
                />
              </div>
            </>
          )}

          <div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <label style={labelStyle}>分野（いくつでも）</label>
              <button type="button" onClick={onEditFields} style={{ ...accentLink, fontSize: "0.78rem", padding: 0 }}>
                分野を編集
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {fields.map((f) => (
                <button key={f.id} type="button" onClick={() => toggleField(f.id)} style={pill(selected.includes(f.id), f.color)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>出どころ</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {TRUTH_ORIGINS.map((o) => (
                <button key={o} type="button" onClick={() => setOrigin(o)} style={pill(origin === o)}>
                  {ORIGIN_LABELS[o]}
                </button>
              ))}
            </div>
            {origin !== "experience" && (
              <input
                style={{ ...inputStyle, marginTop: 8 }}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={origin === "person" ? "誰から？" : "本・作品の名前"}
              />
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>見つけた日</label>
            <input type="date" style={inputStyle} value={foundDate} onChange={(e) => setFoundDate(e.target.value)} />
            {logOptions.length > 0 && (
              <>
                <label style={{ ...labelStyle, margin: "8px 0 0" }}>きっかけになった出来事（ライフログ）</label>
                <select style={inputStyle} value={lifeLogId} onChange={(e) => setLifeLogId(e.target.value)}>
                  <option value="">なし</option>
                  {logOptions.map((log) => (
                    <option key={log.id} value={log.id}>
                      {log.date.replaceAll("-", "/")}　{log.title}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="submit" disabled={saving || !canSave} style={{ ...primaryButtonStyle, flex: 2 }}>
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

export default TruthEditor;
