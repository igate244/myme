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

test("指針：旧データは種類・ピン留め・最初の感情付けに読み替わる", async () => {
  const { normalizeStrategyItem, kindFromCategory } = await import("../src/domain/models.ts");
  const quote = normalizeStrategyItem({ id: "q", category: "impression", title: "勝ちに不思議の勝ちあり、負けに不思議の負けなし", source: "野村克也", verdict: "none", strength: 2 }, "u1");
  assert.equal(quote.kind, "quote");
  assert.equal(quote.pinned, false);
  assert.deepEqual(quote.emotions, ["going_well", "down"]);
  assert.deepEqual(quote.notes, []);

  const lesson = normalizeStrategyItem({ id: "l", category: "tactics", title: "なにか", verdict: "adopted", strength: 3 }, "u1");
  assert.equal(lesson.kind, "lesson");
  assert.equal(lesson.pinned, true, "重要度：大はピン留めに");
  assert.equal(lesson.verdict, "adopted", "旧データは保持");
  assert.deepEqual(lesson.emotions, []);

  assert.equal(kindFromCategory("definition"), "definition");
  assert.equal(kindFromCategory("theory"), "lesson");
});

test("指針：一度保存した感情・ピン・メモはそのまま使う", async () => {
  const { normalizeStrategyItem } = await import("../src/domain/models.ts");
  const item = normalizeStrategyItem(
    { id: "q", category: "impression", kind: "lesson", title: "勝ちに不思議の勝ちあり、負けに不思議の負けなし", strength: 3, emotions: [], pinned: false, notes: [{ id: "n", date: "2026-10-17", text: "また飲んだ" }] },
    "u1",
  );
  assert.equal(item.kind, "lesson");
  assert.deepEqual(item.emotions, [], "空にした感情は初期値で上書きしない");
  assert.equal(item.pinned, false);
  assert.equal(item.notes[0].text, "また飲んだ");
});

test("気持ちの記録・自分で足した気持ち", async () => {
  const { normalizeMoodLog, normalizeCustomEmotions } = await import("../src/domain/models.ts");
  assert.equal(normalizeMoodLog({ text: "id なし" }), null);
  assert.equal(normalizeMoodLog({ id: "m", date: "2026-10-17", emotion: "anger", text: "x" })?.emotion, "anger");
  assert.deepEqual(
    normalizeCustomEmotions([{ id: "c-1", label: "寂しい", group: "hard" }, { label: "id なし" }]).map((e) => e.label),
    ["寂しい"],
  );
});

test("真理図鑑：旧データに分野・出どころ・見つけた日が付く", async () => {
  const { normalizeStrategyItem } = await import("../src/domain/models.ts");
  const t = normalizeStrategyItem({ id: "a", category: "theory", title: "酒を飲むと人生クオリティ下がる", createdAt: "2026-01-01T03:00:00.000Z" }, "u1");
  assert.deepEqual(t.fields, ["body_mind"]);
  assert.equal(t.origin, "experience");
  assert.equal(t.foundDate, "2026-01-01");
  const q = normalizeStrategyItem({ id: "q", category: "impression", title: "名言" }, "u1");
  assert.equal(q.origin, undefined, "名言には出どころを付けない");
  const saved = normalizeStrategyItem({ id: "b", category: "theory", title: "酒を飲むと人生クオリティ下がる", field: "money", origin: "book", foundDate: "2020-05-05", lifeLogId: "l1" }, "u1");
  assert.deepEqual(saved.fields, ["money"], "1つだけだった頃の field も読む");
  assert.equal(saved.origin, "book");
  assert.equal(saved.foundDate, "2020-05-05");
  assert.equal(saved.lifeLogId, "l1");
});

test("真理図鑑：確かさ・番号・まだ見つけてない真理・今日の一枚", async () => {
  const { normalizeStrategyItem } = await import("../src/domain/models.ts");
  const { certainty, isUnfound, numberTruths, pickOfTheDay, truthText, truthLead } = await import("../src/components/strategy/common.tsx");
  const a = normalizeStrategyItem({ id: "a", category: "theory", title: "A", foundDate: "2026-02-01", notes: [{ id: "n", date: "2026-03-01", text: "" }] }, "u");
  const b = normalizeStrategyItem({ id: "b", category: "definition", title: "仕事", detail: "誰かの困りごとを減らすこと", foundDate: "2025-01-01" }, "u");
  const c = normalizeStrategyItem({ id: "c", category: "definition", title: "お金" }, "u");
  const q = normalizeStrategyItem({ id: "q", category: "impression", title: "名言" }, "u");
  assert.equal(certainty(a), 2);
  assert.equal(isUnfound(c), true);
  assert.equal(isUnfound(b), false);
  assert.equal(truthText(b), "誰かの困りごとを減らすこと");
  assert.equal(truthLead(b), "仕事とは");
  const no = numberTruths([a, b, c, q]);
  assert.equal(no.get("b"), 1);
  assert.equal(no.get("a"), 2);
  assert.equal(no.has("c"), false);
  assert.equal(no.has("q"), false);
  assert.equal(pickOfTheDay([a, b], "2026-10-21"), pickOfTheDay([a, b], "2026-10-21"), "同じ日は同じ1枚");
  assert.equal(pickOfTheDay([], "2026-10-21"), undefined);
});

test("真理図鑑：分野は複数持てる・分野の一覧は編集できる", async () => {
  const { normalizeStrategyItem, normalizeTruthFields, DEFAULT_TRUTH_FIELDS } = await import("../src/domain/models.ts");
  const multi = normalizeStrategyItem({ id: "m", category: "theory", title: "酒を飲むと人生クオリティ下がる", fields: ["body_mind", "money"], field: "work" }, "u1");
  assert.deepEqual(multi.fields, ["body_mind", "money"], "fields があればそれを使う");
  const cleared = normalizeStrategyItem({ id: "c", category: "theory", title: "酒を飲むと人生クオリティ下がる", fields: [] }, "u1");
  assert.deepEqual(cleared.fields, [], "外した分野を最初の振り分けで戻さない");
  assert.deepEqual(normalizeTruthFields(undefined), DEFAULT_TRUTH_FIELDS);
  assert.deepEqual(
    normalizeTruthFields([{ id: "work", label: "しごと", color: "#fff" }, { id: "x" }, { id: "f-1", label: "子育て" }]).map((f) => f.label),
    ["しごと", "子育て"],
  );
});
