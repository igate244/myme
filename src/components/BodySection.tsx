// src/components/BodySection.tsx — からだ（スマートバンドの日々の記録）
//
// データは Firestore（users/{uid}/health）にあり、中継アプリ（android/）が毎日送ってくる。
// ここでは読んで見せるだけ。端末内の DB には入れない。
// その日の調子（5段階）は自分で付ける記録で、users/{uid}/bodyRatings に保存する（中継アプリの上書きに巻き込まれない）。
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { BodyDay, RoomSummary } from "../domain/body";
import { RATING_LABELS, formatClock, formatDayLabel, formatMinutes, parseRoomSamples, parseSwitchBotCsv, summarizeRoom, workoutName } from "../domain/body";
import type { RatingMap, RoomDocs } from "../infrastructure/bodyRemote";
import {
  cacheRating,
  fetchBodyDays,
  fetchRatings,
  fetchRoomDocs,
  importRoomSamples,
  loadCachedBodyDays,
  loadCachedRoomDocs,
  loadCachedRatings,
  makePairingCode,
  saveRating,
} from "../infrastructure/bodyRemote";
import SectionHeader from "./SectionHeader";
import {
  outerStyle,
  scrollAreaStyle,
  contentMaxWidth,
  cardStyle,
  textareaStyle,
  secondaryButtonStyle,
  errorTextStyle,
  emptyStateStyle,
  ACCENT,
  ACCENT_STRONG,
  LINE,
  LINE_2,
  OK_COLOR,
  SURFACE_2,
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_SUB,
  WARN_COLOR,
  SECTION_COLORS,
} from "./uiStyles";

type Props = { onBack: () => void };

const ACCENT_BODY = SECTION_COLORS.body;
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const TWO_COLS = "minmax(0, 1fr) minmax(0, 1fr)";

const stepsText = (d: BodyDay): string => (d.steps === null ? "—" : d.steps.toLocaleString("ja-JP"));
const sleepText = (d: BodyDay): string => (d.sleepMin === null ? "—" : formatMinutes(d.sleepMin));

const monthOf = (date: string): string => {
  const [y, m] = date.split("-");
  return `${y}年${Number(m)}月`;
};

/** 面ひとつ（小さな見出し＋大きい数字＋補足） */
const Tile: React.FC<{ label: string; value: string; unit?: string; sub?: string; children?: React.ReactNode; wide?: boolean }> = ({
  label,
  value,
  unit,
  sub,
  children,
  wide,
}) => (
  <div style={{ ...cardStyle, marginBottom: 0, padding: "14px 16px 16px", gridColumn: wide ? "1 / -1" : undefined, minWidth: 0 }}>
    <div style={{ fontSize: "0.74rem", color: TEXT_MUTED }}>{label}</div>
    <div style={{ marginTop: 6, fontSize: "1.7rem", fontWeight: 600, lineHeight: 1.15, color: TEXT_MAIN, wordBreak: "break-word" }}>
      {value}
      {unit && value !== "—" && <span style={{ fontSize: "0.78rem", fontWeight: 400, color: TEXT_MUTED, marginLeft: 4 }}>{unit}</span>}
    </div>
    {sub && <div style={{ marginTop: 6, fontSize: "0.78rem", color: TEXT_SUB, lineHeight: 1.6, wordBreak: "break-word" }}>{sub}</div>}
    {children}
  </div>
);

/** 睡眠の内訳を、平らな帯で見せる */
const StageBar: React.FC<{ day: BodyDay }> = ({ day }) => {
  const parts = [
    { name: "深い", min: day.deepMin, color: ACCENT_STRONG },
    { name: "浅い", min: day.lightMin, color: ACCENT },
    { name: "レム", min: day.remMin, color: OK_COLOR },
    { name: "覚醒", min: day.awakeMin, color: LINE_2 },
  ].filter((p) => p.min !== null && p.min > 0) as { name: string; min: number; color: string }[];
  if (parts.length === 0) return null;
  const total = parts.reduce((a, p) => a + p.min, 0);
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", height: 10, borderRadius: 3, overflow: "hidden", gap: 2 }}>
        {parts.map((p) => (
          <div key={p.name} style={{ width: `${(p.min / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 8, fontSize: "0.74rem", color: TEXT_SUB }}>
        {parts.map((p) => (
          <span key={p.name}>
            <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: p.color, marginRight: 5 }} />
            {p.name} {formatMinutes(p.min)}
          </span>
        ))}
      </div>
    </div>
  );
};

/** 選んだ日のまとめ */
const DayView: React.FC<{ day: BodyDay; room?: RoomSummary }> = ({ day, room }) => {
  const spo2 = day.spo2Avg === null ? "—" : String(Math.round(day.spo2Avg));
  const spo2Sub = day.spo2Min !== null ? `最低 ${Math.round(day.spo2Min)}%` : undefined;
  const kcalSub =
    day.kcalActive == null ? "中継アプリ1.3で許可すると入ります" : day.kcalTotal != null ? `総消費 ${day.kcalTotal.toLocaleString("ja-JP")} kcal` : undefined;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: TWO_COLS, gap: 10 }}>
        <Tile label="歩数" value={stepsText(day)} unit="歩" />
        <Tile label="活動中の消費カロリー" value={day.kcalActive == null ? "—" : day.kcalActive.toLocaleString("ja-JP")} unit="kcal" sub={kcalSub} />
        <Tile
          wide
          label="睡眠"
          value={sleepText(day)}
          sub={
            [
              day.sleepStartMs === null ? "" : `${formatClock(day.sleepStartMs)} 〜 ${formatClock(day.sleepEndMs)}`,
              day.hrSleepAvg == null ? "" : `睡眠中の心拍 平均${day.hrSleepAvg}${day.hrSleepMin != null ? `・最低${day.hrSleepMin}` : ""}`,
            ]
              .filter(Boolean)
              .join("　") || undefined
          }
        >
          <StageBar day={day} />
        </Tile>
        <Tile label="睡眠中の部屋" value={room ? room.tempAvg.toFixed(1) : "—"} unit="℃" sub={room ? `湿度 ${Math.round(room.humAvg)}%` : "SwitchBot を中継アプリに入れると出ます"} />
        <Tile label="血中酸素" value={spo2} unit="%" sub={spo2Sub} />
      </div>
      {day.workouts.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 0, marginTop: 10, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: "0.74rem", color: TEXT_MUTED }}>運動</div>
          {day.workouts.map((w) => (
            <div key={`${w.startMs}-${w.type}`} style={{ fontSize: "0.86rem", color: TEXT_SUB }}>
              {workoutName(w.type)}　{formatClock(w.startMs)}〜{formatClock(w.endMs)}
              {w.distanceM !== null && w.distanceM > 0 ? `　${(w.distanceM / 1000).toFixed(1)}km` : ""}
            </div>
          ))}
        </div>
      )}
    </>
  );
};

/** その日の調子（1〜5）。もう一度押すと消える */
const RatingCard: React.FC<{ rating: number | null; onChange: (r: number | null) => void }> = ({ rating, onChange }) => (
  <div style={{ ...cardStyle, marginBottom: 0, padding: "14px 16px 16px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600 }}>この日の調子</span>
      <span style={{ fontSize: "0.8rem", color: rating === null ? TEXT_MUTED : ACCENT_BODY }}>{rating === null ? "まだ付けてない" : RATING_LABELS[rating]}</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
      {[1, 2, 3, 4, 5].map((n) => {
        const on = rating === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(on ? null : n)}
            aria-pressed={on}
            style={{
              all: "unset",
              boxSizing: "border-box",
              textAlign: "center",
              padding: "12px 0",
              borderRadius: 8,
              fontSize: "1.05rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              color: on ? "#111214" : TEXT_SUB,
              background: on ? ACCENT_BODY : SURFACE_2,
              border: `1px solid ${on ? ACCENT_BODY : LINE_2}`,
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: "0.68rem", color: TEXT_MUTED }}>
      <span>だめ</span>
      <span>最高</span>
    </div>
  </div>
);

/** 睡眠を棒の上に出す短い形（7時間54分 → 7h54） */
const shortSleep = (min: number): string => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;

/** 直近7日の棒グラフ（平らな棒＋数字。左が古い日。押すとその日を開く） */
const WeekBars: React.FC<{ days: BodyDay[]; ratings: RatingMap; selected: string; onPick: (date: string) => void }> = ({ days, ratings, selected, onPick }) => {
  const week = days.slice(0, 7).reverse();
  if (week.length < 2) return null;
  const maxSteps = Math.max(1, ...week.map((d) => d.steps ?? 0));
  const maxSleep = Math.max(480, ...week.map((d) => d.sleepMin ?? 0));
  const cols = `repeat(${week.length}, minmax(0, 1fr))`;
  const row = (title: string, value: (d: BodyDay) => number | null, max: number, text: (v: number) => string) => (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: "0.72rem", color: TEXT_MUTED, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 4, alignItems: "end", height: 78 }}>
        {week.map((d) => {
          const v = value(d);
          const on = d.date === selected;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onPick(d.date)}
              aria-label={`${formatDayLabel(d.date)}を開く`}
              style={{ all: "unset", boxSizing: "border-box", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "stretch", cursor: "pointer", minWidth: 0 }}
            >
              <span style={{ fontSize: "0.6rem", textAlign: "center", color: on ? TEXT_MAIN : TEXT_SUB, marginBottom: 3, whiteSpace: "nowrap" }}>{v === null ? "" : text(v)}</span>
              <span style={{ display: "block", height: v === null ? 2 : Math.max(2, Math.round((v / max) * 50)), background: v === null ? LINE : ACCENT_BODY, opacity: on || v === null ? 1 : 0.55, borderRadius: 2 }} />
            </button>
          );
        })}
      </div>
    </div>
  );
  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600 }}>この7日</div>
      {row("歩数", (d) => d.steps, maxSteps, (v) => v.toLocaleString("ja-JP"))}
      {row("睡眠", (d) => d.sleepMin, maxSleep, shortSleep)}
      {row("調子", (d) => ratings[d.date] ?? null, 5, (v) => String(v))}
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 4, marginTop: 8 }}>
        {week.map((d) => {
          const [y, m, dd] = d.date.split("-").map(Number);
          const on = d.date === selected;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => onPick(d.date)}
              style={{ all: "unset", boxSizing: "border-box", textAlign: "center", padding: "6px 0", fontSize: "0.68rem", lineHeight: 1.4, cursor: "pointer", color: on ? ACCENT_BODY : TEXT_MUTED, fontWeight: on ? 700 : 400, fontFamily: "inherit" }}
            >
              {m}/{dd}
              <br />
              {WEEK[new Date(y, m - 1, dd).getDay()]}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ 項目ごとの詳しい画面 */

/** 項目の値を出すときに使う、日ごとの付け足しデータ */
type Ctx = { ratings: RatingMap; room: Record<string, RoomSummary> };

type MetricKey = "steps" | "sleep" | "sleepHr" | "spo2" | "kcal" | "roomTemp" | "roomHum" | "rating";
type Tab = "all" | MetricKey;

type Metric = {
  key: MetricKey;
  label: string;
  unit: string;
  value: (d: BodyDay, c: Ctx) => number | null;
  /** 数字の見せ方（1日の値・平均など） */
  text: (v: number) => string;
  /** その日の補足（行の右側・大きい数字の下） */
  sub: (d: BodyDay, c: Ctx) => string;
  /** 棒の高さの基準（最大値の下限）と、棒の下限（0 以外にしたい項目だけ） */
  scaleMax: number;
  floor: number;
};

const METRICS: Metric[] = [
  {
    key: "steps",
    label: "歩数",
    unit: "歩",
    value: (d) => d.steps,
    text: (v) => Math.round(v).toLocaleString("ja-JP"),
    sub: (d) => (d.kcalActive == null ? "" : `活動 ${d.kcalActive.toLocaleString("ja-JP")} kcal`),
    scaleMax: 1,
    floor: 0,
  },
  {
    key: "sleep",
    label: "睡眠",
    unit: "",
    value: (d) => d.sleepMin,
    text: (v) => formatMinutes(Math.round(v)),
    sub: (d, c) => {
      const r = c.room[d.date];
      const t = d.sleepStartMs === null ? "" : `${formatClock(d.sleepStartMs)}〜${formatClock(d.sleepEndMs)}`;
      return r ? `${t}　${r.tempAvg.toFixed(1)}℃ ${Math.round(r.humAvg)}%` : t;
    },
    scaleMax: 480,
    floor: 0,
  },
  {
    key: "sleepHr",
    label: "睡眠中心拍",
    unit: "回/分",
    value: (d) => d.hrSleepAvg,
    text: (v) => String(Math.round(v)),
    sub: (d) => (d.hrSleepMin != null ? `最低 ${d.hrSleepMin}` : ""),
    scaleMax: 80,
    floor: 30, // 40〜70 台の差が見えるよう、30 からの高さにする
  },
  {
    key: "spo2",
    label: "血中酸素",
    unit: "%",
    value: (d) => d.spo2Avg,
    text: (v) => (Math.round(v * 10) / 10).toFixed(1),
    sub: (d) => (d.spo2Min !== null ? `最低 ${Math.round(d.spo2Min)}%` : ""),
    scaleMax: 100,
    floor: 85, // 90% 台の差が見えるよう、85% からの高さにする
  },
  {
    key: "kcal",
    label: "カロリー",
    unit: "kcal",
    value: (d) => d.kcalActive,
    text: (v) => Math.round(v).toLocaleString("ja-JP"),
    sub: (d) => (d.kcalTotal == null ? "" : `総 ${d.kcalTotal.toLocaleString("ja-JP")}`),
    scaleMax: 1,
    floor: 0,
  },
  {
    key: "roomTemp",
    label: "室温",
    unit: "℃",
    value: (d, c) => c.room[d.date]?.tempAvg ?? null,
    text: (v) => v.toFixed(1),
    sub: (d, c) => {
      const r = c.room[d.date];
      return r ? `${r.tempMin.toFixed(1)}〜${r.tempMax.toFixed(1)}` : "";
    },
    scaleMax: 30,
    floor: 10, // 睡眠中の室温の差が見えるよう、10℃ からの高さにする
  },
  {
    key: "roomHum",
    label: "湿度",
    unit: "%",
    value: (d, c) => c.room[d.date]?.humAvg ?? null,
    text: (v) => String(Math.round(v)),
    sub: (d, c) => (c.room[d.date] ? `室温 ${c.room[d.date].tempAvg.toFixed(1)}℃` : ""),
    scaleMax: 100,
    floor: 0,
  },
  {
    key: "rating",
    label: "調子",
    unit: "",
    value: (d, c) => c.ratings[d.date] ?? null,
    text: (v) => (Number.isInteger(v) ? `${v}（${RATING_LABELS[v]}）` : (Math.round(v * 10) / 10).toFixed(1)),
    sub: () => "",
    scaleMax: 5,
    floor: 0,
  },
];

const TABS: { key: Tab; label: string }[] = [{ key: "all", label: "すべて" }, ...METRICS.map((m) => ({ key: m.key as Tab, label: m.label }))];

const TabBar: React.FC<{ tab: Tab; onChange: (t: Tab) => void }> = ({ tab, onChange }) => (
  <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 0 4px", scrollbarWidth: "none" }}>
    {TABS.map((t) => {
      const on = t.key === tab;
      return (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          aria-pressed={on}
          style={{ all: "unset", boxSizing: "border-box", flexShrink: 0, padding: "8px 14px", borderRadius: 999, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit", color: on ? "#111214" : TEXT_SUB, background: on ? ACCENT_BODY : SURFACE_2, border: `1px solid ${on ? ACCENT_BODY : LINE_2}` }}
        >
          {t.label}
        </button>
      );
    })}
  </div>
);

const PERIODS: { n: number; label: string }[] = [
  { n: 7, label: "7日" },
  { n: 30, label: "30日" },
  { n: 90, label: "90日" },
  { n: 100000, label: "全部" },
];

/** 睡眠中の室温が高めの晩と低めの晩で、睡眠がどう違うか（記録が6晩たまってから出す） */
const RoomLink: React.FC<{ days: BodyDay[]; ctx: Ctx }> = ({ days, ctx }) => {
  const nights = days
    .map((d) => ({ d, r: ctx.room[d.date] }))
    .filter((x): x is { d: BodyDay; r: RoomSummary } => x.r !== undefined && x.d.sleepMin !== null && x.d.sleepMin > 0);
  if (nights.length < 6) {
    return (
      <div style={{ ...cardStyle, marginBottom: 0, fontSize: "0.8rem", color: TEXT_MUTED, lineHeight: 1.7 }}>
        睡眠と室温の関係は、部屋の記録がついた晩が6晩たまると出ます（いま{nights.length}晩）。
      </div>
    );
  }
  const sorted = [...nights].sort((a, b) => a.r.tempAvg - b.r.tempAvg);
  const half = Math.floor(sorted.length / 2);
  const low = sorted.slice(0, half);
  const high = sorted.slice(sorted.length - half);
  const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const col = (title: string, xs: typeof nights) => {
    const deep = xs.filter((x) => x.d.deepMin !== null).map((x) => ((x.d.deepMin as number) / (x.d.sleepMin as number)) * 100);
    return (
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.72rem", color: TEXT_MUTED }}>{title}（{xs.length}晩）</div>
        <div style={{ fontSize: "0.82rem", color: TEXT_SUB, marginTop: 2 }}>
          {avg(xs.map((x) => x.r.tempAvg)).toFixed(1)}℃ ／ 湿度 {Math.round(avg(xs.map((x) => x.r.humAvg)))}%
        </div>
        <div style={{ fontSize: "1rem", color: TEXT_MAIN, marginTop: 6 }}>{formatMinutes(Math.round(avg(xs.map((x) => x.d.sleepMin as number))))}</div>
        <div style={{ fontSize: "0.78rem", color: TEXT_SUB, marginTop: 2 }}>深い睡眠 {deep.length === 0 ? "—" : `${Math.round(avg(deep))}%`}</div>
      </div>
    );
  };
  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600, marginBottom: 10 }}>室温と睡眠</div>
      <div style={{ display: "grid", gridTemplateColumns: TWO_COLS, gap: 14 }}>
        {col("低めの晩", low)}
        {col("高めの晩", high)}
      </div>
      <div style={{ marginTop: 10, fontSize: "0.7rem", color: TEXT_MUTED, lineHeight: 1.6 }}>室温の低い半分と高い半分に分けた平均です。晩数が少ないうちは目安として。</div>
    </div>
  );
};

/** 1つの項目を詳しく見る：選んだ日・期間の推移・平均/最高/最低・日ごとの一覧 */
const MetricDetail: React.FC<{ metric: Metric; days: BodyDay[]; ctx: Ctx; day: BodyDay; onPick: (date: string) => void }> = ({
  metric,
  days,
  ctx,
  day,
  onPick,
}) => {
  const [period, setPeriod] = useState(30);
  const list = days.slice(0, Math.min(period, days.length));
  const withV = list.map((d) => ({ d, v: metric.value(d, ctx) }));
  const values = withV.map((x) => x.v).filter((v): v is number => v !== null);
  const avg = values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;
  const max = values.length === 0 ? null : Math.max(...values);
  const min = values.length === 0 ? null : Math.min(...values);
  const todayV = metric.value(day, ctx);
  const scaleTop = Math.max(metric.scaleMax, max ?? 0);
  const bars = [...withV].reverse(); // 左が古い日
  const showNumbers = bars.length <= 7;
  const barH = (v: number): number => Math.max(2, Math.round(((v - metric.floor) / (scaleTop - metric.floor)) * 90));
  const stat = (label: string, v: number | null) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: "0.7rem", color: TEXT_MUTED }}>{label}</div>
      <div style={{ fontSize: "0.95rem", marginTop: 2, color: TEXT_MAIN, wordBreak: "break-word" }}>{v === null ? "—" : metric.text(v)}</div>
    </div>
  );
  return (
    <>
      <Tile label={`${formatDayLabel(day.date)}の${metric.label}`} value={todayV === null ? "—" : metric.text(todayV)} unit={metric.unit} sub={metric.sub(day, ctx) || undefined}>
        {metric.key === "sleep" && <StageBar day={day} />}
      </Tile>

      {metric.key === "sleep" && <RoomLink days={days} ctx={ctx} />}

      <div style={{ ...cardStyle, marginBottom: 0 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
          {PERIODS.map((p) => {
            const on = p.n === period;
            return (
              <button
                key={p.n}
                type="button"
                onClick={() => setPeriod(p.n)}
                aria-pressed={on}
                style={{ all: "unset", boxSizing: "border-box", textAlign: "center", padding: "8px 0", borderRadius: 8, fontSize: "0.82rem", cursor: "pointer", fontFamily: "inherit", color: on ? TEXT_MAIN : TEXT_MUTED, background: on ? SURFACE_2 : "transparent", border: `1px solid ${on ? LINE_2 : "transparent"}` }}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, bars.length)}, minmax(0, 1fr))`, gap: bars.length > 30 ? 1 : 3, alignItems: "end", height: 120, marginTop: 14 }}>
          {bars.map(({ d, v }) => {
            const on = d.date === day.date;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onPick(d.date)}
                aria-label={`${formatDayLabel(d.date)}を開く`}
                style={{ all: "unset", boxSizing: "border-box", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", cursor: "pointer", minWidth: 0 }}
              >
                {showNumbers && <span style={{ fontSize: "0.6rem", textAlign: "center", color: on ? TEXT_MAIN : TEXT_SUB, marginBottom: 3, whiteSpace: "nowrap" }}>{v === null ? "" : metric.key === "sleep" ? shortSleep(v) : metric.text(v).split("（")[0]}</span>}
                <span style={{ display: "block", height: v === null ? 2 : barH(v), background: v === null ? LINE : ACCENT_BODY, opacity: on || v === null ? 1 : 0.55, borderRadius: 1 }} />
              </button>
            );
          })}
        </div>
        {bars.length > 1 && (
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: "0.68rem", color: TEXT_MUTED }}>
            <span>{formatDayLabel(bars[0].d.date)}</span>
            <span>{formatDayLabel(bars[bars.length - 1].d.date)}</span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
          {stat("平均", avg)}
          {stat("最高", max)}
          {stat("最低", min)}
        </div>
        <div style={{ marginTop: 8, fontSize: "0.7rem", color: TEXT_MUTED }}>{values.length}日分の記録</div>
      </div>

      <div style={{ ...cardStyle, marginBottom: 0, padding: "14px 16px 6px" }}>
        <div style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600, paddingBottom: 6 }}>日ごと</div>
        {withV.map(({ d, v }) => (
          <button
            key={d.date}
            type="button"
            onClick={() => onPick(d.date)}
            style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr)", gap: 8, alignItems: "baseline", padding: "12px 2px", borderTop: `1px solid ${LINE}`, cursor: "pointer", color: d.date === day.date ? ACCENT_BODY : TEXT_MAIN, fontFamily: "inherit" }}
          >
            <span style={{ fontSize: "0.88rem" }}>{formatDayLabel(d.date)}</span>
            <span style={{ fontSize: "0.88rem", textAlign: "right" }}>
              {v === null ? "—" : metric.text(v)}
              {v !== null && metric.unit && <span style={{ color: TEXT_MUTED, fontSize: "0.7rem" }}> {metric.unit}</span>}
            </span>
            <span style={{ fontSize: "0.78rem", textAlign: "right", color: TEXT_SUB, wordBreak: "break-word" }}>{metric.sub(d, ctx)}</span>
          </button>
        ))}
      </div>
    </>
  );
};

/** 過去の1日分（タップするとその日を上に出す） */
const HistoryRow: React.FC<{ day: BodyDay; rating: number | null; active: boolean; onPick: () => void }> = ({ day, rating, active, onPick }) => (
  <button
    type="button"
    onClick={onPick}
    style={{
      all: "unset",
      boxSizing: "border-box",
      width: "100%",
      display: "grid",
      gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr) 1.4rem",
      gap: 8,
      alignItems: "baseline",
      padding: "12px 2px",
      borderTop: `1px solid ${LINE}`,
      cursor: "pointer",
      color: active ? ACCENT_BODY : TEXT_MAIN,
      fontFamily: "inherit",
    }}
  >
    <span style={{ fontSize: "0.88rem" }}>{formatDayLabel(day.date)}</span>
    <span style={{ fontSize: "0.88rem", textAlign: "right" }}>
      {stepsText(day)}
      <span style={{ color: TEXT_MUTED, fontSize: "0.7rem" }}> 歩</span>
    </span>
    <span style={{ fontSize: "0.88rem", textAlign: "right", color: TEXT_SUB }}>{sleepText(day)}</span>
    <span style={{ fontSize: "0.88rem", textAlign: "right", color: rating === null ? LINE_2 : ACCENT_BODY }}>{rating ?? "·"}</span>
  </button>
);

const NavButton: React.FC<{ label: string; disabled: boolean; onClick: () => void }> = ({ label, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label === "‹" ? "前の日" : "次の日"}
    style={{ all: "unset", boxSizing: "border-box", width: 44, height: 44, textAlign: "center", lineHeight: "44px", fontSize: "1.6rem", cursor: disabled ? "default" : "pointer", color: disabled ? LINE_2 : TEXT_SUB, fontFamily: "inherit" }}
  >
    {label}
  </button>
);

const BodySection: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const [days, setDays] = useState<BodyDay[]>(() => loadCachedBodyDays());
  const [ratings, setRatings] = useState<RatingMap>(() => loadCachedRatings());
  const [roomDocs, setRoomDocs] = useState<RoomDocs>(() => loadCachedRoomDocs());
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(90);
  const [code, setCode] = useState<string | null>(null);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [loaded, loadedRatings, loadedRoom] = await Promise.all([
        fetchBodyDays(user.uid, range),
        fetchRatings(user.uid).catch(() => null),
        fetchRoomDocs(user.uid, range).catch(() => null),
      ]);
      setDays(loaded);
      if (loadedRatings) setRatings(loadedRatings);
      if (loadedRoom) setRoomDocs(loadedRoom);
    } catch (e) {
      console.error(e);
      const errCode = e instanceof Error ? ((e as { code?: string }).code ?? e.message) : String(e);
      setError(
        `${days.length > 0 ? "最新を読み込めなかったので、前回の分を出しています。" : "読み込めませんでした。電波の良いところでもう一度。"}（${errCode}）`,
      );
    } finally {
      setLoading(false);
    }
    // days は表示メッセージの分岐にだけ使う。依存に入れると読み込みが繰り返される。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, range]);

  useEffect(() => {
    void load();
  }, [load]);

  // 睡眠の時間帯（寝た〜起きた）の部屋の平均。部屋の記録が無い晩は入らない
  const room = useMemo(() => {
    const samples = Object.values(roomDocs).flatMap((raw) => parseRoomSamples(raw));
    const out: Record<string, RoomSummary> = {};
    for (const d of days) {
      if (d.sleepStartMs === null || d.sleepEndMs === null) continue;
      const r = summarizeRoom(samples, d.sleepStartMs, d.sleepEndMs);
      if (r) out[d.date] = r;
    }
    return out;
  }, [roomDocs, days]);
  const ctx: Ctx = useMemo(() => ({ ratings, room }), [ratings, room]);

  const index = Math.max(0, days.findIndex((d) => d.date === selected)); // 未選択・見つからないときは最新日
  const day: BodyDay | undefined = days[index];

  const changeRating = (value: number | null): void => {
    if (!user || !day) return;
    const date = day.date;
    const before = ratings;
    setRatings(cacheRating(ratings, date, value)); // 先に画面へ出し、保存に失敗したら戻す
    saveRating(user.uid, date, value).catch((e) => {
      console.error(e);
      setRatings(cacheRating(before, date, before[date] ?? null));
      setError("調子を保存できませんでした。電波の良いところでもう一度。");
    });
  };

  const pick = (date: string): void => {
    setSelected(date);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const importCsv = async (file: File | undefined): Promise<void> => {
    if (!user || !file) return;
    setImporting(true);
    setImportMessage("読み込み中…");
    try {
      const samples = parseSwitchBotCsv(await file.text());
      if (samples.length === 0) {
        setImportMessage("温度と湿度の列が見つかりませんでした。SwitchBot の履歴の書き出しファイルか確認してください。");
        return;
      }
      const dayCount = await importRoomSamples(user.uid, samples);
      setImportMessage(`${samples.length}件（${dayCount}日分）を取り込みました。`);
      await load();
    } catch (e) {
      console.error(e);
      setImportMessage(`取り込めませんでした（${e instanceof Error ? ((e as { code?: string }).code ?? e.message) : String(e)}）`);
    } finally {
      setImporting(false);
    }
  };

  const showCode = async (): Promise<void> => {
    if (!user) return;
    try {
      setCodeMessage(null);
      setCode(await makePairingCode(user.uid));
    } catch (e) {
      console.error(e);
      setCodeMessage(e instanceof Error ? e.message : "連携コードを作れませんでした");
    }
  };

  const copyCode = async (): Promise<void> => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCodeMessage("コピーしました。中継アプリに貼ってください。");
    } catch {
      setCodeMessage("コピーできませんでした。枠を長押しして全選択→コピーしてください。");
    }
  };

  return (
    <div style={outerStyle}>
      <SectionHeader title="からだ" onBack={onBack} accentColor={SECTION_COLORS.body} />

      <div style={scrollAreaStyle}>
        <div style={{ width: "100%", maxWidth: contentMaxWidth, paddingBottom: 48, display: "flex", flexDirection: "column", gap: 10 }}>
          {error && <p style={errorTextStyle}>{error}</p>}

          {!day ? (
            <p style={emptyStateStyle}>
              {loading ? "読み込み中…" : "まだバンドの記録が届いていません。下の「バンド連携」で中継アプリとつなぐと、毎日ここに入ります。"}
            </p>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) 44px", alignItems: "center" }}>
                <NavButton label="‹" disabled={index >= days.length - 1} onClick={() => setSelected(days[index + 1].date)} />
                <div style={{ textAlign: "center", fontSize: "1.25rem", fontWeight: 600 }}>{formatDayLabel(day.date)}</div>
                <NavButton label="›" disabled={index <= 0} onClick={() => setSelected(days[index - 1].date)} />
              </div>

              <TabBar tab={tab} onChange={setTab} />

              {tab === "all" ? (
                <>
                  <DayView day={day} room={room[day.date]} />
                  <RatingCard rating={ratings[day.date] ?? null} onChange={changeRating} />
                  <WeekBars days={days} ratings={ratings} selected={day.date} onPick={pick} />

                  <div style={{ ...cardStyle, marginBottom: 0, padding: "14px 16px 6px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: 6 }}>
                      <span style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600 }}>これまで</span>
                      <span style={{ fontSize: "0.7rem", color: TEXT_MUTED }}>歩数　睡眠　調子</span>
                    </div>
                    {days.map((d, i) => {
                      const newMonth = i === 0 || monthOf(days[i - 1].date) !== monthOf(d.date);
                      return (
                        <React.Fragment key={d.date}>
                          {newMonth && <div style={{ fontSize: "0.72rem", color: ACCENT_BODY, margin: i === 0 ? "6px 0 2px" : "18px 0 2px" }}>{monthOf(d.date)}</div>}
                          <HistoryRow day={d} rating={ratings[d.date] ?? null} active={d.date === day.date} onPick={() => pick(d.date)} />
                        </React.Fragment>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <MetricDetail metric={METRICS.find((m) => m.key === tab) as Metric} days={days} ctx={ctx} day={day} onPick={pick} />
                  {tab === "rating" && <RatingCard rating={ratings[day.date] ?? null} onChange={changeRating} />}
                </>
              )}

              <button type="button" disabled={loading} onClick={() => setRange((r) => r + 180)} style={{ ...secondaryButtonStyle, width: "100%" }}>
                {loading ? "読み込み中…" : "さらに前を見る"}
              </button>
              <p style={{ margin: "0 4px", fontSize: "0.75rem", color: TEXT_MUTED, lineHeight: 1.6 }}>
                記録はクラウドにずっと残ります。この端末には直近の分だけ控えています。
              </p>
            </>
          )}

          <section style={{ marginTop: 20 }}>
            <div style={{ fontSize: "0.75rem", color: TEXT_MUTED, fontWeight: 600, margin: "0 4px 8px" }}>バンド連携</div>
            <div style={{ ...cardStyle, marginBottom: 0 }}>
              <p style={{ margin: 0, fontSize: "0.85rem", color: TEXT_SUB, lineHeight: 1.7 }}>
                中継アプリに貼る連携コードを出します。最初の1回だけでOK。
              </p>
              {code === null ? (
                <button type="button" onClick={() => void showCode()} style={{ ...secondaryButtonStyle, marginTop: 12, width: "100%" }}>
                  連携コードを出す
                </button>
              ) : (
                <>
                  <p style={{ margin: "12px 0 8px", fontSize: "0.78rem", color: WARN_COLOR, lineHeight: 1.6 }}>
                    このコードは自分のアカウントの鍵です。人に見せないでください。
                  </p>
                  <textarea readOnly value={code} rows={4} onFocus={(e) => e.currentTarget.select()} style={{ ...textareaStyle, fontSize: "0.7rem", wordBreak: "break-all" }} />
                  <button type="button" onClick={() => void copyCode()} style={{ ...secondaryButtonStyle, marginTop: 10, width: "100%" }}>
                    コピーする
                  </button>
                </>
              )}
              {codeMessage && <p style={{ margin: "10px 0 0", fontSize: "0.8rem", color: TEXT_MUTED }}>{codeMessage}</p>}
            </div>
            <div style={{ ...cardStyle, marginBottom: 0, marginTop: 10 }}>
              <p style={{ margin: 0, fontSize: "0.85rem", color: TEXT_SUB, lineHeight: 1.7 }}>
                SwitchBot の履歴（CSV）から、過去の部屋の温湿度を取り込みます。同じ時刻の分は重ならないので、何度入れても大丈夫。
              </p>
              <label style={{ ...secondaryButtonStyle, display: "block", textAlign: "center", boxSizing: "border-box", marginTop: 12, width: "100%", opacity: importing ? 0.6 : 1 }}>
                {importing ? "取り込み中…" : "CSV を選んで取り込む"}
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  disabled={importing}
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    e.currentTarget.value = "";
                    void importCsv(f);
                  }}
                />
              </label>
              {importMessage && <p style={{ margin: "10px 0 0", fontSize: "0.8rem", color: TEXT_MUTED }}>{importMessage}</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default BodySection;
