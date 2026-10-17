// src/components/YearlyGoalsSection.tsx — 冒険の記録（ライフログ）
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLifeStore } from "../domain/LifeStoreContext";
import type { LifeLog, LifeLogInput, LifeLogTag } from "../domain/models";
import Field from "./Field";
import SectionHeader from "./SectionHeader";
import {
  outerStyle, scrollAreaStyle, contentMaxWidth, sectionTitleStyle,
  inputStyle, textareaStyle, primaryButtonStyle, secondaryButtonStyle,
  modalOverlayStyle, modalContentStyle, addButtonStyle,
  chipStyle, chipRowStyle, errorTextStyle, emptyStateStyle,
  DANGER_COLOR, BG_COLOR,
} from "./uiStyles";
import { getTodayString } from "../utils/dateUtils";

type Props = { onBack: () => void };

const TAG_LABELS: Record<string, { label: string; color: string }> = {
  turning_point: { label: "分岐点", color: "#d39bb8" },
  family: { label: "家族", color: "#d9bd7a" },
  work: { label: "仕事", color: "#8fb4d4" },
  hobby: { label: "趣味", color: "#8fc4a1" },
  other: { label: "その他", color: "#8b8a87" },
};

const tagColor = (tag: LifeLogTag): string => TAG_LABELS[tag]?.color ?? "#8b8a87";
const tagLabel = (tag: LifeLogTag): string => TAG_LABELS[tag]?.label ?? tag;

const YearlyGoalsSection: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const store = useLifeStore();

  const [items, setItems] = useState<LifeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTag, setFilterTag] = useState<LifeLogTag | null>(null);
  const [collapsedYears, setCollapsedYears] = useState<Record<string, boolean>>({});

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(getTodayString());
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [tags, setTags] = useState<LifeLogTag[]>([]);

  const loadItems = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setItems(await store.getLifeLogs(user.uid));
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
    setDate(getTodayString());
    setTitle("");
    setDetail("");
    setTags([]);
    setShowForm(false);
  };

  const handleEdit = (item: LifeLog): void => {
    setEditingId(item.id);
    setDate(item.date);
    setTitle(item.title);
    setDetail(item.detail ?? "");
    setTags(item.tags);
    setShowForm(true);
  };

  const toggleTag = (tag: LifeLogTag): void => {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!user || !title.trim()) return;

    try {
      setSaving(true);
      const input: LifeLogInput = {
        date,
        title: title.trim(),
        detail: detail.trim() || undefined,
        tags,
      };

      if (editingId) {
        const updated = await store.updateLifeLog(user.uid, editingId, input);
        setItems((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      } else {
        const created = await store.addLifeLog(user.uid, input);
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
    if (!user || !window.confirm("このログを削除しますか？")) return;
    try {
      setSaving(true);
      await store.deleteLifeLog(user.uid, id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      resetForm();
    } catch (deleteError) {
      console.error(deleteError);
      setError("削除に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const groupedItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (filterTag && !item.tags.includes(filterTag)) return false;
      if (!query) return true;
      return item.title.toLowerCase().includes(query) || (item.detail ?? "").toLowerCase().includes(query);
    });

    const groups = new Map<string, LifeLog[]>();
    for (const item of filtered) {
      const year = item.date.slice(0, 4);
      const bucket = groups.get(year);
      if (bucket) bucket.push(item);
      else groups.set(year, [item]);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items, filterTag, searchQuery]);

  return (
    <div style={outerStyle}>
      <SectionHeader
        title="ライフログ"
        onBack={onBack}
        accentColor="#b4a0d8"
        action={
          <button type="button" onClick={() => setShowForm(true)} style={addButtonStyle}>
            ＋ 追加
          </button>
        }
      >
        <input
          type="text"
          placeholder="キーワードで検索"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ ...inputStyle, padding: "8px 12px", fontSize: "0.9rem", background: "#1f2024" }}
        />
        <div style={chipRowStyle}>
          <button type="button" onClick={() => setFilterTag(null)} style={chipStyle(filterTag === null)}>
            すべて
          </button>
          {Object.keys(TAG_LABELS).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterTag(key === filterTag ? null : key)}
              style={chipStyle(filterTag === key, TAG_LABELS[key].color)}
            >
              {TAG_LABELS[key].label}
            </button>
          ))}
        </div>
      </SectionHeader>

      <div style={scrollAreaStyle}>
        <div style={{ width: "100%", maxWidth: contentMaxWidth, position: "relative", paddingBottom: 40 }}>
          {error && <p style={errorTextStyle}>{error}</p>}

          {loading ? (
            <p style={{ textAlign: "center", color: "#8b8a87", marginTop: 40 }}>読み込み中…</p>
          ) : groupedItems.length === 0 ? (
            <p style={emptyStateStyle}>記録が見つかりません。</p>
          ) : (
            <div style={{ position: "relative" }}>
              <div
                style={{
                  position: "absolute",
                  left: 24,
                  top: 10,
                  bottom: 10,
                  width: 2,
                  background: "#36373d",
                  zIndex: 0,
                }}
              />

              {groupedItems.map(([year, yearItems]) => {
                const collapsed = collapsedYears[year] === true;
                return (
                  <div key={year} style={{ position: "relative" }}>
                    <div
                      onClick={() => setCollapsedYears((prev) => ({ ...prev, [year]: !prev[year] }))}
                      style={{
                        position: "sticky",
                        top: 0,
                        margin: "0 0 12px 0",
                        padding: "10px 16px 10px 42px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#18191c",
                        
                        borderBottom: "1px solid #2a2b30",
                        borderTop: "1px solid #2a2b30",
                        zIndex: 10,
                        cursor: "pointer",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "1.2rem",
                          fontWeight: 800,
                          fontFamily: "monospace",
                          color: "#e8e6e3",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {year}
                      </span>
                      <span
                        style={{
                          fontSize: "0.8rem",
                          color: "#8b8a87",
                          transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                          transition: "transform 0.2s",
                        }}
                      >
                        ▼
                      </span>
                    </div>

                    {!collapsed &&
                      yearItems.map((item) => {
                        const isTurningPoint = item.tags.includes("turning_point");
                        const primaryTag = isTurningPoint ? "turning_point" : (item.tags[0] ?? "other");
                        const dotColor = tagColor(primaryTag);

                        return (
                          <div
                            key={item.id}
                            onClick={() => handleEdit(item)}
                            style={{
                              display: "flex",
                              marginBottom: 8,
                              cursor: "pointer",
                              position: "relative",
                              minHeight: 32,
                              alignItems: "stretch",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                left: 19,
                                top: 14,
                                width: isTurningPoint ? 12 : 10,
                                height: isTurningPoint ? 12 : 10,
                                borderRadius: "50%",
                                background: BG_COLOR,
                                border: `${isTurningPoint ? 3 : 2}px solid ${dotColor}`,
                                boxShadow: "none",
                                zIndex: 2,
                              }}
                            />

                            <div
                              style={{
                                flex: 1,
                                marginLeft: 42,
                                background: isTurningPoint
                                  ? `${dotColor}14`
                                  : "#1f2024",
                                borderRadius: 8,
                                padding: "8px 12px",
                                border: isTurningPoint ? `1px solid ${dotColor}60` : "1px solid #2a2b30",
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "center",
                                gap: 2,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    color: "#8b8a87",
                                    fontFamily: "monospace",
                                    fontWeight: 700,
                                    minWidth: 36,
                                  }}
                                >
                                  {item.date.slice(5).replace("-", ".")}
                                </span>
                                <span
                                  style={{
                                    fontSize: isTurningPoint ? "0.95rem" : "0.9rem",
                                    fontWeight: isTurningPoint ? 700 : 500,
                                    color: isTurningPoint ? "#fff" : "#e8e6e3",
                                    lineHeight: 1.3,
                                  }}
                                >
                                  {item.title}
                                </span>
                              </div>

                              {item.tags.length > 0 && (
                                <div style={{ display: "flex", gap: 4, marginTop: 2, paddingLeft: 44, flexWrap: "wrap" }}>
                                  {item.tags.map((tag) => (
                                    <span
                                      key={tag}
                                      style={{
                                        fontSize: "0.6rem",
                                        padding: "1px 6px",
                                        borderRadius: 4,
                                        background: `${tagColor(tag)}20`,
                                        color: tagColor(tag),
                                        border: `1px solid ${tagColor(tag)}30`,
                                        fontWeight: 600,
                                      }}
                                    >
                                      {tagLabel(tag)}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
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
            <h3 style={sectionTitleStyle}>{editingId ? "編集" : "記録を追加"}</h3>
            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="日付" name="date">
                <input type="date" style={inputStyle} value={date} onChange={(e) => setDate(e.target.value)} required />
              </Field>
              <Field label="タイトル" name="title">
                <input
                  style={inputStyle}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="転職、結婚、旅行など"
                />
              </Field>
              <Field label="詳細" name="detail">
                <textarea
                  style={textareaStyle}
                  value={detail}
                  onChange={(e) => setDetail(e.target.value)}
                  rows={6}
                  placeholder="詳細なエピソードや感情など..."
                />
              </Field>
              <div>
                <label style={{ display: "block", color: "#8b8a87", fontSize: "0.8rem", marginBottom: 8 }}>
                  タグ (複数選択可)
                </label>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {Object.keys(TAG_LABELS).map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      style={chipStyle(tags.includes(tag), TAG_LABELS[tag].color)}
                    >
                      {TAG_LABELS[tag].label}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p style={errorTextStyle}>{error}</p>}

              <div style={{ display: "flex", gap: 8 }}>
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

export default YearlyGoalsSection;
