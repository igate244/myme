// src/components/StrategySection.tsx — 指針
//
// 2026年10月に作り直し。「分類して保管する棚」から「しんどい時・調子いい時に開いて読む」画面へ。
//   * 気持ちタブ：気持ちを選ぶ → 一呼吸 → 効く言葉をめくる → 「何があった？」（FeelingFlow）
//   * 教訓・定義タブ：一覧と編集。名言は別セクション（QuoteSection）に分けたが、気持ちのめくりには混ぜて出す
//   * ふりかえりタブ：「何があった？」に残した一言
// 旧データの「採用／不採用・重要度」は画面から外した（データは保持、重要度：大はピン留めに引き継ぎ）。
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLifeStore } from "../domain/LifeStoreContext";
import type { Emotion, EmotionGroup, MoodLog, StrategyItem, StrategyKind, UserProfile } from "../domain/models";
import { newId } from "../utils/id";
import { useBackClose } from "../hooks/useBackClose";
import SectionHeader from "./SectionHeader";
import FeelingFlow from "./strategy/FeelingFlow";
import ItemEditor from "./strategy/ItemEditor";
import { useStrategyItems } from "./strategy/useStrategyItems";
import { EmotionTag, GOOD_COLOR, HARD_COLOR, ItemRow, accentLink, emotionColor, todayString, useEmotions } from "./strategy/common";
import {
  outerStyle,
  scrollAreaStyle,
  contentMaxWidth,
  addButtonStyle,
  errorTextStyle,
  emptyStateStyle,
  modalOverlayStyle,
  modalContentStyle,
  sectionTitleStyle,
  inputStyle,
  labelStyle,
  primaryButtonStyle,
  secondaryButtonStyle,
  SURFACE,
  LINE,
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_SUB,
  ACCENT,
  DANGER_COLOR,
  SECTION_COLORS,
} from "./uiStyles";

type Props = { onBack: () => void };
type Tab = "feel" | "lesson" | "definition" | "log";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "feel", label: "気持ち" },
  { key: "lesson", label: "教訓" },
  { key: "definition", label: "定義" },
  { key: "log", label: "ふりかえり" },
];

const GROUPS: Array<{ group: EmotionGroup; label: string; color: string }> = [
  { group: "hard", label: "しんどい時", color: HARD_COLOR },
  { group: "good", label: "調子いい時", color: GOOD_COLOR },
];

/* ------------------------------------------------------- 気持ちの編集 */

const EmotionSettings: React.FC<{
  custom: Emotion[];
  onSave: (next: Emotion[]) => Promise<void>;
  onClose: () => void;
}> = ({ custom, onSave, onClose }) => {
  const [list, setList] = useState(custom);
  const [label, setLabel] = useState("");
  const [group, setGroup] = useState<EmotionGroup>("hard");

  return (
    <div style={modalOverlayStyle} onClick={onClose}>
      <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
        <h3 style={sectionTitleStyle}>気持ちを足す</h3>
        <p style={{ color: TEXT_MUTED, fontSize: "0.82rem", marginTop: -6, lineHeight: 1.7 }}>
          決まっている8つ以外に、自分で足した気持ち。消しても、付けていた言葉は残る。
        </p>
        {list.length > 0 && (
          <div style={{ borderTop: `1px solid ${LINE}`, marginBottom: 16 }}>
            {list.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${LINE}` }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: emotionColor(e) }} />
                <span style={{ flex: 1 }}>{e.label}</span>
                <button
                  type="button"
                  onClick={() => setList((prev) => prev.filter((x) => x.id !== e.id))}
                  style={{ background: "transparent", border: "none", color: DANGER_COLOR, fontSize: "0.85rem" }}
                >
                  消す
                </button>
              </div>
            ))}
          </div>
        )}
        <label style={labelStyle}>新しい気持ち</label>
        <input style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：寂しい" />
        <div style={{ display: "flex", gap: 8, margin: "10px 0 16px" }}>
          {GROUPS.map((g) => (
            <button
              key={g.group}
              type="button"
              onClick={() => setGroup(g.group)}
              style={{
                ...secondaryButtonStyle,
                flex: 1,
                color: group === g.group ? g.color : TEXT_MUTED,
                borderColor: group === g.group ? g.color : undefined,
              }}
            >
              {g.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={!label.trim()}
          onClick={() => {
            setList((prev) => [...prev, { id: `c-${newId().slice(0, 8)}`, label: label.trim(), group, hint: "" }]);
            setLabel("");
          }}
          style={{ ...secondaryButtonStyle, width: "100%", marginBottom: 16 }}
        >
          ＋ 一覧に足す
        </button>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={() => void onSave(list).then(onClose)} style={{ ...primaryButtonStyle, flex: 2 }}>
            保存
          </button>
          <button type="button" onClick={onClose} style={{ ...secondaryButtonStyle, flex: 1 }}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------- 本体 */

const StrategySection: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const store = useLifeStore();
  const { items, loading, saving, error, save, remove, addNote, saveDefinition } = useStrategyItems();
  const { all: emotions, custom, labelOf, saveCustom } = useEmotions();

  const [tab, setTab] = useState<Tab>("feel");
  const [flowEmotion, setFlowEmotion] = useState<Emotion | null | undefined>(undefined);
  const [editing, setEditing] = useState<{ kind: StrategyKind; item: StrategyItem | null } | null>(null);
  const [showEmotionSettings, setShowEmotionSettings] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [moodLogs, setMoodLogs] = useState<MoodLog[]>([]);

  useEffect(() => {
    if (!user) return;
    void store
      .getUserProfile(user.uid)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [user, store]);

  const loadMoodLogs = useCallback(() => {
    void store
      .getMoodLogs()
      .then(setMoodLogs)
      .catch((e: unknown) => console.error(e));
  }, [store]);

  useEffect(() => {
    loadMoodLogs();
  }, [loadMoodLogs]);

  const lessons = useMemo(
    () =>
      items
        .filter((i) => i.kind === "lesson")
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)),
    [items],
  );
  const definitions = useMemo(
    () =>
      items
        .filter((i) => i.kind === "definition")
        // 書いてあるものを上、空のものは下
        .sort(
          (a, b) =>
            Number(b.pinned) - Number(a.pinned) || Number(!!b.detail) - Number(!!a.detail) || a.createdAt.localeCompare(b.createdAt),
        ),
    [items],
  );

  // Androidの戻るボタンで、めくり画面・編集シートを閉じる
  useBackClose(flowEmotion !== undefined, () => setFlowEmotion(undefined));
  useBackClose(editing !== null, () => setEditing(null));
  useBackClose(showEmotionSettings, () => setShowEmotionSettings(false));

  const countFor = (id: string): number => items.filter((i) => i.emotions.includes(id)).length;

  const saveMood = async (text: string): Promise<void> => {
    await store.saveMoodLog({
      id: newId(),
      date: todayString(),
      emotion: flowEmotion?.id ?? "",
      text,
      createdAt: Date.now(),
    });
    loadMoodLogs();
  };

  const deleteMood = async (id: string): Promise<void> => {
    if (!window.confirm("この記録を消しますか？")) return;
    await store.deleteMoodLog(id);
    setMoodLogs((prev) => prev.filter((m) => m.id !== id));
  };

  const listCard = (rows: StrategyItem[], kind: StrategyKind, emptyText: string) =>
    rows.length === 0 ? (
      <p style={emptyStateStyle}>{emptyText}</p>
    ) : (
      <div style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 14, overflow: "hidden" }}>
        <div style={{ marginTop: -1 }}>
          {rows.map((item) => (
            <ItemRow key={item.id} item={item} emotions={emotions} onClick={() => setEditing({ kind, item })} />
          ))}
        </div>
      </div>
    );

  return (
    <div style={outerStyle}>
      <SectionHeader
        title="指針"
        onBack={onBack}
        accentColor={SECTION_COLORS.strategy}
        action={
          tab === "lesson" || tab === "definition" ? (
            <button type="button" onClick={() => setEditing({ kind: tab, item: null })} style={addButtonStyle}>
              ＋ 追加
            </button>
          ) : undefined
        }
      >
        <div style={{ display: "flex", borderBottom: `1px solid ${LINE}` }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                style={{
                  flex: 1,
                  padding: "8px 0 10px",
                  background: "transparent",
                  border: "none",
                  borderBottom: `2px solid ${active ? ACCENT : "transparent"}`,
                  color: active ? TEXT_MAIN : TEXT_MUTED,
                  fontWeight: active ? 700 : 500,
                  fontSize: "0.9rem",
                  marginBottom: -1,
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </SectionHeader>

      <div style={scrollAreaStyle}>
        <div style={{ width: "100%", maxWidth: contentMaxWidth, paddingBottom: 48 }}>
          {error && <p style={errorTextStyle}>{error}</p>}

          {loading ? (
            <p style={{ textAlign: "center", color: TEXT_MUTED, marginTop: 24 }}>読み込み中…</p>
          ) : tab === "feel" ? (
            <>
              <p style={{ textAlign: "center", color: TEXT_SUB, fontSize: "1rem", margin: "8px 0 18px" }}>今、どんな気持ち？</p>
              {GROUPS.map((g) => (
                <section key={g.group} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: "0.75rem", color: TEXT_MUTED, fontWeight: 600, margin: "0 4px 8px" }}>{g.label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                    {emotions
                      .filter((e) => e.group === g.group)
                      .map((e) => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => setFlowEmotion(e)}
                          style={{
                            minHeight: 64,
                            padding: "12px 14px",
                            background: SURFACE,
                            border: `1px solid ${LINE}`,
                            borderLeft: `3px solid ${g.color}`,
                            borderRadius: 12,
                            color: TEXT_MAIN,
                            textAlign: "left",
                            display: "flex",
                            flexDirection: "column",
                            justifyContent: "center",
                            gap: 2,
                          }}
                        >
                          <span style={{ fontWeight: 700, fontSize: "1rem" }}>{e.label}</span>
                          <span style={{ fontSize: "0.72rem", color: TEXT_MUTED }}>{countFor(e.id)}件</span>
                        </button>
                      ))}
                  </div>
                </section>
              ))}
              <button type="button" onClick={() => setFlowEmotion(null)} style={{ ...secondaryButtonStyle, width: "100%" }}>
                気持ちを選ばずに全部めくる
              </button>
              <div style={{ textAlign: "center", marginTop: 8 }}>
                <button type="button" onClick={() => setShowEmotionSettings(true)} style={accentLink}>
                  気持ちを足す・消す
                </button>
              </div>
            </>
          ) : tab === "lesson" ? (
            listCard(lessons, "lesson", "まだ教訓がありません。失敗したことや、やってよかったことを一言で残そう。")
          ) : tab === "definition" ? (
            listCard(definitions, "definition", "まだ定義がありません。")
          ) : moodLogs.length === 0 ? (
            <p style={emptyStateStyle}>
              まだ記録がありません。
              <br />
              気持ちを選んで読んだあとの「何があった？」がここに残る。
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {moodLogs.map((log) => {
                const e = emotions.find((x) => x.id === log.emotion);
                return (
                  <div key={log.id} style={{ background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 12, padding: "12px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: "0.8rem", color: TEXT_MUTED }}>{log.date.replaceAll("-", "/")}</span>
                      {log.emotion && <EmotionTag emotion={e} label={labelOf(log.emotion)} />}
                      <span style={{ flex: 1 }} />
                      <button
                        type="button"
                        onClick={() => void deleteMood(log.id)}
                        style={{ background: "transparent", border: "none", color: TEXT_MUTED, fontSize: "0.8rem" }}
                        aria-label="消す"
                      >
                        ✕
                      </button>
                    </div>
                    <div style={{ lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{log.text}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {flowEmotion !== undefined && (
        <FeelingFlow
          emotion={flowEmotion}
          items={items}
          profile={profile}
          onSaveDefinition={saveDefinition}
          onAddNote={addNote}
          onSaveMood={saveMood}
          onClose={() => setFlowEmotion(undefined)}
        />
      )}

      {editing && (
        <ItemEditor
          kind={editing.kind}
          item={editing.item}
          emotions={emotions}
          saving={saving}
          onSave={(input) => void save(editing.item?.id ?? null, input).then((ok) => ok && setEditing(null))}
          onDelete={editing.item ? () => void remove(editing.item!.id).then((ok) => ok && setEditing(null)) : undefined}
          onClose={() => setEditing(null)}
        />
      )}

      {showEmotionSettings && <EmotionSettings custom={custom} onSave={saveCustom} onClose={() => setShowEmotionSettings(false)} />}
    </div>
  );
};

export default StrategySection;
