// src/components/StrategySection.tsx — 攻略の書（戦略・指針）
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLifeStore } from "../domain/LifeStoreContext";
import type { StrategyCategory, StrategyItem, StrategyItemInput, StrategyStrength, StrategyVerdict } from "../domain/models";
import Field from "./Field";
import SectionHeader from "./SectionHeader";
import {
  outerStyle, scrollAreaStyle, contentMaxWidth, sectionTitleStyle, cardStyle,
  textareaStyle, primaryButtonStyle, secondaryButtonStyle,
  modalOverlayStyle, modalContentStyle, addButtonStyle,
  chipStyle, chipRowStyle, errorTextStyle, emptyStateStyle, DANGER_COLOR,
} from "./uiStyles";

type Props = { onBack: () => void };

const STRATEGY_CATS: Record<StrategyCategory, { label: string; color: string; icon: string }> = {
  tactics: { label: "戦術", color: "#d9a07a", icon: "🛠" },
  theory: { label: "法則", color: "#d9bd7a", icon: "📐" },
  aesthetic: { label: "美学", color: "#d39bb8", icon: "✨" },
  definition: { label: "定義", color: "#8fb4d4", icon: "🧠" },
  impression: { label: "言葉", color: "#8fc4a1", icon: "💡" },
};

const VERDICTS: Record<StrategyVerdict, { label: string; color: string; icon: string }> = {
  adopted: { label: "採用", color: "#8fc4a1", icon: "✓" },
  rejected: { label: "不採用", color: "#e5786d", icon: "✕" },
  none: { label: "判定なし", color: "#8b8a87", icon: "─" },
};

const STRENGTHS: Record<StrategyStrength, { label: string; fontSize: string }> = {
  3: { label: "大", fontSize: "1.2rem" },
  2: { label: "中", fontSize: "1rem" },
  1: { label: "小", fontSize: "0.9rem" },
};

const StrategySection: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const store = useLifeStore();

  const [items, setItems] = useState<StrategyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterCat, setFilterCat] = useState<StrategyCategory | "all">("all");
  const [filterStrength, setFilterStrength] = useState<StrategyStrength | "all">("all");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [category, setCategory] = useState<StrategyCategory>("tactics");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [verdict, setVerdict] = useState<StrategyVerdict>("none");
  const [strength, setStrength] = useState<StrategyStrength>(2);

  const loadItems = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setItems(await store.getStrategies(user.uid));
      setError(null);
    } catch (loadError) {
      console.error(loadError);
      setError("読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [user, store]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const resetForm = (): void => {
    setEditingId(null);
    setCategory("tactics");
    setTitle("");
    setDetail("");
    setVerdict("none");
    setStrength(2);
    setShowForm(false);
  };

  const handleEdit = (item: StrategyItem): void => {
    setEditingId(item.id);
    setCategory(item.category);
    setTitle(item.title);
    setDetail(item.detail ?? "");
    setVerdict(item.verdict);
    setStrength(item.strength);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!user || !title.trim()) return;

    try {
      setSaving(true);
      const input: StrategyItemInput = {
        category,
        title: title.trim(),
        detail: detail.trim() || undefined,
        verdict,
        strength,
      };

      if (editingId) {
        const updated = await store.updateStrategyItem(user.uid, editingId, input);
        setItems((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      } else {
        const created = await store.addStrategyItem(user.uid, input);
        setItems((prev) => [created, ...prev]);
      }
      resetForm();
      setError(null);
    } catch (submitError) {
      console.error(submitError);
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!user || !window.confirm("この項目を削除しますか？")) return;
    try {
      setSaving(true);
      await store.deleteStrategyItem(user.uid, id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      resetForm();
    } catch (deleteError) {
      console.error(deleteError);
      setError("削除に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  // 元の実装は state の配列をそのまま sort していて中身を書き換えていたため、
  // コピーしてから並べ替える
  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (filterCat !== "all" && item.category !== filterCat) return false;
      if (filterStrength !== "all" && item.strength !== filterStrength) return false;
      return true;
    });

    return [...filtered].sort((a, b) => b.strength - a.strength || b.createdAt.localeCompare(a.createdAt));
  }, [items, filterCat, filterStrength]);

  return (
    <div style={outerStyle}>
      <SectionHeader
        title="指針"
        onBack={onBack}
        accentColor="#8fb4d4"
        action={
          <button type="button" onClick={() => setShowForm(true)} style={addButtonStyle}>
            ＋ 追加
          </button>
        }
      >
        <div style={chipRowStyle}>
          <button type="button" onClick={() => setFilterCat("all")} style={chipStyle(filterCat === "all")}>
            すべて
          </button>
          {(Object.keys(STRATEGY_CATS) as StrategyCategory[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterCat(key)}
              style={chipStyle(filterCat === key, STRATEGY_CATS[key].color)}
            >
              {STRATEGY_CATS[key].label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          <span style={{ fontSize: "0.7rem", color: "#8b8a87" }}>重要度:</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" onClick={() => setFilterStrength("all")} style={chipStyle(filterStrength === "all")}>
              すべて
            </button>
            {([3, 2, 1] as StrategyStrength[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilterStrength(value)}
                style={chipStyle(filterStrength === value)}
              >
                {STRENGTHS[value].label}
              </button>
            ))}
          </div>
        </div>
      </SectionHeader>

      <div style={scrollAreaStyle}>
        <div style={{ width: "100%", maxWidth: contentMaxWidth, paddingBottom: 40 }}>
          {error && <p style={errorTextStyle}>{error}</p>}

          {loading ? (
            <p style={{ textAlign: "center", color: "#8b8a87", marginTop: 20 }}>読み込み中...</p>
          ) : filteredItems.length === 0 ? (
            <p style={emptyStateStyle}>データがありません。</p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
              {filteredItems.map((item) => {
                const cat = STRATEGY_CATS[item.category];
                const verdictDef = VERDICTS[item.verdict];
                const isCore = item.strength === 3;
                const isMinor = item.strength === 1;

                const borderColor =
                  isCore
                    ? item.verdict !== "none" ? verdictDef.color : cat.color
                    : item.verdict === "adopted"
                      ? `${verdictDef.color}40`
                      : item.verdict === "rejected"
                        ? `${verdictDef.color}30`
                        : `${cat.color}30`;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleEdit(item)}
                    style={{
                      ...cardStyle,
                      marginBottom: 0,
                      padding: "14px 16px",
                      cursor: "pointer",
                      border: `${isCore ? 2 : 1}px solid ${borderColor}`,
                      boxShadow: "none",
                      background:
                        item.verdict === "adopted"
                          ? `${VERDICTS.adopted.color}0f`
                          : isMinor
                            ? "#18191c"
                            : "#18191c",
                      opacity: item.verdict === "rejected" ? 0.6 : isMinor ? 0.8 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: isCore ? "1.8rem" : "1.4rem",
                          filter: isMinor ? "grayscale(0.5)" : "none",
                        }}
                      >
                        {item.verdict !== "none" ? verdictDef.icon : cat.icon}
                      </span>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              color: cat.color,
                              border: `1px solid ${cat.color}40`,
                              padding: "0 4px",
                              borderRadius: 4,
                            }}
                          >
                            {cat.label}
                          </span>
                          {isCore && <span style={{ fontSize: "0.6rem", color: "#d9bd7a", fontWeight: 700 }}>★ 重要</span>}
                        </div>
                        <div
                          style={{
                            fontSize: STRENGTHS[item.strength].fontSize,
                            fontWeight: isCore ? 800 : 700,
                            color: isCore ? "#fff" : "#e8e6e3",
                            lineHeight: 1.3,
                          }}
                        >
                          {item.title}
                        </div>
                        {item.detail && !isMinor && (
                          <div
                            style={{
                              fontSize: "0.75rem",
                              color: "#8b8a87",
                              marginTop: 4,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {item.detail}
                          </div>
                        )}
                      </div>
                    </div>

                    {item.verdict !== "none" && !isMinor && (
                      <div
                        style={{
                          fontSize: "0.65rem",
                          color: verdictDef.color,
                          fontWeight: 700,
                          border: `1px solid ${verdictDef.color}30`,
                          padding: "2px 6px",
                          borderRadius: 4,
                          whiteSpace: "nowrap",
                          background: "rgba(0,0,0,0.2)",
                        }}
                      >
                        {verdictDef.label}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showForm && (
        <div style={modalOverlayStyle} onClick={resetForm}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={sectionTitleStyle}>{editingId ? "編集" : "知恵を追加"}</h3>
            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(Object.keys(STRATEGY_CATS) as StrategyCategory[]).map((key) => {
                  const active = category === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setCategory(key)}
                      style={{
                        flex: "1 0 30%",
                        padding: "10px 0",
                        borderRadius: 8,
                        border: active ? `1px solid ${STRATEGY_CATS[key].color}` : "1px solid #36373d",
                        background: active ? `${STRATEGY_CATS[key].color}20` : "transparent",
                        color: active ? STRATEGY_CATS[key].color : "#8b8a87",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                      }}
                    >
                      {STRATEGY_CATS[key].label}
                    </button>
                  );
                })}
              </div>

              <Field label="項目名" name="title">
                <textarea
                  style={{ ...textareaStyle, minHeight: 60 }}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  rows={2}
                  required
                  placeholder="例：ドラム式洗濯機の導入"
                />
              </Field>

              <div style={{ background: "#2a2b30", padding: 12, borderRadius: 8 }}>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#8b8a87", marginBottom: 8 }}>
                  重要度・インパクト
                </label>
                <div style={{ display: "flex", gap: 1 }}>
                  {([1, 2, 3] as StrategyStrength[]).map((value) => {
                    const active = strength === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setStrength(value)}
                        style={{
                          flex: 1,
                          padding: 10,
                          border: active ? "1px solid #e8e6e3" : "1px solid #36373d",
                          background: active ? "#36373d" : "transparent",
                          color: active ? "#fff" : "#8b8a87",
                          fontSize: "0.9rem",
                          fontWeight: active ? 700 : 400,
                          borderRadius: value === 1 ? "8px 0 0 8px" : value === 3 ? "0 8px 8px 0" : 0,
                        }}
                      >
                        {STRENGTHS[value].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#8b8a87", marginBottom: 8 }}>判定 (結果)</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(Object.keys(VERDICTS) as StrategyVerdict[]).map((key) => {
                    const active = verdict === key;
                    const def = VERDICTS[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setVerdict(key)}
                        style={{
                          flex: 1,
                          padding: 12,
                          borderRadius: 8,
                          border: active ? `2px solid ${def.color}` : "1px solid #36373d",
                          background: active ? `${def.color}20` : "transparent",
                          color: active ? def.color : "#8b8a87",
                        }}
                      >
                        <div style={{ fontSize: "1.2rem", marginBottom: 2 }}>{def.icon}</div>
                        <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>{def.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Field label="詳細 / 理由" name="detail">
                <textarea
                  style={{ ...textareaStyle, lineHeight: 1.6 }}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={4}
                  placeholder="詳細や出典など..."
                />
              </Field>

              {error && <p style={errorTextStyle}>{error}</p>}

              <div style={{ display: "flex", gap: 10 }}>
                <button type="submit" style={{ ...primaryButtonStyle, flex: 1 }} disabled={saving}>
                  保存
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(editingId)}
                    style={{ ...secondaryButtonStyle, color: DANGER_COLOR, borderColor: DANGER_COLOR, flex: 1 }}
                  >
                    削除
                  </button>
                )}
                <button type="button" onClick={resetForm} style={{ ...secondaryButtonStyle, flex: 1 }}>
                  閉じる
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default StrategySection;
