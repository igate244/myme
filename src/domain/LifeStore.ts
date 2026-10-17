// src/domain/LifeStore.ts
//
// 画面側が使うデータ操作の窓口。実装（IndexedDB / Dexie）は infrastructure 側にある。
// 画面はこのインターフェースだけを見るので、保存先を差し替えても画面は変えなくて済む。

import type {
  UserProfile, UserProfileInput,
  LifeLog, LifeLogInput,
  BucketItem, BucketItemInput,
  StrategyItem, StrategyItemInput,
  Companion, CompanionInput,
  LegacyItem, LegacyItemInput,
  CounterItem, CounterItemInput, CounterLog,
  GrowthLog, FamilyMember,
  ExportedData,
} from "./models";

export interface LifeStore {
  /* ---------------------------------------------------------- プロフィール */
  getUserProfile(userId: string): Promise<UserProfile | null>;
  saveUserProfile(userId: string, input: UserProfileInput): Promise<UserProfile>;

  /* ------------------------------------------------------------ 冒険の記録 */
  getLifeLogs(userId: string): Promise<LifeLog[]>;
  addLifeLog(userId: string, input: LifeLogInput): Promise<LifeLog>;
  updateLifeLog(userId: string, itemId: string, input: LifeLogInput): Promise<LifeLog>;
  deleteLifeLog(userId: string, itemId: string): Promise<void>;

  /* -------------------------------------------------------------- クエスト */
  getBucketList(userId: string): Promise<BucketItem[]>;
  addBucketItem(userId: string, input: BucketItemInput): Promise<BucketItem>;
  updateBucketItem(userId: string, itemId: string, input: BucketItemInput): Promise<BucketItem>;
  deleteBucketItem(userId: string, itemId: string): Promise<void>;

  /* -------------------------------------------------------------- 攻略の書 */
  getStrategies(userId: string): Promise<StrategyItem[]>;
  addStrategyItem(userId: string, input: StrategyItemInput): Promise<StrategyItem>;
  updateStrategyItem(userId: string, itemId: string, input: StrategyItemInput): Promise<StrategyItem>;
  deleteStrategyItem(userId: string, itemId: string): Promise<void>;

  /* ------------------------------------------------------------ 人物図鑑 */
  getCompanions(userId: string): Promise<Companion[]>;
  addCompanion(userId: string, input: CompanionInput): Promise<Companion>;
  updateCompanion(userId: string, itemId: string, input: CompanionInput): Promise<Companion>;
  deleteCompanion(userId: string, itemId: string): Promise<void>;

  /* -------------------------------------------------------------- 伝承の書 */
  getLegacies(userId: string): Promise<LegacyItem[]>;
  addLegacyItem(userId: string, input: LegacyItemInput): Promise<LegacyItem>;
  /** 手紙の編集。ID と作成時刻は保ったまま内容だけ差し替える */
  updateLegacyItem(userId: string, itemId: string, input: LegacyItemInput): Promise<LegacyItem>;
  deleteLegacyItem(userId: string, itemId: string): Promise<void>;

  /* ------------------------------------------------------------ カウンター */
  getCounterItems(userId: string): Promise<CounterItem[]>;
  addCounterItem(userId: string, input: CounterItemInput): Promise<CounterItem>;
  /** 項目の編集。記録した履歴は保持される */
  updateCounterItem(userId: string, itemId: string, input: CounterItemInput): Promise<CounterItem>;
  updateCounterOrder(userId: string, orderedIds: string[]): Promise<void>;
  deleteCounterItem(userId: string, itemId: string): Promise<void>;

  /** 全項目の履歴をまとめて取得する（項目ごとに問い合わせると件数分の往復が発生するため） */
  getAllCounterLogs(userId: string): Promise<Record<string, CounterLog[]>>;
  getCounterLogs(userId: string, itemId: string): Promise<CounterLog[]>;
  /** 指定日に 1 件追加する。戻り値はその項目の最新の履歴一覧 */
  addCounterLog(userId: string, itemId: string, date: string, value?: number): Promise<CounterLog[]>;
  /** 指定日の記録を value 1 件に置き換える（value <= 0 ならその日の記録を消す） */
  setCounterLogValue(userId: string, itemId: string, date: string, value: number): Promise<CounterLog[]>;
  /** 指定日の記録を 1 件だけ取り消す */
  removeCounterLog(userId: string, itemId: string, date: string): Promise<CounterLog[]>;

  /* -------------------------------------------------------------- 育成記録 */
  getGrowthLogs(childId?: string): Promise<GrowthLog[]>;
  saveGrowthLog(log: GrowthLog): Promise<void>;
  deleteGrowthLog(id: string): Promise<void>;

  getFamilyMembers(): Promise<FamilyMember[]>;
  saveFamilyMember(member: FamilyMember): Promise<void>;
  deleteFamilyMember(id: string): Promise<void>;

  /* ---------------------------------------------------- バックアップ入出力 */
  exportAllData(userId: string): Promise<ExportedData>;
  importData(userId: string, data: unknown): Promise<void>;
}
