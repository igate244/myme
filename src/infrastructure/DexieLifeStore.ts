// src/infrastructure/DexieLifeStore.ts
//
// LifeStore を IndexedDB（Dexie）で実装したもの。
// 読み込み時は必ず normalizeXxx() を通して、古い形式で保存されたデータも
// 現在の形に揃えてから画面へ渡す。保存するのは現在の形の項目だけ。

import { newId as uuidv4 } from "../utils/id";
import { db } from "./db";
import type { LifeStore } from "../domain/LifeStore";
import type {
  UserProfile, UserProfileInput,
  LifeLog, LifeLogInput,
  BucketItem, BucketItemInput,
  StrategyItem, StrategyItemInput,
  Companion, CompanionInput,
  LegacyItem, LegacyItemInput,
  CounterItem, CounterItemInput, CounterLog,
  GrowthLog, FamilyMember,
  ExportedData, MoodLog, Emotion, TruthField,
} from "../domain/models";
import {
  normalizeUserProfile, normalizeLifeLog, normalizeBucketItem, normalizeStrategyItem,
  normalizeMoodLog, normalizeCustomEmotions, normalizeTruthFields,
  normalizeCompanion, normalizeExperiment, normalizeLegacyItem,
  normalizeCounterItem, normalizeCounterLog, normalizeGrowthLog, normalizeFamilyMember,
  rawArray,
} from "../domain/models";

/** 日付の新しい順。同日なら作成が新しい順。 */
const byDateDesc = (a: { date: string; createdAt: number }, b: { date: string; createdAt: number }): number =>
  b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

const isNotNull = <T>(value: T | null): value is T => value !== null;

export class DexieLifeStore implements LifeStore {
  /* ---------------------------------------------------------- プロフィール */

  async getUserProfile(userId: string): Promise<UserProfile | null> {
    const row = await db.userProfile.get(userId);
    return row ? normalizeUserProfile(row, userId) : null;
  }

  async saveUserProfile(userId: string, input: UserProfileInput): Promise<UserProfile> {
    const existing = await db.userProfile.get(userId);
    const now = new Date().toISOString();
    const profile: UserProfile = {
      ...input,
      id: userId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.userProfile.put(profile);
    return profile;
  }

  /* ------------------------------------------------------------ 冒険の記録 */

  async getLifeLogs(userId: string): Promise<LifeLog[]> {
    const rows = await db.lifeLogs.where("userId").equals(userId).toArray();
    return rows.map((row) => normalizeLifeLog(row, userId)).sort(byDateDesc);
  }

  async addLifeLog(userId: string, input: LifeLogInput): Promise<LifeLog> {
    const log: LifeLog = {
      id: uuidv4(),
      userId,
      date: input.date,
      title: input.title,
      detail: input.detail,
      tags: input.tags,
      createdAt: Date.now(),
    };
    await db.lifeLogs.put(log);
    return log;
  }

  async updateLifeLog(userId: string, itemId: string, input: LifeLogInput): Promise<LifeLog> {
    const existing = await db.lifeLogs.get(itemId);
    if (!existing) throw new Error("記録が見つかりませんでした");
    const updated: LifeLog = { ...normalizeLifeLog(existing, userId), ...input };
    await db.lifeLogs.put(updated);
    return updated;
  }

  async deleteLifeLog(_userId: string, itemId: string): Promise<void> {
    await db.lifeLogs.delete(itemId);
  }

  /* -------------------------------------------------------------- クエスト */

  async getBucketList(userId: string): Promise<BucketItem[]> {
    const rows = await db.bucketList.where("userId").equals(userId).toArray();
    return rows.map((row) => normalizeBucketItem(row, userId));
  }

  async addBucketItem(userId: string, input: BucketItemInput): Promise<BucketItem> {
    const item: BucketItem = { ...input, id: uuidv4(), userId, createdAt: Date.now() };
    await db.bucketList.put(item);
    return item;
  }

  async updateBucketItem(userId: string, itemId: string, input: BucketItemInput): Promise<BucketItem> {
    const existing = await db.bucketList.get(itemId);
    if (!existing) throw new Error("クエストが見つかりませんでした");
    const updated: BucketItem = { ...normalizeBucketItem(existing, userId), ...input };
    await db.bucketList.put(updated);
    return updated;
  }

  async deleteBucketItem(_userId: string, itemId: string): Promise<void> {
    await db.bucketList.delete(itemId);
  }

  /* -------------------------------------------------------------- 攻略の書 */

  async getStrategies(userId: string): Promise<StrategyItem[]> {
    const rows = await db.strategies.where("userId").equals(userId).toArray();
    return rows.map((row) => normalizeStrategyItem(row, userId));
  }

  async addStrategyItem(userId: string, input: StrategyItemInput): Promise<StrategyItem> {
    const item: StrategyItem = { ...input, id: uuidv4(), userId, createdAt: new Date().toISOString() };
    await db.strategies.put(item);
    return item;
  }

  async updateStrategyItem(userId: string, itemId: string, input: StrategyItemInput): Promise<StrategyItem> {
    const existing = await db.strategies.get(itemId);
    if (!existing) throw new Error("項目が見つかりませんでした");
    const updated: StrategyItem = { ...normalizeStrategyItem(existing, userId), ...input };
    await db.strategies.put(updated);
    return updated;
  }

  async deleteStrategyItem(_userId: string, itemId: string): Promise<void> {
    await db.strategies.delete(itemId);
  }

  /* ------------------------------------------------- 気持ちの記録・設定 */

  async getMoodLogs(): Promise<MoodLog[]> {
    const rows = await db.moodLogs.toArray();
    return rows
      .map(normalizeMoodLog)
      .filter(isNotNull)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  async saveMoodLog(log: MoodLog): Promise<void> {
    await db.moodLogs.put(log);
  }

  async deleteMoodLog(id: string): Promise<void> {
    await db.moodLogs.delete(id);
  }

  async getCustomEmotions(): Promise<Emotion[]> {
    const row = await db.appSettings.get("customEmotions");
    return normalizeCustomEmotions(row?.value);
  }

  async saveCustomEmotions(emotions: Emotion[]): Promise<void> {
    await db.appSettings.put({ id: "customEmotions", value: emotions });
  }

  async getTruthFields(): Promise<TruthField[]> {
    const row = await db.appSettings.get("truthFields");
    return normalizeTruthFields(row?.value);
  }

  async saveTruthFields(fields: TruthField[]): Promise<void> {
    await db.appSettings.put({ id: "truthFields", value: fields });
  }

  /* -------------------------------------------------------------- 人物図鑑 */

  async getCompanions(userId: string): Promise<Companion[]> {
    const rows = await db.companions.where("userId").equals(userId).toArray();
    return rows.map((row) => normalizeCompanion(row, userId));
  }

  async addCompanion(userId: string, input: CompanionInput): Promise<Companion> {
    const companion: Companion = { ...input, id: uuidv4(), userId, createdAt: Date.now() };
    await db.companions.put(companion);
    return companion;
  }

  async updateCompanion(userId: string, itemId: string, input: CompanionInput): Promise<Companion> {
    const existing = await db.companions.get(itemId);
    if (!existing) throw new Error("人物が見つかりませんでした");
    const updated: Companion = { ...normalizeCompanion(existing, userId), ...input };
    await db.companions.put(updated);
    return updated;
  }

  async deleteCompanion(_userId: string, itemId: string): Promise<void> {
    await db.companions.delete(itemId);
  }

  /* -------------------------------------------------------------- 伝承の書 */

  async getLegacies(userId: string): Promise<LegacyItem[]> {
    const rows = await db.legacies.where("userId").equals(userId).toArray();
    return rows.map((row) => normalizeLegacyItem(row, userId));
  }

  async addLegacyItem(userId: string, input: LegacyItemInput): Promise<LegacyItem> {
    const item: LegacyItem = { ...input, id: uuidv4(), userId, createdAt: Date.now() };
    await db.legacies.put(item);
    return item;
  }

  // 以前は「削除してから作り直す」実装だったため、編集のたびに ID と記入日が変わっていた。
  // ここでは同じ ID・作成時刻のまま内容だけ差し替える。
  async updateLegacyItem(userId: string, itemId: string, input: LegacyItemInput): Promise<LegacyItem> {
    const existing = await db.legacies.get(itemId);
    if (!existing) throw new Error("手紙が見つかりませんでした");
    const updated: LegacyItem = { ...normalizeLegacyItem(existing, userId), ...input };
    await db.legacies.put(updated);
    return updated;
  }

  async deleteLegacyItem(_userId: string, itemId: string): Promise<void> {
    await db.legacies.delete(itemId);
  }

  /* ------------------------------------------------------------ カウンター */

  async getCounterItems(userId: string): Promise<CounterItem[]> {
    const rows = await db.counterItems.where("userId").equals(userId).toArray();
    return rows
      .map((row, index) => normalizeCounterItem(row, userId, index))
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }

  async addCounterItem(userId: string, input: CounterItemInput): Promise<CounterItem> {
    const count = await db.counterItems.where("userId").equals(userId).count();
    const item: CounterItem = { ...input, id: uuidv4(), userId, order: count, createdAt: Date.now() };
    await db.counterItems.put(item);
    return item;
  }

  // 以前は「削除してから作り直す」実装だったため、項目名を直しただけで
  // その項目に紐づく記録が全て消えていた。ここでは記録には一切触れない。
  async updateCounterItem(userId: string, itemId: string, input: CounterItemInput): Promise<CounterItem> {
    const existing = await db.counterItems.get(itemId);
    if (!existing) throw new Error("項目が見つかりませんでした");
    const updated: CounterItem = { ...normalizeCounterItem(existing, userId), ...input };
    await db.counterItems.put(updated);
    return updated;
  }

  async updateCounterOrder(_userId: string, orderedIds: string[]): Promise<void> {
    await db.transaction("rw", db.counterItems, async () => {
      for (let index = 0; index < orderedIds.length; index++) {
        await db.counterItems.update(orderedIds[index], { order: index });
      }
    });
  }

  async deleteCounterItem(_userId: string, itemId: string): Promise<void> {
    await db.transaction("rw", [db.counterItems, db.counterLogs], async () => {
      await db.counterItems.delete(itemId);
      await db.counterLogs.where("itemId").equals(itemId).delete();
    });
  }

  private async logsFor(itemId: string): Promise<CounterLog[]> {
    const rows = await db.counterLogs.where("itemId").equals(itemId).toArray();
    return rows
      .map(normalizeCounterLog)
      .filter(isNotNull)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  }

  async getCounterLogs(_userId: string, itemId: string): Promise<CounterLog[]> {
    return this.logsFor(itemId);
  }

  // 項目ごとに問い合わせると項目数だけ往復が発生するため、1 回でまとめて取得して振り分ける
  async getAllCounterLogs(userId: string): Promise<Record<string, CounterLog[]>> {
    const items = await db.counterItems.where("userId").equals(userId).toArray();
    const grouped: Record<string, CounterLog[]> = {};
    for (const item of items) {
      if (item.id) grouped[item.id] = [];
    }

    const rows = await db.counterLogs.toArray();
    for (const row of rows) {
      const log = normalizeCounterLog(row);
      if (log && grouped[log.itemId]) grouped[log.itemId].push(log);
    }

    for (const logs of Object.values(grouped)) {
      logs.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    }
    return grouped;
  }

  async addCounterLog(_userId: string, itemId: string, date: string, value = 1): Promise<CounterLog[]> {
    const draft: Omit<CounterLog, "id"> = { itemId, date, value, createdAt: Date.now() };
    await db.counterLogs.add(draft as CounterLog);
    return this.logsFor(itemId);
  }

  // 「その日の記録を消して 1 件入れ直す」処理は以前は画面側に 4 箇所散らばっていて、
  // 途中で失敗すると記録だけ消えた状態になり得たため、1 つの処理としてまとめる。
  async setCounterLogValue(_userId: string, itemId: string, date: string, value: number): Promise<CounterLog[]> {
    await db.transaction("rw", db.counterLogs, async () => {
      await db.counterLogs.where("[itemId+date]").equals([itemId, date]).delete();
      if (value > 0) {
        const draft: Omit<CounterLog, "id"> = { itemId, date, value, createdAt: Date.now() };
        await db.counterLogs.add(draft as CounterLog);
      }
    });
    return this.logsFor(itemId);
  }

  async removeCounterLog(_userId: string, itemId: string, date: string): Promise<CounterLog[]> {
    await db.transaction("rw", db.counterLogs, async () => {
      const keys = await db.counterLogs.where("[itemId+date]").equals([itemId, date]).primaryKeys();
      const lastKey = keys[keys.length - 1];
      if (typeof lastKey === "number") {
        await db.counterLogs.delete(lastKey);
      }
    });
    return this.logsFor(itemId);
  }

  /* -------------------------------------------------------------- 育成記録 */

  async getGrowthLogs(childId?: string): Promise<GrowthLog[]> {
    const rows = childId
      ? await db.growthLogs.where("childId").equals(childId).toArray()
      : await db.growthLogs.toArray();
    return rows.map(normalizeGrowthLog).sort(byDateDesc);
  }

  async saveGrowthLog(log: GrowthLog): Promise<void> {
    await db.growthLogs.put(log);
  }

  async deleteGrowthLog(id: string): Promise<void> {
    await db.growthLogs.delete(id);
  }

  async getFamilyMembers(): Promise<FamilyMember[]> {
    const rows = await db.familyMembers.toArray();
    return rows.map((row, index) => normalizeFamilyMember(row, index)).sort((a, b) => a.order - b.order);
  }

  async saveFamilyMember(member: FamilyMember): Promise<void> {
    await db.familyMembers.put(member);
  }

  async deleteFamilyMember(id: string): Promise<void> {
    await db.familyMembers.delete(id);
  }

  /* ---------------------------------------------------- バックアップ入出力 */

  async exportAllData(userId: string): Promise<ExportedData> {
    const [profile, lifeLog, bucketList, strategies, companions, experimentRows, legacies, counterItems, counterLogRows, growthLogs, familyMembers] =
      await Promise.all([
        this.getUserProfile(userId),
        this.getLifeLogs(userId),
        this.getBucketList(userId),
        this.getStrategies(userId),
        this.getCompanions(userId),
        db.experiments.where("userId").equals(userId).toArray(),
        this.getLegacies(userId),
        this.getCounterItems(userId),
        db.counterLogs.toArray(),
        this.getGrowthLogs(),
        this.getFamilyMembers(),
      ]);
    const [moodLogs, customEmotions, truthFields] = await Promise.all([this.getMoodLogs(), this.getCustomEmotions(), this.getTruthFields()]);

    return {
      profile,
      lifeLog,
      bucketList,
      strategies,
      companions,
      experiments: experimentRows.map((row) => normalizeExperiment(row, userId)),
      legacies,
      counterItems,
      counterLogs: counterLogRows.map(normalizeCounterLog).filter(isNotNull),
      growthLogs,
      familyMembers,
      moodLogs,
      customEmotions,
      truthFields,
    };
  }

  async importData(userId: string, data: unknown): Promise<void> {
    if (typeof data !== "object" || data === null) {
      throw new Error("バックアップの形式が読み取れませんでした");
    }
    const source = data as Record<string, unknown>;

    const profileRaw = source.profile;
    const lifeLog = rawArray(source.lifeLog).map((row) => ({ ...normalizeLifeLog(row, userId), userId }));
    const bucketList = rawArray(source.bucketList).map((row) => ({ ...normalizeBucketItem(row, userId), userId }));
    const strategies = rawArray(source.strategies).map((row) => ({ ...normalizeStrategyItem(row, userId), userId }));
    const companions = rawArray(source.companions).map((row) => ({ ...normalizeCompanion(row, userId), userId }));
    const experiments = rawArray(source.experiments).map((row) => ({ ...normalizeExperiment(row, userId), userId }));
    // 読み込んだ記録は今ログインしている人のものとして扱う（別アカウントで作ったバックアップでも見えるように）
    const legacies = flattenLegacies(source.legacies, userId).map((row) => ({ ...row, userId }));
    const counterItems = rawArray(source.counterItems).map((row, index) => ({ ...normalizeCounterItem(row, userId, index), userId }));
    const counterLogs = rawArray(source.counterLogs).map(normalizeCounterLog).filter(isNotNull);
    const growthLogs = rawArray(source.growthLogs).map(normalizeGrowthLog);
    const familyMembers = rawArray(source.familyMembers).map((row, index) => normalizeFamilyMember(row, index));
    const moodLogs = rawArray(source.moodLogs).map(normalizeMoodLog).filter(isNotNull);
    // 古いバックアップ（気持ちの設定が無い）を読んだときは、今の設定を消さずに残す
    const customEmotions = Array.isArray(source.customEmotions) ? normalizeCustomEmotions(source.customEmotions) : null;
    const truthFields = Array.isArray(source.truthFields) ? normalizeTruthFields(source.truthFields) : null;

    const totalRecords =
      lifeLog.length + bucketList.length + strategies.length + companions.length +
      experiments.length + legacies.length + counterItems.length + growthLogs.length + familyMembers.length;

    // 中身が何も読み取れないファイルで既存データを消してしまわないよう先に弾く
    if (totalRecords === 0 && (typeof profileRaw !== "object" || profileRaw === null)) {
      throw new Error("バックアップに復元できるデータが入っていませんでした");
    }

    const profile = profileRaw ? normalizeUserProfile(profileRaw, userId) : null;

    await db.transaction(
      "rw",
      [
        db.userProfile, db.lifeLogs, db.bucketList, db.strategies, db.companions,
        db.experiments, db.legacies, db.counterItems, db.counterLogs,
        db.growthLogs, db.familyMembers, db.moodLogs, db.appSettings,
      ],
      async () => {
        await Promise.all([
          db.userProfile.clear(), db.lifeLogs.clear(), db.bucketList.clear(),
          db.strategies.clear(), db.companions.clear(), db.experiments.clear(),
          db.legacies.clear(), db.counterItems.clear(), db.counterLogs.clear(),
          db.growthLogs.clear(), db.familyMembers.clear(), db.moodLogs.clear(),
        ]);

        if (profile) await db.userProfile.put({ ...profile, id: userId });
        if (lifeLog.length) await db.lifeLogs.bulkPut(lifeLog);
        if (bucketList.length) await db.bucketList.bulkPut(bucketList);
        if (strategies.length) await db.strategies.bulkPut(strategies);
        if (companions.length) await db.companions.bulkPut(companions);
        if (experiments.length) await db.experiments.bulkPut(experiments);
        if (legacies.length) await db.legacies.bulkPut(legacies);
        if (counterItems.length) await db.counterItems.bulkPut(counterItems);
        if (counterLogs.length) await db.counterLogs.bulkPut(counterLogs);
        if (growthLogs.length) await db.growthLogs.bulkPut(growthLogs);
        if (familyMembers.length) await db.familyMembers.bulkPut(familyMembers);
        if (moodLogs.length) await db.moodLogs.bulkPut(moodLogs);
        if (customEmotions) await db.appSettings.put({ id: "customEmotions", value: customEmotions });
        if (truthFields) await db.appSettings.put({ id: "truthFields", value: truthFields });
      },
    );
  }
}

/**
 * 伝承の書は以前「宛先ごとに letters 配列を持つ」形式だった。
 * その形式のバックアップも 1 通ずつの形に展開して読み込めるようにする。
 */
const flattenLegacies = (value: unknown, userId: string): LegacyItem[] => {
  const result: LegacyItem[] = [];

  for (const entry of rawArray(value)) {
    const row = typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : {};
    const letters = row.letters;

    if (Array.isArray(letters)) {
      const targetName = typeof row.targetName === "string" ? row.targetName : undefined;
      for (const letter of letters) {
        const normalized = normalizeLegacyItem(letter, userId);
        result.push({
          ...normalized,
          id: normalized.id || uuidv4(),
          category: "message",
          forWho: normalized.forWho ?? targetName,
        });
      }
      continue;
    }

    const normalized = normalizeLegacyItem(row, userId);
    result.push({ ...normalized, id: normalized.id || uuidv4() });
  }

  return result;
};
