// 「からだ」のデータ変換（Firestore の REST の形 → 画面で使う形）を確かめる
import { test } from "node:test";
import assert from "node:assert/strict";
import { withEmptyDaysUpTo, kcalByWeekday, kcalSummary, medianOf, splitByKcal, splitByWorkout, bedtimeSpread, bedtimesOf, formatBedtime, shiftDate, sleepDebt, sleepStreaks, sleepVsRating, stepsVsNextNight, weekCompare, buildMonthGrid, judgeSleep, summarizeMonth, decodeFsValue, encodePairingCode, formatMinutes, normalizeBodyDay, normalizeBodyDayPlain } from "../src/domain/body.ts";

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
  assert.equal(formatMinutes(452), "7:32");
  assert.equal(formatMinutes(141), "2:21");
  assert.equal(formatMinutes(45), "0:45");
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

test("消費カロリーと調子：カロリーは欠けていれば null、調子は 1〜3 の整数だけ（5段階の古い記録は変換）", async () => {
  const { normalizeRating, migrateOldRating } = await import("../src/domain/body.ts");
  const day = normalizeBodyDay("2026-11-14", { kcalTotal: { integerValue: "2410" }, kcalActive: { integerValue: "520" } });
  assert.equal(day.kcalTotal, 2410);
  assert.equal(day.kcalActive, 520);
  assert.equal(normalizeBodyDay("2026-11-14", {}).kcalTotal, null);
  assert.equal(normalizeRating(3), 3);
  assert.equal(normalizeRating(4), null);
  assert.equal(normalizeRating(0), null);
  assert.equal(normalizeRating(2.5), null);
  assert.equal(normalizeRating("3"), null);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(migrateOldRating), [1, 1, 2, 3, 3, null]);
});

test("部屋の温湿度：文字列を読み、睡眠の時間帯だけ平均する。壊れた行は飛ばす", async () => {
  const { parseRoomSamples, summarizeRoom } = await import("../src/domain/body.ts");
  const samples = parseRoomSamples("100,24.0,50;130,25.0,60;oops;160,26.0,70;300,10.0,10");
  assert.equal(samples.length, 4);
  assert.equal(samples[0].ms, 100 * 60000);
  const r = summarizeRoom(samples, 100 * 60000, 160 * 60000);
  assert.ok(r);
  assert.equal(r.count, 3);
  assert.equal(r.tempAvg, 25);
  assert.equal(r.tempMin, 24);
  assert.equal(r.tempMax, 26);
  assert.equal(r.humAvg, 60);
  assert.equal(summarizeRoom(samples, 1000 * 60000, 2000 * 60000), null);
  assert.deepEqual(parseRoomSamples(undefined), []);
});

test("SwitchBot の履歴CSV：列を見出しで探し、日ごとの文字列に分け、同じ分は重ねずに合わせる", async () => {
  const { parseSwitchBotCsv, groupRoomByDate, mergeRoomStrings, parseRoomSamples } = await import("../src/domain/body.ts");
  const csv = "Date,Temperature_Celsius(℃),Relative_Humidity(%),DPT(℃),VPD(kPa),Abs Humidity(g/m³),Light_Value\n2025-11-15 07:28,21.8,57,12.9,1.12,10.94,12\n2025-11-15 07:58,22.4,57,13.5,1.16,11.32,12\n2025-11-16 00:28,,,,,,\nbad line\n";
  const samples = parseSwitchBotCsv(csv);
  assert.equal(samples.length, 2);
  assert.equal(samples[0].ms, new Date(2025, 10, 15, 7, 28).getTime());
  assert.equal(samples[0].temp, 21.8);
  assert.equal(samples[0].hum, 57);
  const grouped = groupRoomByDate(samples);
  assert.deepEqual(Object.keys(grouped), ["2025-11-15"]);
  assert.equal(parseRoomSamples(grouped["2025-11-15"]).length, 2);
  const merged = mergeRoomStrings(grouped["2025-11-15"], grouped["2025-11-15"] + ";" + Math.round(new Date(2025, 10, 15, 8, 0).getTime() / 60000) + ",23.0,55");
  assert.equal(parseRoomSamples(merged).length, 3);
  assert.deepEqual(parseSwitchBotCsv("a,b\n1,2"), []);
});

test("睡眠の時間ごとの記録：段階と心拍・血中酸素の並びを読む（壊れた要素は飛ばす）", async () => {
  const { parseSleepStages, parseSeries, normalizeBodyDayPlain } = await import("../src/domain/body.ts");
  const stages = parseSleepStages('[{"g":3,"s":2000,"e":3000},{"g":9,"s":1,"e":2},{"g":0,"s":1000,"e":2000},{"g":1,"s":5,"e":5}]');
  assert.equal(stages.length, 2);
  assert.equal(stages[0].stage, 0);
  assert.equal(stages[1].stage, 3);
  assert.deepEqual(parseSleepStages("not json"), []);
  assert.deepEqual(parseSleepStages(undefined), []);
  const series = parseSeries("2000,60;1000,55;bad;3000,x");
  assert.deepEqual(series, [{ ms: 1000, value: 55 }, { ms: 2000, value: 60 }]);
  const day = normalizeBodyDayPlain("2026-11-15", { stages: '[{"g":2,"s":1,"e":2}]', hrSeries: "1,50", spo2Series: "1,96" });
  assert.equal(day.sleepStages.length, 1);
  assert.equal(day.hrSeries[0].value, 50);
  assert.equal(day.spo2Series[0].value, 96);
  assert.deepEqual(normalizeBodyDayPlain("x", {}).sleepStages, []);
});

test("月カレンダー：日曜はじまり・週ごと・空きで埋める", () => {
  const weeks = buildMonthGrid(2026, 11); // 2026-11-01 は日曜
  assert.equal(weeks[0][0].date, "2026-11-01");
  assert.equal(weeks.length, 5);
  assert.ok(weeks.every((w) => w.length === 7));
  assert.equal(weeks[4][1].date, "2026-11-30");
  assert.equal(weeks[4][2].date, null);
  const oct = buildMonthGrid(2026, 10); // 2026-10-01 は木曜
  assert.equal(oct[0][3].date, null);
  assert.equal(oct[0][4].date, "2026-10-01");
});

test("睡眠の判定：7時間ちょうどは足りてる、記録なしは none", () => {
  assert.equal(judgeSleep(420), "enough");
  assert.equal(judgeSleep(419), "short");
  assert.equal(judgeSleep(null), "none");
});

test("月の集計：今日より後の日は数えない", () => {
  const weeks = buildMonthGrid(2026, 11);
  const sleep: Record<string, number> = { "2026-11-01": 450, "2026-11-02": 300, "2026-11-03": 420 };
  const s = summarizeMonth(weeks, (d) => sleep[d] ?? null, (d) => (d === "2026-11-01" ? 3 : d === "2026-11-02" ? 1 : null), "2026-11-05");
  assert.equal(s.enough, 2);
  assert.equal(s.short, 1);
  assert.equal(s.none, 2); // 4日・5日
  assert.equal(Math.round(s.avgSleepMin ?? 0), 390);
  assert.deepEqual(s.ratingCounts, { 1: 1, 2: 0, 3: 1 });
});

const mk = (date: string, o: Record<string, unknown> = {}) => normalizeBodyDayPlain(date, o);

test("分析：日付をずらす（月またぎ）", () => {
  assert.equal(shiftDate("2026-11-01", -1), "2026-10-31");
  assert.equal(shiftDate("2026-11-30", 1), "2026-12-01");
});

test("分析：睡眠が足りた日／足りない日の調子の内訳", () => {
  const days = [mk("2026-11-01", { sleepMin: 450 }), mk("2026-11-02", { sleepMin: 300 }), mk("2026-11-03", { sleepMin: 420 }), mk("2026-11-04", { sleepMin: null })];
  const r: Record<string, number> = { "2026-11-01": 3, "2026-11-02": 1, "2026-11-03": 2, "2026-11-04": 3 };
  const s = sleepVsRating(days, (d) => r[d] ?? null);
  assert.equal(s.enough.n, 2);
  assert.deepEqual(s.enough.counts, { 1: 0, 2: 1, 3: 1 });
  assert.equal(s.short.n, 1);
  assert.deepEqual(s.short.counts, { 1: 1, 2: 0, 3: 0 });
});

test("分析：歩いた日の夜は翌日の睡眠の記録を見る", () => {
  const days = [
    mk("2026-11-01", { steps: 8000 }),
    mk("2026-11-02", { steps: 2000, sleepMin: 480, deepMin: 96 }), // 11/1 の夜
    mk("2026-11-03", { steps: 9000, sleepMin: 360, deepMin: 36 }), // 11/2 の夜
    mk("2026-11-04", { sleepMin: 420 }), // 11/3 の夜
  ];
  const r = stepsVsNextNight(days, 6000);
  assert.equal(r.active.n, 2);
  assert.equal(r.active.sleepAvg, 450);
  assert.equal(r.quiet.n, 1);
  assert.equal(r.quiet.sleepAvg, 360);
  assert.equal(Math.round(r.quiet.deepPctAvg ?? -1), 10);
});

test("分析：睡眠負債は7時間に足りなかった分だけ足す", () => {
  const days = [mk("2026-11-14", { sleepMin: 360 }), mk("2026-11-15", { sleepMin: 480 }), mk("2026-11-16", { sleepMin: 400 }), mk("2026-11-01", { sleepMin: 100 })];
  const d = sleepDebt(days, "2026-11-16", 7);
  assert.equal(d.debtMin, 60 + 0 + 20);
  assert.equal(d.recorded, 3);
});

test("分析：就寝時刻は夜をまたいでも平均できる／昼寝は除く", () => {
  const at = (h: number, m: number, day = 10) => new Date(2026, 10, day, h, m).getTime();
  const days = [
    mk("2026-11-11", { sleepStartMs: at(23, 0, 10) }),
    mk("2026-11-12", { sleepStartMs: at(1, 0, 12) }), // 夜中の1時
    mk("2026-11-13", { sleepStartMs: at(14, 0, 13) }), // 昼寝 → 除く
  ];
  const list = bedtimesOf(days);
  assert.equal(list.length, 2);
  assert.equal(formatBedtime(list[0].min), "23:00");
  assert.equal(formatBedtime(list[1].min), "1:00");
  const sp = bedtimeSpread(list);
  assert.equal(formatBedtime(sp?.avg ?? 0), "0:00");
  assert.equal(Math.round(sp?.sd ?? 0), 60);
  assert.equal(bedtimeSpread([list[0]]), null);
});

test("分析：7時間以上の連続（記録の無い日は途切れ）", () => {
  const days = [
    mk("2026-11-10", { sleepMin: 450 }),
    mk("2026-11-11", { sleepMin: 450 }),
    mk("2026-11-12", { sleepMin: 450 }),
    mk("2026-11-13", { sleepMin: 300 }),
    mk("2026-11-14", { sleepMin: 430 }),
    mk("2026-11-15", { sleepMin: 440 }),
  ];
  // 今日（11/16）はまだ記録が無い → 昨日から遡る
  assert.deepEqual(sleepStreaks(days, "2026-11-16"), { current: 2, longest: 3 });
  assert.deepEqual(sleepStreaks([], "2026-11-16"), { current: 0, longest: 0 });
});

test("分析：今週と先週の平均", () => {
  const days = [mk("2026-11-16", { sleepMin: 400, steps: 6000 }), mk("2026-11-10", { sleepMin: 440 }), mk("2026-11-09", { sleepMin: 300, steps: 2000 }), mk("2026-11-01", { sleepMin: 999 })];
  const w = weekCompare(days, (d) => (d === "2026-11-16" ? 3 : d === "2026-11-09" ? 1 : null), "2026-11-16");
  assert.equal(w.thisWeek.sleepAvg, 420);
  assert.equal(w.thisWeek.stepsAvg, 6000);
  assert.equal(w.thisWeek.ratingAvg, 3);
  assert.equal(w.lastWeek.sleepAvg, 300);
  assert.equal(w.lastWeek.ratingAvg, 1);
});

test("カロリー：中央値", () => {
  assert.equal(medianOf([]), null);
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(medianOf([1, 2, 3, 4]), 2.5);
});

test("カロリー：平均と、総消費に占める活動の割合（両方ある日だけ）", () => {
  const days = [mk("2026-11-01", { kcalActive: 300, kcalTotal: 2000 }), mk("2026-11-02", { kcalActive: 500, kcalTotal: 2200 }), mk("2026-11-03", { kcalActive: 999 })];
  const k = kcalSummary(days);
  assert.equal(k.n, 3);
  assert.equal(Math.round(k.activeAvg ?? 0), 600);
  assert.equal(k.totalAvg, 2100);
  assert.equal(Math.round(k.activeShare ?? 0), 19); // (300+500)/(2000+2200)
  assert.equal(kcalSummary([]).activeAvg, null);
});

test("カロリー：曜日別（日曜はじまり）", () => {
  // 2026-11-15 は日曜、11-16 は月曜
  const w = kcalByWeekday([mk("2026-11-15", { kcalActive: 100 }), mk("2026-11-22", { kcalActive: 300 }), mk("2026-11-16", { kcalActive: 50 }), mk("2026-11-17", {})]);
  assert.equal(w[0].avg, 200);
  assert.equal(w[0].n, 2);
  assert.equal(w[1].avg, 50);
  assert.equal(w[2].avg, null);
});

test("カロリー：多い日／少ない日（中央値で分ける）と、その夜の睡眠・その日の調子", () => {
  const days = [
    mk("2026-11-01", { kcalActive: 100 }),
    mk("2026-11-02", { kcalActive: 500, sleepMin: 400 }), // 11/1 の夜
    mk("2026-11-03", { kcalActive: 300, sleepMin: 480 }), // 11/2 の夜
    mk("2026-11-04", { sleepMin: 360 }), // 11/3 の夜
  ];
  const r: Record<string, number> = { "2026-11-01": 1, "2026-11-02": 3, "2026-11-03": 3 };
  const s = splitByKcal(days, (d) => r[d] ?? null);
  assert.equal(s.threshold, 300);
  assert.equal(s.high.n, 2); // 500・300
  assert.equal(s.low.n, 1); // 100
  assert.equal(s.low.nextSleepAvg, 400);
  assert.equal(s.high.nextSleepAvg, 420); // (480+360)/2
  assert.deepEqual(s.high.rating.counts, { 1: 0, 2: 0, 3: 2 });
  assert.deepEqual(s.low.rating.counts, { 1: 1, 2: 0, 3: 0 });
  assert.equal(splitByKcal([], () => null).threshold, null);
});

test("カロリー：運動をした日／しなかった日（記録のある日だけ対象）", () => {
  const w = [{ type: 79, startMs: 1, endMs: 2, distanceM: null }];
  const days = [
    mk("2026-11-01", { steps: 5000, workouts: JSON.stringify([{ t: 79, s: 1, e: 2 }]) }),
    mk("2026-11-02", { steps: 4000, sleepMin: 450 }),
    mk("2026-11-03", {}), // 何の記録も無い日は数えない
  ];
  assert.equal(w.length, 1);
  const r = splitByWorkout(days, () => null);
  assert.equal(r.withWorkout.n, 1);
  assert.equal(r.without.n, 1);
  assert.equal(r.withWorkout.nextSleepAvg, 450);
});

test("今日の記録がまだ届いていなくても、今日（までの空の日）を先頭に足す", () => {
  const days = [mk("2026-11-15", { sleepMin: 450 }), mk("2026-11-14", { sleepMin: 400 })];
  const r = withEmptyDaysUpTo(days, "2026-11-16");
  assert.deepEqual(r.map((d) => d.date), ["2026-11-16", "2026-11-15", "2026-11-14"]);
  assert.equal(r[0].sleepMin, null);
  assert.equal(r[1].sleepMin, 450); // 元の日はそのまま
  // 届いている日が今日まであれば何もしない
  assert.equal(withEmptyDaysUpTo([mk("2026-11-16")], "2026-11-16").length, 1);
  // 数日止まっているときは、その間の日も空で並べる（上限あり）
  const stale = withEmptyDaysUpTo([mk("2026-11-10")], "2026-11-16");
  assert.deepEqual(stale.map((d) => d.date), ["2026-11-16", "2026-11-15", "2026-11-14", "2026-11-13", "2026-11-12", "2026-11-11", "2026-11-10"]);
  assert.equal(withEmptyDaysUpTo([mk("2026-10-01")], "2026-11-16").length, 8); // 7日ぶんだけ足す
  // 記録が1件も無いときは足さない
  assert.equal(withEmptyDaysUpTo([], "2026-11-16").length, 0);
});
