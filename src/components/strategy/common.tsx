// src/components/strategy/common.tsx — 真理図鑑・名言で共通に使う部品
import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { useLifeStore } from "../../domain/LifeStoreContext";
import { DEFAULT_TRUTH_FIELDS, type StrategyItem, type TruthField, type TruthOrigin } from "../../domain/models";
import { ACCENT } from "../uiStyles";

/** 分野に選べる色（落ち着いた色だけ） */
export const FIELD_COLORS = ["#8fb4d4", "#d9bd7a", "#8fc4a1", "#d39bb8", "#8cc5c0", "#b4a0d8", "#d9a07a", "#a9a7a3"];

/** 分野の一覧（自分で編集できる）。画面の間で同じ内容を使えるよう、読み込んだものを共有する */
let cachedFields: TruthField[] | null = null;
const FIELDS_EVENT = "myme-truth-fields";

export const useTruthFields = () => {
  const store = useLifeStore();
  const [fields, setFields] = useState<TruthField[]>(cachedFields ?? DEFAULT_TRUTH_FIELDS);

  useEffect(() => {
    let cancelled = false;
    void store
      .getTruthFields()
      .then((list) => {
        cachedFields = list;
        if (!cancelled) setFields(list);
      })
      .catch((e: unknown) => console.error("分野の読み込みに失敗しました", e));
    const sync = (): void => {
      if (cachedFields) setFields(cachedFields);
    };
    window.addEventListener(FIELDS_EVENT, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(FIELDS_EVENT, sync);
    };
  }, [store]);

  const save = useCallback(
    async (next: TruthField[]) => {
      await store.saveTruthFields(next);
      cachedFields = next;
      setFields(next);
      window.dispatchEvent(new Event(FIELDS_EVENT));
    },
    [store],
  );

  /** 項目に付いている分野（消した分野は出さない）。並びは分野一覧の順 */
  const fieldsOf = useCallback((item: StrategyItem): TruthField[] => fields.filter((f) => item.fields.includes(f.id)), [fields]);

  return { fields, save, fieldsOf };
};

export const ORIGIN_LABELS: Record<TruthOrigin, string> = {
  experience: "自分の経験",
  person: "人から教わった",
  book: "本・作品から",
};

/** 真理図鑑に並ぶもの（名言は別セクション） */
export const isTruth = (item: StrategyItem): boolean => item.kind !== "quote";

/** まだ中身のない定義（「〇〇とは？」）は「まだ見つけてない真理」 */
export const isUnfound = (item: StrategyItem): boolean => item.kind === "definition" && !item.detail;

/** 真理として見せる本文。定義は「〇〇とは」の中身、それ以外は一言 */
export const truthText = (item: StrategyItem): string => (item.kind === "definition" ? (item.detail ?? "") : item.title);

/** 定義のときだけ本文の上に出す見出し（「仕事とは」） */
export const truthLead = (item: StrategyItem): string | null => (item.kind === "definition" ? `${item.title}とは` : null);

/** 確かさ＝見つけた1回＋また実感した回数 */
export const certainty = (item: StrategyItem): number => 1 + item.notes.length;

/** 図鑑の番号（見つけた順。中身のある真理だけで数える） */
export const numberTruths = (items: StrategyItem[]): Map<string, number> => {
  const found = items
    .filter((i) => isTruth(i) && !isUnfound(i))
    .sort((a, b) => (a.foundDate || "9999").localeCompare(b.foundDate || "9999") || a.createdAt.localeCompare(b.createdAt));
  return new Map(found.map((item, index) => [item.id, index + 1]));
};

export const formatNo = (n: number | undefined): string => (n ? `No.${String(n).padStart(3, "0")}` : "");

export const todayString = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const formatDate = (date: string): string => (date ? date.replaceAll("-", "/") : "");

/** 日付ごとに同じ1枚を選ぶ（今日の一枚） */
export const pickOfTheDay = <T,>(list: T[], date = todayString()): T | undefined => {
  if (list.length === 0) return undefined;
  let hash = 0;
  for (const ch of date) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return list[hash % list.length];
};

export const accentLink: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: ACCENT,
  fontSize: "0.85rem",
  padding: "6px 0",
};
