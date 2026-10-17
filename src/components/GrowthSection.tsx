// src/components/GrowthSection.tsx — 育成記録
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { newId as uuidv4 } from "../utils/id";
import { useLifeStore } from "../domain/LifeStoreContext";
import type { FamilyMember, GrowthLog, GrowthTag } from "../domain/models";
import Field from "./Field";
import SectionHeader from "./SectionHeader";
import {
  outerStyle, scrollAreaStyle, contentMaxWidth, sectionTitleStyle, cardStyle,
  inputStyle, textareaStyle, primaryButtonStyle, secondaryButtonStyle,
  modalOverlayStyle, modalContentStyle, iconButtonStyle,
  chipStyle, chipRowStyle, errorTextStyle, emptyStateStyle, DANGER_COLOR,
} from "./uiStyles";
import { formatExactAge, getTodayString } from "../utils/dateUtils";

type Props = { onBack: () => void };

const TAG_CONFIG: Array<{ id: GrowthTag; label: string; icon: string; color: string }> = [
  { id: "daily", label: "日常", icon: "☀️", color: "#e3cf98" },
  { id: "event", label: "行事", icon: "🎉", color: "#d9bd7a" },
  { id: "skill", label: "能力", icon: "✨", color: "#8fb4d4" },
  { id: "dialogue", label: "言動", icon: "💬", color: "#b4a0d8" },
  { id: "other", label: "その他", icon: "🔖", color: "#8b8a87" },
];

const tagDef = (tag: GrowthTag): { label: string; color: string } =>
  TAG_CONFIG.find((config) => config.id === tag) ?? { label: String(tag), color: "#8b8a87" };

const ALL_TAB = "ALL";

const GrowthSection: React.FC<Props> = ({ onBack }) => {
  const store = useLifeStore();

  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [logs, setLogs] = useState<GrowthLog[]>([]);
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const [filterTag, setFilterTag] = useState<GrowthTag | null>(null);
  const [collapsedYears, setCollapsedYears] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const [logDate, setLogDate] = useState(getTodayString());
  const [content, setContent] = useState("");
  const [selectedTags, setSelectedTags] = useState<GrowthTag[]>([]);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  const [showManageModal, setShowManageModal] = useState(false);
  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [memberName, setMemberName] = useState("");
  const [memberBirth, setMemberBirth] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [loadedMembers, loadedLogs] = await Promise.all([
        store.getFamilyMembers(),
        store.getGrowthLogs(activeTab === ALL_TAB ? undefined : activeTab),
      ]);
      setMembers(loadedMembers);
      setLogs(loadedLogs);
      setError(null);
    } catch (loadError) {
      console.error(loadError);
      setError("読み込みに失敗しました");
    }
  }, [store, activeTab]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const currentMember = members.find((member) => member.id === activeTab) ?? null;
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const cancelEdit = (): void => {
    setContent("");
    setSelectedTags([]);
    setEditingLogId(null);
  };

  const handleSaveLog = async (): Promise<void> => {
    if (!content.trim()) return;
    if (activeTab === ALL_TAB) {
      setError("「ALL」タブでは追加できません。記録したい対象のタブを選んでください。");
      return;
    }

    try {
      const existing = editingLogId ? logs.find((log) => log.id === editingLogId) : undefined;
      const log: GrowthLog = {
        id: editingLogId ?? uuidv4(),
        childId: activeTab,
        date: logDate,
        content: content.trim(),
        tags: selectedTags,
        createdAt: existing?.createdAt ?? Date.now(),
      };
      await store.saveGrowthLog(log);
      cancelEdit();
      await loadData();
    } catch (saveError) {
      console.error(saveError);
      setError("保存に失敗しました");
    }
  };

  const handleEditLog = (log: GrowthLog): void => {
    if (activeTab === ALL_TAB) setActiveTab(log.childId);
    setLogDate(log.date);
    setContent(log.content);
    setSelectedTags(log.tags);
    setEditingLogId(log.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDeleteLog = async (id: string): Promise<void> => {
    if (!window.confirm("削除しますか？")) return;
    try {
      await store.deleteGrowthLog(id);
      if (editingLogId === id) cancelEdit();
      await loadData();
    } catch (deleteError) {
      console.error(deleteError);
      setError("削除に失敗しました");
    }
  };

  const handleSaveMember = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!memberName.trim()) return;
    try {
      await store.saveFamilyMember({
        id: editingMember?.id ?? uuidv4(),
        name: memberName.trim(),
        birthDate: memberBirth || undefined,
        order: editingMember?.order ?? members.length,
      });
      setShowMemberForm(false);
      await loadData();
    } catch (saveError) {
      console.error(saveError);
      setError("メンバーの保存に失敗しました");
    }
  };

  const handleDeleteMember = async (id: string): Promise<void> => {
    if (!window.confirm("このメンバーを削除しますか？(記録は残ります)")) return;
    try {
      await store.deleteFamilyMember(id);
      if (activeTab === id) setActiveTab(ALL_TAB);
      await loadData();
    } catch (deleteError) {
      console.error(deleteError);
      setError("削除に失敗しました");
    }
  };

  const groupedLogs = useMemo(() => {
    const filtered = filterTag ? logs.filter((log) => log.tags.includes(filterTag)) : logs;
    const groups = new Map<string, GrowthLog[]>();
    for (const log of filtered) {
      const year = log.date.slice(0, 4);
      const bucket = groups.get(year);
      if (bucket) bucket.push(log);
      else groups.set(year, [log]);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs, filterTag]);

  return (
    <div style={outerStyle}>
      <SectionHeader
        title="子どもの記録"
        onBack={onBack}
        accentColor="#8fc4a1"
        action={
          <button type="button" onClick={() => setShowManageModal(true)} style={iconButtonStyle} title="メンバー設定">
            ⚙️
          </button>
        }
      >
        <div style={{ ...chipRowStyle, borderBottom: "1px solid #36373d", paddingBottom: 8 }}>
          <button
            type="button"
            onClick={() => {
              setActiveTab(ALL_TAB);
              cancelEdit();
            }}
            style={{ ...chipStyle(activeTab === ALL_TAB, "#8fc4a1"), padding: "6px 14px", fontWeight: 700 }}
          >
            みんな
          </button>
          {members.map((member) => (
            <button
              key={member.id}
              type="button"
              onClick={() => {
                setActiveTab(member.id);
                cancelEdit();
              }}
              style={{ ...chipStyle(activeTab === member.id, "#8fc4a1"), padding: "6px 14px", fontWeight: 700 }}
            >
              {member.name}
            </button>
          ))}
        </div>

        <div style={chipRowStyle}>
          <button type="button" onClick={() => setFilterTag(null)} style={chipStyle(filterTag === null)}>
            すべて
          </button>
          {TAG_CONFIG.map((tag) => (
            <button
              key={String(tag.id)}
              type="button"
              onClick={() => setFilterTag(filterTag === tag.id ? null : tag.id)}
              style={chipStyle(filterTag === tag.id, tag.color)}
            >
              {tag.label}
            </button>
          ))}
        </div>
      </SectionHeader>

      <div style={scrollAreaStyle}>
        <div style={{ width: "100%", maxWidth: contentMaxWidth, display: "flex", flexDirection: "column", gap: 10, paddingTop: 10, paddingBottom: 40 }}>
          {error && <p style={errorTextStyle}>{error}</p>}

          {members.length === 0 && (
            <div style={emptyStateStyle}>
              <p style={{ marginTop: 0 }}>まずは記録する対象を追加してください。</p>
              <button type="button" onClick={() => setShowManageModal(true)} style={{ ...primaryButtonStyle, width: "auto" }}>
                ⚙️ メンバー設定
              </button>
            </div>
          )}

          {currentMember && (
            <div style={{ ...cardStyle, borderTop: "3px solid #8fc4a1", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              {editingLogId && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: "rgba(251, 191, 36, 0.2)",
                    padding: "4px 8px",
                    borderRadius: 4,
                  }}
                >
                  <span style={{ fontSize: "0.75rem", color: "#d9bd7a", fontWeight: 700 }}>✏️ 記録を編集中</span>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    style={{ background: "none", border: "none", color: "#d9bd7a", fontSize: "0.75rem", textDecoration: "underline" }}
                  >
                    キャンセル
                  </button>
                </div>
              )}

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  style={{ ...inputStyle, flex: 1, fontSize: "0.9rem" }}
                />
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "0 10px",
                    background: "#2a2b30",
                    borderRadius: 8,
                    fontSize: "0.8rem",
                    color: "#8fc4a1",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatExactAge(currentMember.birthDate, logDate) || "-"}
                </div>
              </div>

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`${currentMember.name} の成長・発見...`}
                style={{ ...textareaStyle, minHeight: 60, fontSize: "0.95rem" }}
              />

              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {TAG_CONFIG.map((tag) => (
                  <button
                    key={String(tag.id)}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) => (prev.includes(tag.id) ? prev.filter((t) => t !== tag.id) : [...prev, tag.id]))
                    }
                    style={chipStyle(selectedTags.includes(tag.id), tag.color)}
                  >
                    {tag.icon} {tag.label}
                  </button>
                ))}
              </div>

              <button type="button" onClick={() => void handleSaveLog()} style={{ ...primaryButtonStyle, padding: 10 }}>
                {editingLogId ? "更新する" : "記録する"}
              </button>
            </div>
          )}

          {groupedLogs.length === 0 && members.length > 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#6b6a66", fontSize: "0.9rem" }}>記録はまだありません</div>
          )}

          {groupedLogs.map(([year, yearLogs]) => {
            const collapsed = collapsedYears[year] === true;
            return (
              <div key={year} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div
                  onClick={() => setCollapsedYears((prev) => ({ ...prev, [year]: !prev[year] }))}
                  style={{
                    position: "sticky",
                    top: 0,
                    zIndex: 1,
                    background: "#18191c",
                    padding: "8px 0",
                    borderBottom: "1px solid #36373d",
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "#8b8a87",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                  }}
                >
                  <span>{collapsed ? "▶" : "▼"}</span>
                  <span>{year}年</span>
                  <span style={{ fontSize: "0.8rem", fontWeight: 400, color: "#8b8a87" }}>({yearLogs.length}件)</span>
                </div>

                {!collapsed &&
                  yearLogs.map((log) => {
                    const member = memberById.get(log.childId);
                    const ageLabel = formatExactAge(member?.birthDate, log.date);

                    return (
                      <div key={log.id} style={{ ...cardStyle, padding: 12, marginBottom: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: "0.9rem", color: "#8b8a87", fontFamily: "monospace", fontWeight: 700 }}>
                              {log.date.slice(5)}
                            </span>
                            {activeTab === ALL_TAB && (
                              <span style={{ fontSize: "0.7rem", background: "#36373d", color: "#e8e6e3", padding: "1px 6px", borderRadius: 4 }}>
                                {member?.name ?? "不明"}
                              </span>
                            )}
                            {ageLabel && <span style={{ fontSize: "0.75rem", color: "#8fc4a1", fontWeight: 700 }}>{ageLabel}</span>}
                          </div>
                          <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                            <button type="button" onClick={() => handleEditLog(log)} style={{ ...iconButtonStyle, color: "#8fb4d4", fontSize: "0.8rem" }}>
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDeleteLog(log.id)}
                              style={{ ...iconButtonStyle, color: "#6b6a66", fontSize: "0.8rem" }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>

                        <p style={{ fontSize: "0.95rem", lineHeight: 1.5, whiteSpace: "pre-wrap", color: "#e8e6e3", margin: "4px 0" }}>
                          {log.content}
                        </p>

                        {log.tags.length > 0 && (
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {log.tags.map((tag) => (
                              <span
                                key={String(tag)}
                                style={{
                                  fontSize: "0.65rem",
                                  color: tagDef(tag).color,
                                  border: `1px solid ${tagDef(tag).color}`,
                                  padding: "1px 6px",
                                  borderRadius: 8,
                                }}
                              >
                                {tagDef(tag).label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      </div>

      {showManageModal && (
        <div style={modalOverlayStyle} onClick={() => setShowManageModal(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={sectionTitleStyle}>メンバー管理</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "60vh", overflowY: "auto", marginBottom: 16 }}>
              {members.length === 0 && <p style={{ textAlign: "center", color: "#8b8a87" }}>メンバーがいません</p>}
              {members.map((member) => (
                <div
                  key={member.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#2a2b30",
                    padding: 10,
                    borderRadius: 8,
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{member.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "#8b8a87" }}>{member.birthDate ?? "誕生日未設定"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMember(member);
                        setMemberName(member.name);
                        setMemberBirth(member.birthDate ?? "");
                        setShowMemberForm(true);
                      }}
                      style={{ ...secondaryButtonStyle, padding: "4px 8px", fontSize: "0.8rem" }}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteMember(member.id)}
                      style={{ ...secondaryButtonStyle, padding: "4px 8px", fontSize: "0.8rem", color: DANGER_COLOR, borderColor: DANGER_COLOR }}
                    >
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setEditingMember(null);
                  setMemberName("");
                  setMemberBirth("");
                  setShowMemberForm(true);
                }}
                style={{ ...primaryButtonStyle, flex: 1 }}
              >
                ＋ メンバーを追加
              </button>
              <button type="button" onClick={() => setShowManageModal(false)} style={{ ...secondaryButtonStyle, flex: 1 }}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {showMemberForm && (
        <div style={modalOverlayStyle} onClick={() => setShowMemberForm(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={sectionTitleStyle}>{editingMember ? "メンバー編集" : "メンバー追加"}</h3>
            <form onSubmit={(e) => void handleSaveMember(e)} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Field label="名前" name="memberName">
                <input
                  style={inputStyle}
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  required
                  placeholder="例: 太郎"
                  autoFocus
                />
              </Field>
              <Field label="生年月日" name="memberBirth">
                <input type="date" style={inputStyle} value={memberBirth} onChange={(e) => setMemberBirth(e.target.value)} />
                <p style={{ fontSize: "0.75rem", color: "#8b8a87", marginTop: 4 }}>※設定すると、記録時に年齢が自動計算されます</p>
              </Field>

              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" style={{ ...primaryButtonStyle, flex: 1 }}>
                  保存
                </button>
                <button type="button" onClick={() => setShowMemberForm(false)} style={{ ...secondaryButtonStyle, flex: 1 }}>
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GrowthSection;
