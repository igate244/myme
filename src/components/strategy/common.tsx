// src/components/strategy/common.tsx — 真理図鑑・名言で共通に使う部品
import type { StrategyItem, TruthField, TruthOrigin } from "../../domain/models";
import { ACCENT } from "../uiStyles";
import type React from "react";

export const FIELD_LABELS: Record<TruthField, { label: string; color: string }> = {
  work: { label: "仕事", color: "#8fb4d4" },
  family: { label: "家族", color: "#d9bd7a" },
  money: { label: "お金", color: "#8fc4a1" },
  people: { label: "人間関係", color: "#d39bb8" },
  body_mind: { label: "心と体", color: "#8cc5c0" },
  life: { label: "生き方", color: "#b4a0d8" },
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
