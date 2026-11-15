// src/components/body/AnalysisPage.tsx — 分析：睡眠・調子・歩数の関係を、記録からまとめて見る1ページ
//
// 上から：気づき（文章）→ 先週との比較と睡眠負債・連続 → 睡眠と調子 → 歩数と睡眠 → 就寝時刻のばらつき。
// 集計は domain/body.ts の純粋な関数（テスト済み）。ここは見せるだけ。
// 記録が少ないうちは数字を出さず「あと◯日」と出す（少ない日数での差は偶然のことが多いので）。
import React, { useMemo, useState } from "react";
import type { BodyDay, Bedtime, DayGroupStats, RatingSplit } from "../../domain/body";
import {
  SLEEP_TARGET_MIN,
  bedtimeSpread,
  bedtimesOf,
  formatBedtime,
  formatMinutes,
  kcalByWeekday,
  kcalSummary,
  shiftDate,
  sleepDebt,
  sleepStreaks,
  sleepVsRating,
  splitByKcal,
  splitByWorkout,
  stepsVsNextNight,
  weekCompare,
} from "../../domain/body";
import type { RatingMap } from "../../infrastructure/bodyRemote";
import { cardStyle, LINE, LINE_2, SECTION_COLORS, SURFACE_2, TEXT_MAIN, TEXT_MUTED, TEXT_SUB } from "../uiStyles";

const ACCENT = SECTION_COLORS.body;
/** この日数に満たないグループは比べない */
const MIN_N = 3;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const localDate = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const pct = (n: number, total: number): number => (total === 0 ? 0 : Math.round((n / total) * 100));

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

const WINDOWS: { n: number; label: string }[] = [
  { n: 30, label: "30日" },
  { n: 90, label: "90日" },
  { n: 0, label: "全部" },
];

const CardTitle: React.FC<{ title: string; note?: string }> = ({ title, note }) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600 }}>{title}</div>
    {note && <div style={{ fontSize: "0.7rem", color: TEXT_MUTED, marginTop: 3, lineHeight: 1.6 }}>{note}</div>}
  </div>
);

/** 調子の内訳を横1本の帯で。濃いほど調子がいい（月カレンダーの3本棒と同じ向き） */
const RATING_SHADES: { r: 3 | 2 | 1; label: string; alpha: string }[] = [
  { r: 3, label: "いい", alpha: "ff" },
  { r: 2, label: "ふつう", alpha: "88" },
  { r: 1, label: "いまいち", alpha: "40" },
];

const RatingBar: React.FC<{ title: string; split: RatingSplit }> = ({ title, split }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: "0.72rem", color: TEXT_MUTED }}>
      {title}（{split.n}日）
    </div>
    {split.n < MIN_N ? (
      <div style={{ marginTop: 10, fontSize: "0.74rem", color: TEXT_MUTED, lineHeight: 1.6 }}>あと{MIN_N - split.n}日分たまると出ます</div>
    ) : (
      <>
        <div style={{ display: "flex", height: 12, borderRadius: 3, overflow: "hidden", gap: 2, marginTop: 8 }}>
          {RATING_SHADES.filter((x) => split.counts[x.r] > 0).map((x) => (
            <div key={x.r} style={{ width: `${(split.counts[x.r] / split.n) * 100}%`, background: `${ACCENT}${x.alpha}` }} />
          ))}
        </div>
        <div style={{ marginTop: 8, display: "grid", gap: 3 }}>
          {RATING_SHADES.map((x) => (
            <div key={x.r} style={{ fontSize: "0.76rem", color: TEXT_SUB, display: "flex", alignItems: "center" }}>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: `${ACCENT}${x.alpha}`, marginRight: 6, flexShrink: 0 }} />
              {x.label} {pct(split.counts[x.r], split.n)}%
            </div>
          ))}
        </div>
      </>
    )}
  </div>
);

/** 数字の行（左にラベル、右に値と補足） */
const Row: React.FC<{ label: string; value: string; sub?: string; first?: boolean }> = ({ label, value, sub, first }) => (
  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.9fr) minmax(0, 1.4fr)", gap: 8, alignItems: "baseline", padding: "11px 0", borderTop: first ? "none" : `1px solid ${LINE}` }}>
    <span style={{ fontSize: "0.8rem", color: TEXT_MUTED }}>{label}</span>
    <span style={{ textAlign: "right", minWidth: 0 }}>
      <span style={{ fontSize: "0.95rem", color: TEXT_MAIN }}>{value}</span>
      {sub && <span style={{ display: "block", fontSize: "0.72rem", color: TEXT_SUB, marginTop: 2, wordBreak: "break-word" }}>{sub}</span>}
    </span>
  </div>
);

const signed = (v: number, text: (x: number) => string): string => (v === 0 ? "変わらず" : `${v > 0 ? "+" : "−"}${text(Math.abs(v))}`);

/** 日のグループ1つぶん：その夜の睡眠・その日の調子（「いい」の割合）。少ないうちは出さない */
const GroupCol: React.FC<{ title: string; g: DayGroupStats; kcalSub?: boolean }> = ({ title, g, kcalSub }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: "0.72rem", color: TEXT_MUTED }}>
      {title}（{g.n}日）
    </div>
    {g.n < MIN_N ? (
      <div style={{ marginTop: 10, fontSize: "0.74rem", color: TEXT_MUTED, lineHeight: 1.6 }}>あと{MIN_N - g.n}日分たまると出ます</div>
    ) : (
      <>
        {kcalSub && g.kcalAvg !== null && <div style={{ marginTop: 4, fontSize: "0.74rem", color: TEXT_SUB }}>平均 {Math.round(g.kcalAvg).toLocaleString("ja-JP")} kcal</div>}
        <div style={{ marginTop: 10, fontSize: "0.68rem", color: TEXT_MUTED }}>その夜の睡眠</div>
        <div style={{ fontSize: "1.15rem", fontWeight: 600, color: TEXT_MAIN }}>{g.nextSleepN >= MIN_N ? formatMinutes(g.nextSleepAvg) : "—"}</div>
        <div style={{ marginTop: 8, fontSize: "0.68rem", color: TEXT_MUTED }}>調子が「いい」</div>
        <div style={{ fontSize: "1.15rem", fontWeight: 600, color: TEXT_MAIN }}>{g.rating.n >= MIN_N ? `${pct(g.rating.counts[3], g.rating.n)}%` : "—"}</div>
        {g.rating.n < MIN_N && <div style={{ fontSize: "0.66rem", color: TEXT_MUTED }}>調子の記録 {g.rating.n}日</div>}
      </>
    )}
  </div>
);

/** 曜日ごとの活動カロリーの平均（いちばん多い曜日を濃く） */
const WeekdayBars: React.FC<{ data: { avg: number | null; n: number }[] }> = ({ data }) => {
  const max = Math.max(1, ...data.map((d) => d.avg ?? 0));
  const best = data.reduce((bi, d, i) => ((d.avg ?? -1) > (data[bi].avg ?? -1) ? i : bi), 0);
  const H = 70;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 5 }}>
      {data.map((d, i) => (
        <div key={WEEKDAYS[i]} style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 0 }}>
          <div style={{ fontSize: "0.62rem", color: i === best && d.avg !== null ? TEXT_MAIN : TEXT_MUTED, height: 14, whiteSpace: "nowrap" }}>{d.avg === null ? "" : Math.round(d.avg)}</div>
          <div style={{ height: H, width: "100%", display: "flex", alignItems: "flex-end" }}>
            <div style={{ width: "100%", height: d.avg === null ? 2 : Math.max(2, Math.round((d.avg / max) * H)), background: d.avg === null ? LINE : ACCENT, opacity: d.avg === null || i === best ? 1 : 0.5, borderRadius: 1 }} />
          </div>
          <div style={{ marginTop: 6, fontSize: "0.7rem", color: TEXT_SUB }}>{WEEKDAYS[i]}</div>
        </div>
      ))}
    </div>
  );
};

/** 就寝時刻を日ごとに点で並べる。上が早い・下が遅い。点線は平均 */
const BedtimeChart: React.FC<{ list: Bedtime[]; from: string; to: string; avg: number }> = ({ list, from, to, avg }) => {
  const W = 340;
  const H = 150;
  const L = 40;
  const R = 8;
  const T = 10;
  const B = 22;
  const mins = list.map((b) => b.min);
  const lo = Math.floor(Math.min(...mins) / 60) * 60;
  let hi = Math.ceil(Math.max(...mins) / 60) * 60;
  if (hi - lo < 120) hi = lo + 120;
  const step = hi - lo > 300 ? 120 : 60;
  const ticks: number[] = [];
  for (let v = lo; v <= hi; v += step) ticks.push(v);
  const dayIndex = (date: string): number => {
    const [y, m, d] = date.split("-").map(Number);
    const [fy, fm, fd] = from.split("-").map(Number);
    return Math.round((new Date(y, m - 1, d).getTime() - new Date(fy, fm - 1, fd).getTime()) / 86400000);
  };
  const total = Math.max(1, dayIndex(to));
  const xOf = (date: string): number => L + (dayIndex(date) / total) * (W - L - R);
  const yOf = (v: number): number => T + ((v - lo) / (hi - lo)) * (H - T - B);
  const label = (date: string): string => `${Number(date.split("-")[1])}/${Number(date.split("-")[2])}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="就寝時刻の推移" style={{ display: "block" }}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={yOf(v)} y2={yOf(v)} stroke={LINE} strokeWidth={1} />
          <text x={L - 6} y={yOf(v) + 3} textAnchor="end" fontSize={9} fill={TEXT_MUTED}>
            {formatBedtime(v)}
          </text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={yOf(avg)} y2={yOf(avg)} stroke={ACCENT} strokeWidth={1} strokeDasharray="3 3" opacity={0.8} />
      {list.map((b) => (
        <circle key={b.date} cx={xOf(b.date)} cy={yOf(b.min)} r={3} fill={ACCENT} />
      ))}
      <text x={L} y={H - 6} fontSize={9} fill={TEXT_MUTED}>
        {label(from)}
      </text>
      <text x={W - R} y={H - 6} textAnchor="end" fontSize={9} fill={TEXT_MUTED}>
        {label(to)}
      </text>
    </svg>
  );
};

type Props = { days: BodyDay[]; ratings: RatingMap; stepsTarget: number };

const AnalysisPage: React.FC<Props> = ({ days, ratings, stepsTarget }) => {
  const today = localDate(new Date());
  const [windowDays, setWindowDays] = useState(30);
  const ratingOf = (date: string): number | null => ratings[date] ?? null;

  const inWindow = useMemo(() => {
    if (windowDays === 0) return days;
    const from = shiftDate(today, -(windowDays - 1));
    return days.filter((d) => d.date >= from && d.date <= today);
  }, [days, windowDays, today]);

  const split = useMemo(() => sleepVsRating(inWindow, (d) => ratings[d] ?? null), [inWindow, ratings]);
  const night = useMemo(() => stepsVsNextNight(inWindow, stepsTarget), [inWindow, stepsTarget]);
  const bedtimes = useMemo(() => bedtimesOf(inWindow), [inWindow]);
  const spread = bedtimeSpread(bedtimes);
  const kcal = useMemo(() => kcalSummary(inWindow), [inWindow]);
  const weekdayKcal = useMemo(() => kcalByWeekday(inWindow), [inWindow]);
  const kSplit = useMemo(() => splitByKcal(inWindow, (d) => ratings[d] ?? null), [inWindow, ratings]);
  const wSplit = useMemo(() => splitByWorkout(inWindow, (d) => ratings[d] ?? null), [inWindow, ratings]);
  // 「いまの状態」は期間の選択に関係なく、いまを基準にする
  const debt = useMemo(() => sleepDebt(days, today, 7), [days, today]);
  const streak = useMemo(() => sleepStreaks(days, today), [days, today]);
  const week = useMemo(() => weekCompare(days, (d) => ratings[d] ?? null, today), [days, ratings, today]);

  // 気づき（文章）。比べられるだけ記録がたまっているものだけ出す
  const insights: string[] = [];
  if (split.enough.n >= MIN_N && split.short.n >= MIN_N) {
    const a = pct(split.enough.counts[3], split.enough.n);
    const b = pct(split.short.counts[3], split.short.n);
    const tail = a - b >= 15 ? "睡眠時間と調子に関係がありそう。" : a - b <= -15 ? "長く寝た日の方が調子がいい、とは出ていない。" : "睡眠時間だけでは、調子に大きな差は出ていない。";
    insights.push(`7時間以上寝た日は「いい」が${a}%、未満の日は${b}%。${tail}`);
  }
  if (night.active.n >= MIN_N && night.quiet.n >= MIN_N && night.active.sleepAvg !== null && night.quiet.sleepAvg !== null) {
    const d = night.active.sleepAvg - night.quiet.sleepAvg;
    insights.push(
      Math.abs(d) >= 15
        ? `${stepsTarget.toLocaleString("ja-JP")}歩以上歩いた日の夜は、そうでない日より睡眠が${formatMinutes(Math.abs(d))}${d > 0 ? "長い" : "短い"}。`
        : "歩数が多い日と少ない日で、その夜の睡眠時間に大きな差は出ていない。",
    );
  }
  if (kSplit.threshold !== null && kSplit.high.n >= MIN_N && kSplit.low.n >= MIN_N) {
    const thr = `${Math.round(kSplit.threshold).toLocaleString("ja-JP")}kcal`;
    if (kSplit.high.nextSleepAvg !== null && kSplit.low.nextSleepAvg !== null && kSplit.high.nextSleepN >= MIN_N && kSplit.low.nextSleepN >= MIN_N) {
      const d = kSplit.high.nextSleepAvg - kSplit.low.nextSleepAvg;
      insights.push(
        Math.abs(d) >= 15
          ? `活動カロリーが多い日（${thr}以上）の夜は、少ない日より睡眠が${formatMinutes(Math.abs(d))}${d > 0 ? "長い" : "短い"}。`
          : `活動カロリーが多い日と少ない日で、その夜の睡眠時間に大きな差は出ていない。`,
      );
    }
    if (kSplit.high.rating.n >= MIN_N && kSplit.low.rating.n >= MIN_N) {
      const a = pct(kSplit.high.rating.counts[3], kSplit.high.rating.n);
      const b = pct(kSplit.low.rating.counts[3], kSplit.low.rating.n);
      insights.push(`活動カロリーが多い日は「いい」が${a}%、少ない日は${b}%。`);
    }
  }
  if (wSplit.withWorkout.n >= MIN_N && wSplit.without.n >= MIN_N && wSplit.withWorkout.nextSleepN >= MIN_N && wSplit.without.nextSleepN >= MIN_N && wSplit.withWorkout.nextSleepAvg !== null && wSplit.without.nextSleepAvg !== null) {
    const d = wSplit.withWorkout.nextSleepAvg - wSplit.without.nextSleepAvg;
    insights.push(
      Math.abs(d) >= 15
        ? `運動した日の夜は、しなかった日より睡眠が${formatMinutes(Math.abs(d))}${d > 0 ? "長い" : "短い"}。`
        : "運動した日としなかった日で、その夜の睡眠時間に大きな差は出ていない。",
    );
  }
  if (debt.recorded >= 3) {
    insights.push(debt.debtMin === 0 ? "直近7日は、7時間に足りない日がない。" : `直近7日の睡眠不足は、合計${formatMinutes(debt.debtMin)}。`);
  }
  if (spread && bedtimes.length >= MIN_N) {
    const sd = Math.round(spread.sd);
    insights.push(`就寝は平均${formatBedtime(spread.avg)}、ばらつきは±${sd}分。${sd >= 60 ? "寝る時刻がかなりばらついている。" : sd <= 30 ? "規則的に寝られている。" : ""}`);
  }

  const ratingAvgText = (v: number | null): string => (v === null ? "—" : v.toFixed(1));
  const wk = week;
  const sleepDelta = wk.thisWeek.sleepAvg !== null && wk.lastWeek.sleepAvg !== null ? Math.round(wk.thisWeek.sleepAvg - wk.lastWeek.sleepAvg) : null;
  const stepsDelta = wk.thisWeek.stepsAvg !== null && wk.lastWeek.stepsAvg !== null ? Math.round(wk.thisWeek.stepsAvg - wk.lastWeek.stepsAvg) : null;
  const kcalDelta = wk.thisWeek.kcalActiveAvg !== null && wk.lastWeek.kcalActiveAvg !== null ? Math.round(wk.thisWeek.kcalActiveAvg - wk.lastWeek.kcalActiveAvg) : null;
  const ratingDelta = wk.thisWeek.ratingAvg !== null && wk.lastWeek.ratingAvg !== null ? Math.round((wk.thisWeek.ratingAvg - wk.lastWeek.ratingAvg) * 10) / 10 : null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${WINDOWS.length}, minmax(0, 1fr))`, gap: 6 }}>
        {WINDOWS.map((w) => {
          const on = w.n === windowDays;
          return (
            <button
              key={w.n}
              type="button"
              onClick={() => setWindowDays(w.n)}
              aria-pressed={on}
              style={{ all: "unset", boxSizing: "border-box", textAlign: "center", padding: "8px 0", borderRadius: 8, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", color: on ? TEXT_MAIN : TEXT_MUTED, background: on ? SURFACE_2 : "transparent", border: `1px solid ${on ? LINE_2 : LINE}` }}
            >
              {w.label}
            </button>
          );
        })}
      </div>

      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <CardTitle title="気づき" note={`${windowDays === 0 ? "読み込んでいる分すべて" : `直近${windowDays}日`}の記録から。因果ではなく「そう見える」という目安です。`} />
        {insights.length === 0 ? (
          <div style={{ fontSize: "0.82rem", color: TEXT_MUTED, lineHeight: 1.8 }}>記録がたまると、ここに気づきが出ます。睡眠と調子の記録がそれぞれ{MIN_N}日分以上いります。</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {insights.map((t) => (
              <div key={t} style={{ fontSize: "0.86rem", color: TEXT_MAIN, lineHeight: 1.75, paddingLeft: 10, borderLeft: `2px solid ${ACCENT}` }}>
                {t}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <CardTitle title="いまの状態" note="今日までの7日。先週は、その前の7日" />
        <Row first label="睡眠（平均）" value={wk.thisWeek.sleepAvg === null ? "—" : formatMinutes(wk.thisWeek.sleepAvg)} sub={sleepDelta === null ? undefined : `先週比 ${signed(sleepDelta, (x) => formatMinutes(x))}`} />
        <Row label="歩数（平均）" value={wk.thisWeek.stepsAvg === null ? "—" : `${Math.round(wk.thisWeek.stepsAvg).toLocaleString("ja-JP")}歩`} sub={stepsDelta === null ? undefined : `先週比 ${signed(stepsDelta, (x) => `${x.toLocaleString("ja-JP")}歩`)}`} />
        <Row label="活動カロリー（平均）" value={wk.thisWeek.kcalActiveAvg === null ? "—" : `${Math.round(wk.thisWeek.kcalActiveAvg).toLocaleString("ja-JP")} kcal`} sub={kcalDelta === null ? undefined : `先週比 ${signed(kcalDelta, (x) => `${x.toLocaleString("ja-JP")} kcal`)}`} />
        <Row label="調子（平均）" value={`${ratingAvgText(wk.thisWeek.ratingAvg)} / 3`} sub={ratingDelta === null ? undefined : `先週比 ${signed(ratingDelta, (x) => x.toFixed(1))}`} />
        <Row label="睡眠負債" value={debt.recorded === 0 ? "—" : debt.debtMin === 0 ? "なし" : `${formatMinutes(debt.debtMin)} 不足`} sub={`7時間（${formatMinutes(SLEEP_TARGET_MIN)}）に足りなかった分の合計`} />
        <Row label="7時間以上の連続" value={`${streak.current}日`} sub={`期間内の最長 ${streak.longest}日`} />
      </div>

      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <CardTitle title="睡眠と調子" note="その日の睡眠が7時間以上かどうかで、その日の調子がどう分かれるか" />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
          <RatingBar title="7時間以上" split={split.enough} />
          <RatingBar title="7時間未満" split={split.short} />
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <CardTitle title="歩数と睡眠" note={`${stepsTarget.toLocaleString("ja-JP")}歩以上歩いた日の「その夜」の睡眠（翌朝の記録）`} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
          {([
            { title: "歩いた日", s: night.active },
            { title: "少なかった日", s: night.quiet },
          ] as const).map(({ title, s }) => (
            <div key={title} style={{ minWidth: 0 }}>
              <div style={{ fontSize: "0.72rem", color: TEXT_MUTED }}>
                {title}の夜（{s.n}日）
              </div>
              {s.n < MIN_N ? (
                <div style={{ marginTop: 10, fontSize: "0.74rem", color: TEXT_MUTED, lineHeight: 1.6 }}>あと{MIN_N - s.n}日分たまると出ます</div>
              ) : (
                <>
                  <div style={{ marginTop: 6, fontSize: "1.3rem", fontWeight: 600, color: TEXT_MAIN }}>{formatMinutes(s.sleepAvg)}</div>
                  <div style={{ marginTop: 2, fontSize: "0.76rem", color: TEXT_SUB }}>深い睡眠 {s.deepPctAvg === null ? "—" : `${Math.round(s.deepPctAvg)}%`}</div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <CardTitle title="カロリー" note="活動カロリー＝体を動かして使った分。総消費＝それに基礎代謝を足した1日の合計。中継アプリ1.3以降の記録が対象" />
        {kcal.n === 0 ? (
          <div style={{ fontSize: "0.82rem", color: TEXT_MUTED, lineHeight: 1.8 }}>この期間にカロリーの記録がありません。</div>
        ) : (
          <>
            <Row first label="活動カロリー（平均）" value={kcal.activeAvg === null ? "—" : `${Math.round(kcal.activeAvg).toLocaleString("ja-JP")} kcal`} sub={`${kcal.n}日分`} />
            <Row label="総消費（平均）" value={kcal.totalAvg === null ? "—" : `${Math.round(kcal.totalAvg).toLocaleString("ja-JP")} kcal`} />
            <Row label="活動の割合" value={kcal.activeShare === null ? "—" : `${Math.round(kcal.activeShare)}%`} sub="総消費のうち、動いて使った分" />
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
              <div style={{ fontSize: "0.72rem", color: TEXT_MUTED, marginBottom: 8 }}>曜日ごとの活動カロリー（平均）</div>
              <WeekdayBars data={weekdayKcal} />
            </div>
          </>
        )}
      </div>

      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <CardTitle
          title="活動量と睡眠・調子"
          note={kSplit.threshold === null ? "活動カロリーを、期間の中央値で「多い日」「少ない日」に分けて比べる" : `活動カロリーが ${Math.round(kSplit.threshold).toLocaleString("ja-JP")} kcal 以上の日と未満の日（期間の中央値で分ける）`}
        />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
          <GroupCol title="多い日" g={kSplit.high} kcalSub />
          <GroupCol title="少ない日" g={kSplit.low} kcalSub />
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <CardTitle title="運動した日" note="バンドが運動（ウォーキングなど）を記録した日としなかった日。「その夜の睡眠」は翌朝の記録" />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16 }}>
          <GroupCol title="運動した日" g={wSplit.withWorkout} />
          <GroupCol title="しなかった日" g={wSplit.without} />
        </div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <CardTitle title="就寝時刻" note="寝た時刻を日ごとに点で。上ほど早く、下ほど遅い。点線は平均" />
        {spread && bedtimes.length >= 2 ? (
          <>
            <BedtimeChart list={bedtimes} from={bedtimes[0].date} to={bedtimes[bedtimes.length - 1].date} avg={spread.avg} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
              {[
                { label: "平均", value: formatBedtime(spread.avg) },
                { label: "ばらつき", value: `±${Math.round(spread.sd)}分` },
                { label: "いちばん遅い", value: formatBedtime(Math.max(...bedtimes.map((b) => b.min))) },
              ].map((x) => (
                <div key={x.label} style={{ minWidth: 0 }}>
                  <div style={{ fontSize: "0.7rem", color: TEXT_MUTED }}>{x.label}</div>
                  <div style={{ fontSize: "0.95rem", marginTop: 2, color: TEXT_MAIN }}>{x.value}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ fontSize: "0.82rem", color: TEXT_MUTED, lineHeight: 1.8 }}>寝た時刻の記録が2日分以上たまると出ます。</div>
        )}
      </div>
    </>
  );
};

export default AnalysisPage;
