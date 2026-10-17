// src/infrastructure/db.ts
//
// IndexedDB（Dexie）のスキーマ定義。
//
// 過去のバージョン定義は消さずに残すこと。Dexie は宣言されたバージョンを順に適用して
// 既存のデータベースを移行するため、古い定義を消すと既存データの移行経路が失われる。

import Dexie from "dexie";
import type { Table } from "dexie";
import type {
  UserProfile, LifeLog, BucketItem, StrategyItem, Companion,
  Experiment, LegacyItem, CounterItem, CounterLog, GrowthLog, FamilyMember,
} from "../domain/models";

export type MymeDatabase = Dexie & {
  userProfile: Table<UserProfile, string>;
  lifeLogs: Table<LifeLog, string>;
  bucketList: Table<BucketItem, string>;
  strategies: Table<StrategyItem, string>;
  companions: Table<Companion, string>;
  experiments: Table<Experiment, string>;
  legacies: Table<LegacyItem, string>;
  counterItems: Table<CounterItem, string>;
  counterLogs: Table<CounterLog, number>;
  growthLogs: Table<GrowthLog, string>;
  familyMembers: Table<FamilyMember, string>;
};

export const db = new Dexie("MymeDatabase") as MymeDatabase;

// --- v2: これまで使われていたスキーマ（既存データの移行元として残す） ---
db.version(2).stores({
  lifeLogs: "id, date, tags, userId",
  bucketList: "id, status, userId",
  strategies: "id, type, userId",
  companions: "id, category, userId",
  experiments: "id, status, userId",
  userProfile: "id",
  legacies: "id, userId",
  counterItems: "id, userId",
  counterLogs: "++id, itemId, date",
  growthLogs: "id, childId, date, tags",
  familyMembers: "id, order",
});

// --- v3 の変更点 ---
//  * strategies の "type" は実在しない項目を指していた索引なので category に修正
//  * lifeLogs / growthLogs の "tags" は配列をそのまま索引化していて検索に使えなかったため除去
//  * counterLogs に [itemId+date] の複合索引を追加（特定日の記録の取得・置き換えが速くなる）
//  * counterItems に order 索引を追加（並び替えの保存に対応）
db.version(3).stores({
  lifeLogs: "id, userId, date",
  bucketList: "id, userId, status",
  strategies: "id, userId, category",
  companions: "id, userId, category",
  experiments: "id, userId, status",
  userProfile: "id",
  legacies: "id, userId, forWho",
  counterItems: "id, userId, order",
  counterLogs: "++id, itemId, date, [itemId+date]",
  growthLogs: "id, childId, date",
  familyMembers: "id, order",
});
