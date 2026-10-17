// src/views.ts — 画面の識別子（App と HomeMenu の両方から参照する）

export type SectionView =
  | "lifeLog"
  | "bucketList"
  | "strategy"
  | "quotes"
  | "profile"
  | "legacy"
  | "growth";

export type View = "home" | SectionView;
