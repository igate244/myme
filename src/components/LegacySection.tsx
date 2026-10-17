// src/components/LegacySection.tsx — 伝承の書（残す手紙）
//
// 修正点:
//  * 編集を「削除して作り直す」方式から通常の更新に変更。
//    以前は編集のたびに ID と作成日時が作り直され、記入日が今日に戻っていた。
//  * フォームの「記入日」が保存されていなかったのを保存するようにした。

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLifeStore } from "../domain/LifeStoreContext";
import type { LegacyItem, LegacyItemInput, UserProfile } from "../domain/models";
import Field from "./Field";
import SectionHeader from "./SectionHeader";
import {
  outerStyle, scrollAreaStyle, contentMaxWidth, sectionTitleStyle, cardStyle,
  inputStyle, textareaStyle, primaryButtonStyle, secondaryButtonStyle,
  modalOverlayStyle, modalContentStyle, iconButtonStyle,
  errorTextStyle, emptyStateStyle, DANGER_COLOR,
} from "./uiStyles";
import { calculateAge, getTodayString } from "../utils/dateUtils";

type Props = { onBack: () => void };

const LegacySection: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const store = useLifeStore();

  const [allItems, setAllItems] = useState<LegacyItem[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [showRecipientForm, setShowRecipientForm] = useState(false);
  const [newTargetName, setNewTargetName] = useState("");

  const [showLetterForm, setShowLetterForm] = useState(false);
  const [editingItem, setEditingItem] = useState<LegacyItem | null>(null);
  const [letterTitle, setLetterTitle] = useState("");
  const [letterContent, setLetterContent] = useState("");
  const [letterDate, setLetterDate] = useState(getTodayString());

  const loadData = useCallback(async () => {
    if (!user) return;
    try {
      setLoading(true);
      const [legacies, loadedProfile] = await Promise.all([
        store.getLegacies(user.uid),
        store.getUserProfile(user.uid),
      ]);
      setAllItems(legacies.filter((item) => item.category === "message"));
      setProfile(loadedProfile);
      setError(null);
    } catch (loadError) {
      console.error(loadError);
      setError("読み込みに失敗しました");
    } finally {
      setLoading(false);
    }
  }, [user, store]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const recipientGroups = useMemo(() => {
    const groups = new Map<string, LegacyItem[]>();
    for (const item of allItems) {
      const target = item.forWho ?? "名称未設定";
      const bucket = groups.get(target);
      if (bucket) bucket.push(item);
      else groups.set(target, [item]);
    }

    return [...groups.entries()]
      .map(([targetName, letters]) => ({
        targetName,
        letters: [...letters].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
      }))
      .sort((a, b) => (b.letters[0]?.date ?? "").localeCompare(a.letters[0]?.date ?? ""));
  }, [allItems]);

  const openNewLetter = (): void => {
    setEditingItem(null);
    setLetterTitle("");
    setLetterContent("");
    setLetterDate(getTodayString());
    setShowLetterForm(true);
  };

  const openEditLetter = (item: LegacyItem): void => {
    setEditingItem(item);
    setLetterTitle(item.title);
    setLetterContent(item.content);
    setLetterDate(item.date || getTodayString());
    setShowLetterForm(true);
  };

  const handleAddRecipient = (e: React.FormEvent): void => {
    e.preventDefault();
    const name = newTargetName.trim();
    if (!name) return;
    setSelectedTarget(name);
    setShowRecipientForm(false);
    setNewTargetName("");
    openNewLetter();
  };

  const handleSaveLetter = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!user || !selectedTarget || !letterContent.trim()) return;

    try {
      setSaving(true);
      const input: LegacyItemInput = {
        title: letterTitle.trim() || "無題",
        content: letterContent.trim(),
        category: "message",
        forWho: selectedTarget,
        date: letterDate,
      };

      if (editingItem) {
        const updated = await store.updateLegacyItem(user.uid, editingItem.id, input);
        setAllItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await store.addLegacyItem(user.uid, input);
        setAllItems((prev) => [created, ...prev]);
      }

      setShowLetterForm(false);
      setEditingItem(null);
      setError(null);
    } catch (saveError) {
      console.error(saveError);
      setError("手紙の保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLetter = async (itemId: string): Promise<void> => {
    if (!user || !window.confirm("この手紙を削除しますか？")) return;
    try {
      setSaving(true);
      await store.deleteLegacyItem(user.uid, itemId);
      setAllItems((prev) => prev.filter((item) => item.id !== itemId));
      setShowLetterForm(false);
      setEditingItem(null);
    } catch (deleteError) {
      console.error(deleteError);
      setError("削除に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRecipient = async (): Promise<void> => {
    if (!user || !selectedTarget) return;
    if (!window.confirm(`「${selectedTarget}」への手紙をすべて削除しますか？\nこの操作は取り消せません。`)) return;

    try {
      setSaving(true);
      const targets = allItems.filter((item) => (item.forWho ?? "名称未設定") === selectedTarget);
      for (const target of targets) {
        await store.deleteLegacyItem(user.uid, target.id);
      }
      setAllItems((prev) => prev.filter((item) => (item.forWho ?? "名称未設定") !== selectedTarget));
      setSelectedTarget(null);
    } catch (deleteError) {
      console.error(deleteError);
      setError("削除に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const letterFormModal = showLetterForm && (
    <div style={modalOverlayStyle} onClick={() => setShowLetterForm(false)}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={sectionTitleStyle}>{editingItem ? "手紙を編集" : "手紙を書く"}</h3>
        <form onSubmit={(e) => void handleSaveLetter(e)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <Field label="記入日" name="date">
                <input type="date" style={inputStyle} value={letterDate} onChange={(e) => setLetterDate(e.target.value)} required />
              </Field>
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", paddingBottom: 10, fontSize: "0.9rem", color: "#8b8a87" }}>
              {profile?.birthDate ? <span>(当時 {calculateAge(profile.birthDate, letterDate) ?? "?"}歳)</span> : <span>(年齢不明)</span>}
            </div>
          </div>

          <Field label="タイトル" name="title">
            <input
              style={inputStyle}
              value={letterTitle}
              onChange={(e) => setLetterTitle(e.target.value)}
              placeholder="例: 10回目の結婚記念日に"
              required
            />
          </Field>

          <Field label="本文" name="content">
            <textarea
              style={textareaStyle}
              value={letterContent}
              onChange={(e) => setLetterContent(e.target.value)}
              rows={10}
              placeholder="ここに想いを綴る..."
              required
            />
          </Field>

          {error && <p style={errorTextStyle}>{error}</p>}

          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" style={{ ...primaryButtonStyle, flex: 1 }} disabled={saving}>
              保存
            </button>
            {editingItem && (
              <button
                type="button"
                onClick={() => void handleDeleteLetter(editingItem.id)}
                style={{ ...secondaryButtonStyle, color: DANGER_COLOR, borderColor: DANGER_COLOR, flex: 1 }}
              >
                削除
              </button>
            )}
            <button type="button" onClick={() => setShowLetterForm(false)} style={{ ...secondaryButtonStyle, flex: 1 }}>
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  /* --------------------------------------------------------- 宛先の一覧画面 */

  if (!selectedTarget) {
    return (
      <div style={outerStyle}>
        <SectionHeader title="遺すもの" onBack={onBack} accentColor="#d1a0c4">
          <button type="button" style={{ ...primaryButtonStyle, padding: 12 }} onClick={() => setShowRecipientForm(true)}>
            ＋ 宛先を追加
          </button>
        </SectionHeader>

        <div style={scrollAreaStyle}>
          <div style={{ width: "100%", maxWidth: contentMaxWidth }}>
            {error && <p style={errorTextStyle}>{error}</p>}

            {loading ? (
              <p style={{ color: "#8b8a87", textAlign: "center" }}>読み込み中...</p>
            ) : recipientGroups.length === 0 ? (
              <div style={emptyStateStyle}>
                <p style={{ margin: 0 }}>まだ宛先がありません。</p>
                <p style={{ fontSize: "0.9rem", margin: "8px 0 0" }}>
                  大切な人の名前を登録して、
                  <br />
                  想いを書き残しましょう。
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
                  gap: 12,
                  marginTop: 16,
                  paddingBottom: 40,
                }}
              >
                {recipientGroups.map((group) => (
                  <div
                    key={group.targetName}
                    onClick={() => setSelectedTarget(group.targetName)}
                    style={{
                      ...cardStyle,
                      marginBottom: 0,
                      padding: "20px 8px",
                      cursor: "pointer",
                      borderTop: "3px solid #b4a0d8",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      textAlign: "center",
                      background: "#1f2024",
                    }}
                  >
                    <div style={{ fontSize: "2rem", marginBottom: 8,  }}>✉️</div>
                    <div style={{ fontSize: "0.95rem", fontWeight: 700, color: "#e8e6e3", lineHeight: 1.3, wordBreak: "break-all" }}>
                      {group.targetName}
                    </div>
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "#d1a0c4",
                        fontWeight: 600,
                        background: "rgba(168,85,247,0.1)",
                        padding: "2px 8px",
                        borderRadius: 12,
                        marginTop: 8,
                      }}
                    >
                      {group.letters.length}通
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {showRecipientForm && (
          <div style={modalOverlayStyle} onClick={() => setShowRecipientForm(false)}>
            <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
              <h3 style={sectionTitleStyle}>宛先の作成</h3>
              <form onSubmit={handleAddRecipient} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Field label="誰に書きますか？" name="targetName">
                  <input
                    style={inputStyle}
                    value={newTargetName}
                    onChange={(e) => setNewTargetName(e.target.value)}
                    placeholder="例: 長女へ"
                    required
                    autoFocus
                  />
                </Field>
                <div style={{ display: "flex", gap: 10 }}>
                  <button type="submit" style={{ ...primaryButtonStyle, flex: 1 }} disabled={saving}>
                    作成して手紙を書く
                  </button>
                  <button type="button" onClick={() => setShowRecipientForm(false)} style={{ ...secondaryButtonStyle, flex: 1 }}>
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {letterFormModal}
      </div>
    );
  }

  /* ----------------------------------------------------------- 手紙の一覧 */

  const currentLetters = recipientGroups.find((group) => group.targetName === selectedTarget)?.letters ?? [];

  return (
    <div style={outerStyle}>
      <SectionHeader
        title={`${selectedTarget} への手紙`}
        backLabel="戻る"
        onBack={() => setSelectedTarget(null)}
        accentColor="#d1a0c4"
        action={
          <button
            type="button"
            onClick={() => void handleDeleteRecipient()}
            style={{ ...iconButtonStyle, color: DANGER_COLOR }}
            title="宛先ごと削除"
          >
            🗑️
          </button>
        }
      >
        <button type="button" style={{ ...primaryButtonStyle, padding: 12 }} onClick={openNewLetter}>
          ＋ 手紙を書く
        </button>
      </SectionHeader>

      <div style={scrollAreaStyle}>
        <div style={{ width: "100%", maxWidth: contentMaxWidth }}>
          {error && <p style={errorTextStyle}>{error}</p>}

          {currentLetters.length === 0 ? (
            <p style={emptyStateStyle}>
              まだ手紙がありません。
              <br />
              今の想いを書き残しましょう。
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16, paddingBottom: 40 }}>
              {currentLetters.map((letter) => {
                const authorAge = calculateAge(profile?.birthDate, letter.date);
                return (
                  <div
                    key={letter.id}
                    style={{ ...cardStyle, marginBottom: 0, padding: 20, borderLeft: "4px solid #b4a0d8" }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 8 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#e8e6e3", marginBottom: 4 }}>
                          {letter.title}
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#b4a0d8", fontWeight: 600 }}>
                          {letter.date}
                          <span style={{ color: "#8b8a87", marginLeft: 8, fontWeight: 400 }}>
                            (当時 {authorAge ?? "?"}歳)
                          </span>
                        </div>
                      </div>
                      <button type="button" onClick={() => openEditLetter(letter)} style={iconButtonStyle} title="編集">
                        ✏️
                      </button>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, color: "#e8e6e3", fontSize: "0.95rem" }}>
                      {letter.content}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {letterFormModal}
    </div>
  );
};

export default LegacySection;
