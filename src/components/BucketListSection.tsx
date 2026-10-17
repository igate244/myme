// src/components/BucketListSection.tsx — クエスト（やりたいことリスト）
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { newId as uuidv4 } from "../utils/id";
import { useAuth } from "../auth/AuthContext";
import { useLifeStore } from "../domain/LifeStoreContext";
import type { BucketItem, BucketItemInput, BucketStatus, CheckItem } from "../domain/models";
import Field from "./Field";
import SectionHeader from "./SectionHeader";
import {
  outerStyle, scrollAreaStyle, contentMaxWidth, sectionTitleStyle,
  inputStyle, textareaStyle, primaryButtonStyle, secondaryButtonStyle,
  modalOverlayStyle, modalContentStyle, addButtonStyle,
  chipStyle, chipRowStyle, errorTextStyle, emptyStateStyle,
  progressTrackStyle, progressFillStyle, DANGER_COLOR,
} from "./uiStyles";
import { daysUntilDate, getTodayString } from "../utils/dateUtils";

type Props = { onBack: () => void };

const BUCKET_CATS: Record<string, { label: string; color: string; icon: string }> = {
  travel: { label: "旅行", color: "#8fb4d4", icon: "✈️" },
  skill: { label: "スキル", color: "#d9bd7a", icon: "📚" },
  experience: { label: "体験", color: "#d39bb8", icon: "✨" },
  possession: { label: "欲しい物", color: "#8fc4a1", icon: "🎁" },
  other: { label: "その他", color: "#8b8a87", icon: "🔖" },
};

const STATUS_OPTS: Array<{ value: BucketStatus; label: string; color: string }> = [
  { value: "want", label: "未着手", color: "#8b8a87" },
  { value: "doing", label: "挑戦中", color: "#8fb4d4" },
  { value: "done", label: "達成", color: "#8fc4a1" },
];

/**
 * 期限までの残り日数。
 * 以前は new Date("YYYY-MM-DD")（UTC 解釈）とローカルの 0 時を比べていたため、
 * 日本時間では常に 1 日多く表示され、当日でも「あと1日」になっていた。
 */
const getCountdown = (deadline?: string): { text: string; color: string; urgent: boolean } | null => {
  const days = daysUntilDate(deadline);
  if (days === null) return null;
  if (days < 0) return { text: `期限切れ (${Math.abs(days)}日経過)`, color: DANGER_COLOR, urgent: true };
  if (days === 0) return { text: "今日が期限", color: "#d9bd7a", urgent: true };
  return { text: `あと ${days} 日`, color: days <= 7 ? "#d9bd7a" : "#8b8a87", urgent: days <= 7 };
};

const BucketListSection: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const store = useLifeStore();

  const [items, setItems] = useState<BucketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filterStatus, setFilterStatus] = useState<BucketStatus | "all">("all");
  const [filterCat, setFilterCat] = useState<string>("all");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("other");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState<BucketStatus>("want");
  const [doneDate, setDoneDate] = useState(getTodayString());
  const [deadline, setDeadline] = useState("");
  const [checklist, setChecklist] = useState<CheckItem[]>([]);
  const [newCheckLabel, setNewCheckLabel] = useState("");

  const loadItems = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      setItems(await store.getBucketList(user.uid));
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
    setTitle("");
    setCategory("other");
    setDetail("");
    setStatus("want");
    setDoneDate(getTodayString());
    setDeadline("");
    setChecklist([]);
    setNewCheckLabel("");
    setShowForm(false);
  };

  const handleEdit = (item: BucketItem): void => {
    setEditingId(item.id);
    setTitle(item.title);
    setCategory(item.category);
    setDetail(item.detail ?? "");
    setStatus(item.status);
    setDoneDate(item.doneDate ?? getTodayString());
    setDeadline(item.deadline ?? "");
    setChecklist(item.checklist);
    setShowForm(true);
  };

  const addCheckItem = (): void => {
    const label = newCheckLabel.trim();
    if (!label) return;
    setChecklist((prev) => [...prev, { id: uuidv4(), label, isDone: false }]);
    setNewCheckLabel("");
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!user || !title.trim()) return;

    try {
      setSaving(true);
      const input: BucketItemInput = {
        title: title.trim(),
        category,
        detail: detail.trim() || undefined,
        status,
        doneDate: status === "done" ? doneDate : undefined,
        deadline: deadline || undefined,
        checklist,
      };

      if (editingId) {
        const updated = await store.updateBucketItem(user.uid, editingId, input);
        setItems((prev) => prev.map((item) => (item.id === editingId ? updated : item)));
      } else {
        const created = await store.addBucketItem(user.uid, input);
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
    if (!user || !window.confirm("削除しますか？")) return;
    try {
      setSaving(true);
      await store.deleteBucketItem(user.uid, id);
      setItems((prev) => prev.filter((item) => item.id !== id));
      resetForm();
    } catch (deleteError) {
      console.error(deleteError);
      setError("削除に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const sortedItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (filterStatus !== "all" && item.status !== filterStatus) return false;
      if (filterCat !== "all" && item.category !== filterCat) return false;
      return true;
    });

    return filtered.sort((a, b) => {
      // 達成済みは末尾へ、次に期限の近い順
      if (a.status === "done" !== (b.status === "done")) return a.status === "done" ? 1 : -1;
      if (a.deadline && !b.deadline) return -1;
      if (!a.deadline && b.deadline) return 1;
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
      return b.createdAt - a.createdAt;
    });
  }, [items, filterStatus, filterCat]);

  return (
    <div style={outerStyle}>
      <SectionHeader
        title="やりたいこと"
        onBack={onBack}
        accentColor="#d9bd7a"
        action={
          <button type="button" onClick={() => setShowForm(true)} style={addButtonStyle}>
            ＋追加
          </button>
        }
      >
        <div style={chipRowStyle}>
          <button type="button" onClick={() => setFilterStatus("all")} style={chipStyle(filterStatus === "all")}>
            すべて
          </button>
          {STATUS_OPTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilterStatus(option.value)}
              style={chipStyle(filterStatus === option.value, option.color)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div style={chipRowStyle}>
          <button type="button" onClick={() => setFilterCat("all")} style={chipStyle(filterCat === "all")}>
            すべて
          </button>
          {Object.entries(BUCKET_CATS).map(([key, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterCat(key)}
              style={chipStyle(filterCat === key, value.color)}
            >
              {value.icon} {value.label}
            </button>
          ))}
        </div>
      </SectionHeader>

      <div style={scrollAreaStyle}>
        <div style={{ width: "100%", maxWidth: contentMaxWidth, paddingBottom: 40 }}>
          {error && <p style={errorTextStyle}>{error}</p>}

          {loading ? (
            <p style={{ textAlign: "center", color: "#8b8a87", marginTop: 40 }}>読み込み中…</p>
          ) : sortedItems.length === 0 ? (
            <p style={emptyStateStyle}>該当する項目がありません。</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
              {sortedItems.map((item) => {
                const countdown = item.status === "done" ? null : getCountdown(item.deadline);
                const doneCount = item.checklist.filter((check) => check.isDone).length;
                const progress = item.checklist.length > 0 ? (doneCount / item.checklist.length) * 100 : null;
                const cat = BUCKET_CATS[item.category] ?? BUCKET_CATS.other;
                const statusDef = STATUS_OPTS.find((option) => option.value === item.status);

                return (
                  <div
                    key={item.id}
                    onClick={() => handleEdit(item)}
                    style={{
                      background: "#1f2024",
                      borderRadius: 12,
                      padding: 14,
                      borderLeft: `4px solid ${statusDef?.color ?? "#8b8a87"}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      cursor: "pointer",
                      opacity: item.status === "done" ? 0.6 : 1,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.7rem", color: cat.color, marginBottom: 2 }}>
                          {cat.icon} {cat.label}
                        </div>
                        <div
                          style={{
                            fontSize: "1rem",
                            fontWeight: 700,
                            color: "#e8e6e3",
                            textDecoration: item.status === "done" ? "line-through" : "none",
                          }}
                        >
                          {item.title}
                        </div>
                      </div>
                      {item.status === "done" && item.doneDate && (
                        <div style={{ fontSize: "0.7rem", color: "#8fc4a1", fontWeight: 700, whiteSpace: "nowrap" }}>
                          ✓ {item.doneDate}
                        </div>
                      )}
                    </div>

                    {(countdown || progress !== null) && (
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        {countdown && (
                          <div
                            style={{
                              fontSize: "0.8rem",
                              color: countdown.color,
                              fontWeight: countdown.urgent ? 800 : 400,
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              whiteSpace: "nowrap",
                            }}
                          >
                            <span>⏱</span> {countdown.text}
                          </div>
                        )}
                        {progress !== null && (
                          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={progressTrackStyle}>
                              <div style={progressFillStyle(progress, "#8fc4a1")} />
                            </div>
                            <span style={{ fontSize: "0.7rem", color: "#8b8a87", whiteSpace: "nowrap" }}>
                              {doneCount}/{item.checklist.length}
                            </span>
                          </div>
                        )}
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
            <h3 style={sectionTitleStyle}>{editingId ? "編集" : "新しく追加"}</h3>
            <form onSubmit={(e) => void handleSubmit(e)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="やりたいこと" name="title">
                <input
                  style={inputStyle}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  placeholder="例: スカイダイビングをする"
                  autoFocus
                />
              </Field>

              <div style={{ display: "flex", gap: 12 }}>
                <Field label="カテゴリ" name="category" style={{ flex: 1 }}>
                  <select style={inputStyle} value={category} onChange={(e) => setCategory(e.target.value)}>
                    {Object.entries(BUCKET_CATS).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value.icon} {value.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="状態" name="status" style={{ flex: 1 }}>
                  <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value as BucketStatus)}>
                    {STATUS_OPTS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="完了目標日 (期限)" name="deadline">
                <input type="date" style={inputStyle} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </Field>

              <div style={{ padding: 12, background: "#2a2b30", borderRadius: 8, border: "1px solid #2a2b30" }}>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#8b8a87", marginBottom: 8 }}>
                  チェックリスト (サブタスク)
                </label>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input
                    style={{ ...inputStyle, padding: 8 }}
                    value={newCheckLabel}
                    onChange={(e) => setNewCheckLabel(e.target.value)}
                    placeholder="項目を追加..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCheckItem();
                      }
                    }}
                  />
                  <button type="button" onClick={addCheckItem} style={{ ...secondaryButtonStyle, width: "auto" }}>
                    ＋
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {checklist.map((check) => (
                    <div
                      key={check.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        background: "rgba(0,0,0,0.2)",
                        padding: "6px 10px",
                        borderRadius: 6,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={check.isDone}
                        onChange={() =>
                          setChecklist((prev) =>
                            prev.map((target) => (target.id === check.id ? { ...target, isDone: !target.isDone } : target)),
                          )
                        }
                      />
                      <span
                        style={{
                          flex: 1,
                          fontSize: "0.85rem",
                          color: check.isDone ? "#8b8a87" : "#e8e6e3",
                          textDecoration: check.isDone ? "line-through" : "none",
                        }}
                      >
                        {check.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setChecklist((prev) => prev.filter((target) => target.id !== check.id))}
                        style={{ background: "transparent", border: "none", color: DANGER_COLOR }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {status === "done" && (
                <Field label="達成日" name="doneDate">
                  <input type="date" style={inputStyle} value={doneDate} onChange={(e) => setDoneDate(e.target.value)} />
                </Field>
              )}

              <Field label="詳細" name="detail">
                <textarea style={textareaStyle} value={detail} onChange={(e) => setDetail(e.target.value)} rows={3} />
              </Field>

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

export default BucketListSection;
