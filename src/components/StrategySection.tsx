// src/components/StrategySection.tsx — 真理図鑑
//
// 2026年10月21日に「指針」から作り直し。人生で見つけた真理を集めて育てる図鑑。
//   * 1つの真理＝一言（または「〇〇とは」）＋どうやって気づいたか＋分野＋出どころ＋見つけた日＋きっかけのライフログ
//   * 「また実感した」を足すほど確かさが上がる（データは notes。指針の頃の振り返りメモもそのまま実感として数える）
//   * 中身のない「〇〇とは」は「まだ見つけてない真理」として下に並べる
// 名言は別セクション（QuoteSection）。気持ちから開く入口はなくした（付けた気持ち・「何があった？」の記録はデータに残してある）。
// 内部の名前（strategies / StrategySection / view "strategy"）は旧データ・バックアップとの互換のため変えていない。
import React, { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLifeStore } from "../domain/LifeStoreContext";
import { TRUTH_FIELDS, type LifeLog, type StrategyItem, type StrategyKind, type TruthField } from "../domain/models";
import { useBackClose } from "../hooks/useBackClose";
import SectionHeader from "./SectionHeader";
import TruthDetail from "./strategy/TruthDetail";
import TruthEditor from "./strategy/TruthEditor";
import { useStrategyItems } from "./strategy/useStrategyItems";
import { FIELD_LABELS, certainty, formatNo, isTruth, isUnfound, numberTruths, truthLead, truthText } from "./strategy/common";
import {
  outerStyle,
  scrollAreaStyle,
  contentMaxWidth,
  addButtonStyle,
  chipStyle,
  chipRowStyle,
  errorTextStyle,
  emptyStateStyle,
  SURFACE,
  LINE,
  LINE_2,
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_SUB,
  ACCENT,
  SECTION_COLORS,
} from "./uiStyles";

type Props = { onBack: () => void };
type Order = "certainty" | "new" | "year";

const ORDERS: Array<{ key: Order; label: string }> = [
  { key: "certainty", label: "確かさ順" },
  { key: "new", label: "新しい順" },
  { key: "year", label: "年ごと" },
];

const TruthCard: React.FC<{ item: StrategyItem; no?: number; onClick: () => void }> = ({ item, no, onClick }) => {
  const field = item.field ? FIELD_LABELS[item.field] : null;
  const count = certainty(item);
  const lead = truthLead(item);
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        background: SURFACE,
        border: `1px solid ${LINE}`,
        borderLeft: `3px solid ${field?.color ?? LINE_2}`,
        borderRadius: 12,
        padding: "12px 14px",
        color: TEXT_MAIN,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.72rem", color: TEXT_MUTED }}>
        <span style={{ letterSpacing: "0.06em" }}>{formatNo(no)}</span>
        {field && <span style={{ color: field.color }}>{field.label}</span>}
        <span style={{ flex: 1 }} />
        {count > 1 && <span style={{ color: TEXT_SUB }}>{count}回実感</span>}
      </div>
      <div style={{ lineHeight: 1.55 }}>
        {lead && <span style={{ color: TEXT_MUTED, fontSize: "0.85rem", marginRight: 6 }}>{lead}</span>}
        <span style={{ fontWeight: 700, fontSize: "1rem" }}>{truthText(item)}</span>
      </div>
    </button>
  );
};

const StrategySection: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const store = useLifeStore();
  const { items, loading, saving, error, save, remove, addReconfirm, removeReconfirm } = useStrategyItems();

  const [order, setOrder] = useState<Order>("certainty");
  const [fieldFilter, setFieldFilter] = useState<TruthField | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ item: StrategyItem | null; kind?: StrategyKind } | null>(null);
  const [lifeLogs, setLifeLogs] = useState<LifeLog[]>([]);

  useEffect(() => {
    if (!user) return;
    void store
      .getLifeLogs(user.uid)
      .then(setLifeLogs)
      .catch((e: unknown) => console.error(e));
  }, [user, store]);

  useBackClose(openId !== null, () => setOpenId(null));
  useBackClose(editing !== null, () => setEditing(null));

  const numbers = useMemo(() => numberTruths(items), [items]);
  const truths = useMemo(() => items.filter((i) => isTruth(i) && !isUnfound(i)), [items]);
  const unfound = useMemo(() => items.filter(isUnfound).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [items]);

  const shown = useMemo(() => {
    const list = truths.filter((i) => !fieldFilter || i.field === fieldFilter);
    const byNew = (a: StrategyItem, b: StrategyItem) =>
      (b.foundDate || "").localeCompare(a.foundDate || "") || b.createdAt.localeCompare(a.createdAt);
    if (order === "certainty") return [...list].sort((a, b) => certainty(b) - certainty(a) || Number(b.pinned) - Number(a.pinned) || byNew(a, b));
    return [...list].sort(byNew);
  }, [truths, fieldFilter, order]);

  const byYear = useMemo(() => {
    const groups = new Map<string, StrategyItem[]>();
    for (const item of shown) {
      const year = item.foundDate ? item.foundDate.slice(0, 4) : "日付なし";
      groups.set(year, [...(groups.get(year) ?? []), item]);
    }
    return [...groups.entries()];
  }, [shown]);

  const fieldCounts = useMemo(() => {
    const counts = new Map<TruthField, number>();
    for (const t of truths) if (t.field) counts.set(t.field, (counts.get(t.field) ?? 0) + 1);
    return counts;
  }, [truths]);

  const openItem = items.find((i) => i.id === openId) ?? null;

  const list = (rows: StrategyItem[]) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 8 }}>
      {rows.map((item) => (
        <TruthCard key={item.id} item={item} no={numbers.get(item.id)} onClick={() => setOpenId(item.id)} />
      ))}
    </div>
  );

  return (
    <div style={outerStyle}>
      <SectionHeader
        title="真理図鑑"
        onBack={onBack}
        accentColor={SECTION_COLORS.strategy}
        action={
          <button type="button" onClick={() => setEditing({ item: null })} style={addButtonStyle}>
            ＋ 見つけた
          </button>
        }
      >
        <div style={chipRowStyle}>
          <button type="button" onClick={() => setFieldFilter(null)} style={chipStyle(fieldFilter === null)}>
            すべて
          </button>
          {TRUTH_FIELDS.filter((f) => fieldCounts.has(f)).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFieldFilter(fieldFilter === f ? null : f)}
              style={chipStyle(fieldFilter === f, FIELD_LABELS[f].color)}
            >
              {FIELD_LABELS[f].label} {fieldCounts.get(f)}
            </button>
          ))}
        </div>
      </SectionHeader>

      <div style={scrollAreaStyle}>
        <div style={{ width: "100%", maxWidth: contentMaxWidth, paddingBottom: 48 }}>
          {error && <p style={errorTextStyle}>{error}</p>}

          {loading ? (
            <p style={{ textAlign: "center", color: TEXT_MUTED, marginTop: 24 }}>読み込み中…</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, margin: "4px 2px 14px" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", color: TEXT_MUTED }}>見つけた真理</div>
                  <div style={{ fontSize: "1.8rem", fontWeight: 800, lineHeight: 1.1 }}>
                    {truths.length}
                    <span style={{ fontSize: "0.9rem", fontWeight: 500, color: TEXT_MUTED, marginLeft: 4 }}>個</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {ORDERS.map((o) => (
                    <button key={o.key} type="button" onClick={() => setOrder(o.key)} style={chipStyle(order === o.key)}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {shown.length === 0 ? (
                <p style={emptyStateStyle}>
                  {truths.length === 0 ? "まだ真理がありません。生きてきて「これは確かだ」と思ったことを一言で残そう。" : "この分野の真理はまだありません。"}
                </p>
              ) : order === "year" ? (
                byYear.map(([year, rows]) => (
                  <section key={year} style={{ marginBottom: 18 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, margin: "0 2px 8px" }}>
                      <span style={{ fontWeight: 700 }}>{year}</span>
                      <span style={{ fontSize: "0.78rem", color: TEXT_MUTED }}>{rows.length}個見つけた</span>
                    </div>
                    {list(rows)}
                  </section>
                ))
              ) : (
                list(shown)
              )}

              {unfound.length > 0 && !fieldFilter && (
                <section style={{ marginTop: 28 }}>
                  <div style={{ fontSize: "0.8rem", fontWeight: 600, color: TEXT_SUB, margin: "0 2px 4px" }}>まだ見つけてない真理</div>
                  <div style={{ fontSize: "0.75rem", color: TEXT_MUTED, margin: "0 2px 10px" }}>答えが見つかったら、タップして書き込もう</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {unfound.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setEditing({ item })}
                        style={{
                          padding: "8px 14px",
                          borderRadius: 999,
                          border: `1px dashed ${LINE_2}`,
                          background: "transparent",
                          color: TEXT_SUB,
                          fontSize: "0.88rem",
                        }}
                      >
                        {item.title}とは？
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditing({ item: null, kind: "definition" })}
                      style={{ padding: "8px 14px", borderRadius: 999, border: `1px dashed ${ACCENT}66`, background: "transparent", color: ACCENT, fontSize: "0.88rem" }}
                    >
                      ＋ 問いを足す
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>

      {openItem && !editing && (
        <TruthDetail
          item={openItem}
          no={numbers.get(openItem.id)}
          lifeLog={lifeLogs.find((l) => l.id === openItem.lifeLogId)}
          saving={saving}
          onReconfirm={(text) => addReconfirm(openItem, text)}
          onRemoveReconfirm={(noteId) => void removeReconfirm(openItem, noteId)}
          onEdit={() => setEditing({ item: openItem })}
          onClose={() => setOpenId(null)}
        />
      )}

      {editing && (
        <TruthEditor
          item={editing.item}
          defaultKind={editing.kind}
          lifeLogs={lifeLogs}
          saving={saving}
          onSave={(input) =>
            void save(editing.item?.id ?? null, input).then((ok) => {
              if (ok) setEditing(null);
            })
          }
          onDelete={
            editing.item
              ? () =>
                  void remove(editing.item!.id).then((ok) => {
                    if (ok) {
                      setEditing(null);
                      setOpenId(null);
                    }
                  })
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
};

export default StrategySection;
