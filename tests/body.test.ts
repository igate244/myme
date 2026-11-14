// 「からだ」のデータ変換（Firestore の REST の形 → 画面で使う形）を確かめる
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFsValue, encodePairingCode, formatMinutes, normalizeBodyDay, normalizeBodyDayPlain } from "../src/domain/body.ts";

test("Firestore の値：整数は文字列で来るので数値にする", () => {
  assert.equal(decodeFsValue({ integerValue: "8229" }), 8229);
  assert.equal(decodeFsValue({ doubleValue: 96.5 }), 96.5);
  assert.equal(decodeFsValue({ stringValue: "x" }), "x");
  assert.equal(decodeFsValue(undefined), null);
});

test("1日分：欠けている項目は null、運動は JSON 文字列から読む", () => {
  const day = normalizeBodyDay("2026-11-13", {
    steps: { integerValue: "8229" },
    hrMin: { integerValue: "49" },
    hrMax: { integerValue: "93" },
    sleepMin: { integerValue: "452" },
    workouts: { stringValue: JSON.stringify([{ t: 79, s: 2000, e: 3000, d: 1200 }, { t: 56, s: 1000, e: 1500 }]) },
  });
  assert.equal(day.date, "2026-11-13");
  assert.equal(day.steps, 8229);
  assert.equal(day.hrAvg, null);
  assert.equal(day.spo2Avg, null);
  assert.equal(day.workouts.length, 2);
  assert.equal(day.workouts[0].type, 56); // 開始が早い順
  assert.equal(day.workouts[1].distanceM, 1200);
});

test("1日分：壊れた運動データや空のドキュメントでも落ちない", () => {
  assert.deepEqual(normalizeBodyDay("2026-01-01", { workouts: { stringValue: "{oops" } }).workouts, []);
  assert.equal(normalizeBodyDay("2026-01-01", undefined).steps, null);
});

test("分の表示", () => {
  assert.equal(formatMinutes(452), "7時間32分");
  assert.equal(formatMinutes(45), "45分");
  assert.equal(formatMinutes(null), "—");
});

test("連携コード：base64url で、中身を読み戻せる", () => {
  const code = encodePairingCode("uid123", "refresh/token+abc==");
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  const json = JSON.parse(Buffer.from(code.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  assert.deepEqual(json, { v: 1, u: "uid123", r: "refresh/token+abc==" });
});

test("SDK の data()（普通の値）からも同じ形になる", () => {
  const day = normalizeBodyDayPlain("2026-11-13", { steps: 8229, spo2Avg: 96.5, workouts: JSON.stringify([{ t: 56, s: 1, e: 2 }]) });
  assert.equal(day.steps, 8229);
  assert.equal(day.spo2Avg, 96.5);
  assert.equal(day.hrAvg, null);
  assert.equal(day.workouts.length, 1);
  assert.equal(normalizeBodyDayPlain("x", undefined).steps, null);
});

test("消費カロリーと調子：カロリーは欠けていれば null、調子は 1〜5 の整数だけ", async () => {
  const { normalizeRating } = await import("../src/domain/body.ts");
  const day = normalizeBodyDay("2026-11-14", { kcalTotal: { integerValue: "2410" }, kcalActive: { integerValue: "520" } });
  assert.equal(day.kcalTotal, 2410);
  assert.equal(day.kcalActive, 520);
  assert.equal(normalizeBodyDay("2026-11-14", {}).kcalTotal, null);
  assert.equal(normalizeRating(4), 4);
  assert.equal(normalizeRating(0), null);
  assert.equal(normalizeRating(3.5), null);
  assert.equal(normalizeRating("5"), null);
});
