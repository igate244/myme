// 旧 MYME のデータ・バックアップがそのまま読めることを確かめる
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeLifeLog,
  normalizeBucketItem,
  normalizeCompanion,
  normalizeLegacyItem,
  normalizeCounterItem,
  normalizeCounterLog,
  normalizeUserProfile,
} from "../src/domain/models.ts";

test("ライフログ：旧 content は detail として読める", () => {
  const log = normalizeLifeLog({ id: "a", date: "2020-01-01", title: "転職", content: "本文", tags: ["work"], createdAt: "2020-01-01T00:00:00Z" }, "u1");
  assert.equal(log.detail, "本文");
  assert.equal(log.userId, "u1");
  assert.equal(log.createdAt, Date.parse("2020-01-01T00:00:00Z"));
});

test("やりたいこと：旧 checkItems・description を読める", () => {
  const item = normalizeBucketItem({ id: "b", title: "旅", status: "doing", description: "メモ", checkItems: [{ label: "予約", isDone: true }] }, "u1");
  assert.equal(item.detail, "メモ");
  assert.equal(item.checklist.length, 1);
  assert.equal(item.checklist[0].isDone, true);
  assert.equal(item.status, "doing");
});

test("遺すもの：記入日が無い古いデータは作成日を記入日にする", () => {
  const item = normalizeLegacyItem({ id: "c", title: "手紙", content: "…", createdAt: Date.UTC(2021, 4, 5, 3) }, "u1");
  assert.equal(item.date, "2021-05-05");
  assert.equal(item.category, "message");
});

test("画面から外した人物名鑑・カウンターのデータも壊さず読める（バックアップに残す）", () => {
  const c = normalizeCompanion({ id: "p", name: "山田", birthday: "1990-01-01", description: "同僚" }, "u1");
  assert.equal(c.birthDate, "1990-01-01");
  assert.equal(c.note, "同僚");
  const item = normalizeCounterItem({ id: "k", title: "筋トレ", usageType: "habit" }, "u1");
  assert.equal(item.usageType, "accumulation");
  assert.deepEqual(normalizeCounterLog({ id: 1, itemId: "k", date: "2026-01-01" })?.value, 1);
  assert.equal(normalizeCounterLog({ itemId: "k" }), null);
});

test("プロフィール：空欄は未設定扱い", () => {
  const p = normalizeUserProfile({ name: "洸", deep: "  " }, "u1");
  assert.equal(p.id, "u1");
  assert.equal(p.deep, undefined);
});
