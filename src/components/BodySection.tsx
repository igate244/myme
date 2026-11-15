// src/components/BodySection.tsx — からだ（スマートバンドの日々の記録）
//
// データは Firestore（users/{uid}/health）にあり、中継アプリ（android/）が毎日送ってくる。
// ここでは読んで見せるだけ。端末内の DB には入れない。
// その日の調子（3段階）は自分で付ける記録で、users/{uid}/bodyRatings に保存する（中継アプリの上書きに巻き込まれない）。
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { BodyDay, RoomSample, RoomSummary } from "../domain/body";
import { RATING_LABELS, normalizeBodyDayPlain, formatClock, formatDayLabel, formatMinutes, parseRoomSamples, parseSwitchBotCsv, summarizeRoom, workoutName } from "../domain/body";
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
import MonthCalendar from "./body/MonthCalendar";
import { STAGE_META, SleepTimeline } from "./body/SleepTimeline";
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

/** 縦軸の上端をきりのいい数にする（12,241 → 15,000） */
const niceTop = (v: number): number => {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  const f = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => n <= x + 1e-9) ?? 10;
  return f * mag;
};

const AXIS_W = "2.8rem";
/** 基準線：睡眠は7時間、歩数は6,000歩（グラフに色つきの線で出す） */
const SLEEP_TARGET = 420;
const STEPS_TARGET = 6000;

type Bar = { key: string; v: number | null; label?: string; on: boolean; aria: string; onClick: () => void };

/** 縦軸（目盛りの数字と薄い横線）つきの棒グラフ。floor〜top の間で棒の高さを決める */
const BarChart: React.FC<{ bars: Bar[]; floor: number; top: number; ticks: number[]; tickText: (v: number) => string; target?: number; plotH?: number; gap?: number; children?: React.ReactNode }> = ({
  bars,
  floor,
  top,
  ticks,
  tickText,
  target,
  plotH = 100,
  gap = 3,
  children,
}) => {
  const frac = (v: number): number => Math.min(1, Math.max(0, (v - floor) / (top - floor || 1)));
  const boxH = plotH + 18; // 数字を棒の上に出すための余白
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${AXIS_W} minmax(0, 1fr)`, gap: 6 }}>
      <div style={{ position: "relative", height: boxH }}>
        {ticks.map((t) => (
          <span key={t} style={{ position: "absolute", right: 0, bottom: frac(t) * plotH - 7, fontSize: "0.62rem", lineHeight: "14px", color: t === target ? ACCENT_BODY : TEXT_MUTED, whiteSpace: "nowrap" }}>
            {tickText(t)}
          </span>
        ))}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ position: "relative", height: boxH }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: "absolute", left: 0, right: 0, bottom: frac(t) * plotH, height: 1, background: t === target ? ACCENT_BODY : LINE, opacity: t === target ? 0.7 : 1 }} />
          ))}
          <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${Math.max(1, bars.length)}, minmax(0, 1fr))`, gap, alignItems: "end" }}>
            {bars.map((b) => (
              <button
                key={b.key}
                type="button"
                onClick={b.onClick}
                aria-label={b.aria}
                style={{ all: "unset", boxSizing: "border-box", height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", cursor: "pointer", minWidth: 0 }}
              >
                {b.label && <span style={{ fontSize: "0.6rem", textAlign: "center", color: b.on ? TEXT_MAIN : TEXT_SUB, marginBottom: 3, whiteSpace: "nowrap" }}>{b.label}</span>}
                <span style={{ display: "block", height: b.v === null ? 2 : Math.max(2, Math.round(frac(b.v) * plotH)), background: b.v === null ? LINE : ACCENT_BODY, opacity: b.on || b.v === null ? 1 : 0.55, borderRadius: 1 }} />
              </button>
            ))}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
};

/** 面ひとつ（小さな見出し＋大きい数字＋補足） */
const Tile: React.FC<{ label: string; value: string; unit?: string; sub?: string; children?: React.ReactNode; wide?: boolean; onOpen?: () => void }> = ({
  onOpen,
  label,
  value,
  unit,
  sub,
  children,
  wide,
}) => (
  <div
    {...(onOpen ? { role: "button", tabIndex: 0, onClick: onOpen, onKeyDown: (e: React.KeyboardEvent) => (e.key === "Enter" || e.key === " ") && onOpen() } : {})}
    style={{ ...cardStyle, marginBottom: 0, padding: "14px 16px 16px", gridColumn: wide ? "1 / -1" : undefined, minWidth: 0, cursor: onOpen ? "pointer" : undefined }}
  >
    <div style={{ fontSize: "0.74rem", color: TEXT_MUTED, display: "flex", justifyContent: "space-between", gap: 8 }}>
      <span>{label}</span>
      {onOpen && <span aria-hidden="true">›</span>}
    </div>
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
  const mins: Record<number, number | null> = { 0: day.awakeMin, 1: day.remMin, 2: day.lightMin, 3: day.deepMin };
  // 帯は「深い・浅い・レム・覚醒」の順（図の下から上）。色は一晩の流れの図と同じ
  const parts = [3, 2, 1, 0]
    .map((st) => ({ name: STAGE_META[st].name, min: mins[st], color: STAGE_META[st].color }))
    .filter((p) => p.min !== null && p.min > 0) as { name: string; min: number; color: string }[];
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

/** グループの小見出し（睡眠・活動） */
const GroupLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: "0.75rem", color: TEXT_MUTED, fontWeight: 600, margin: "8px 4px 0" }}>{children}</div>
);

/** その日の運動の一覧（無ければ何も出さない） */
const Workouts: React.FC<{ day: BodyDay }> = ({ day }) =>
  day.workouts.length === 0 ? null : (
    <div style={{ ...cardStyle, marginBottom: 0, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: "0.74rem", color: TEXT_MUTED }}>運動</div>
      {day.workouts.map((w) => (
        <div key={`${w.startMs}-${w.type}`} style={{ fontSize: "0.86rem", color: TEXT_SUB }}>
          {workoutName(w.type)}　{formatClock(w.startMs)}〜{formatClock(w.endMs)}
          {w.distanceM !== null && w.distanceM > 0 ? `　${(w.distanceM / 1000).toFixed(1)}km` : ""}
        </div>
      ))}
    </div>
  );

/** 選んだ日のまとめ：睡眠のかたまり → 活動のかたまり（調子は呼び出し側が先頭に置く） */
const DayView: React.FC<{ day: BodyDay; room?: RoomSummary; onOpen: (item: Item) => void }> = ({ day, room, onOpen }) => {
  const spo2 = day.spo2Avg === null ? "—" : String(Math.round(day.spo2Avg));
  const spo2Sub = day.spo2Min !== null ? `最低 ${Math.round(day.spo2Min)}%` : undefined;
  const kcalSub =
    day.kcalActive == null ? "中継アプリ1.3で許可すると入ります" : day.kcalTotal != null ? `総消費 ${day.kcalTotal.toLocaleString("ja-JP")} kcal` : undefined;
  return (
    <>
      <GroupLabel>睡眠</GroupLabel>
      <div style={{ display: "grid", gridTemplateColumns: TWO_COLS, gap: 10 }}>
        <Tile
          wide
          onOpen={() => onOpen("sleep")}
          label="睡眠"
          value={sleepText(day)}
          sub={day.sleepStartMs === null ? undefined : `${formatClock(day.sleepStartMs)} 〜 ${formatClock(day.sleepEndMs)}`}
        >
          <StageBar day={day} />
        </Tile>
        <Tile onOpen={() => onOpen("sleep")} label="睡眠中の部屋" value={room ? room.tempAvg.toFixed(1) : "—"} unit="℃" sub={room ? `湿度 ${Math.round(room.humAvg)}%` : "SwitchBot を中継アプリに入れると出ます"} />
        <Tile onOpen={() => onOpen("sleep")} label="血中酸素" value={spo2} unit="%" sub={spo2Sub} />
      </div>

      <GroupLabel>活動</GroupLabel>
      <div style={{ display: "grid", gridTemplateColumns: TWO_COLS, gap: 10 }}>
        <Tile label="歩数" value={stepsText(day)} unit="歩" onOpen={() => onOpen("activity")} />
        <Tile onOpen={() => onOpen("activity")} label="活動中の消費カロリー" value={day.kcalActive == null ? "—" : day.kcalActive.toLocaleString("ja-JP")} unit="kcal" sub={kcalSub} />
      </div>
      <Workouts day={day} />
    </>
  );
};

/** その日の調子（3段階）。もう一度押すと消える */
const RatingCard: React.FC<{ rating: number | null; onChange: (r: number | null) => void }> = ({ rating, onChange }) => (
  <div style={{ ...cardStyle, marginBottom: 0, padding: "14px 16px 16px" }}>
    <div style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600 }}>この日の調子</div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
      {[1, 2, 3].map((n) => {
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
              fontSize: "0.92rem",
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
              color: on ? "#111214" : TEXT_SUB,
              background: on ? ACCENT_BODY : SURFACE_2,
              border: `1px solid ${on ? ACCENT_BODY : LINE_2}`,
            }}
          >
            {RATING_LABELS[n]}
          </button>
        );
      })}
    </div>
  </div>
);

const pad2 = (n: number): string => String(n).padStart(2, "0");
const toDateStr = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
/** 「2026-11-16」に n 日足す（引くときは負の数） */
const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + n));
};

/** 7日分の棒グラフ（縦軸＋数字。左が古い日。押すとその日を開く）。‹ › で1週間ずつ前後する。初期は今日までの7日 */
const WeekBars: React.FC<{ days: BodyDay[]; ratings: RatingMap; selected: string; loading: boolean; onPick: (date: string) => void; onNeedFrom: (date: string) => void }> = ({ days, ratings, selected, loading, onPick, onNeedFrom }) => {
  const today = toDateStr(new Date());
  const [end, setEnd] = useState<string>(today);
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(end, i - 6));
  // 記録が無い日も空の棒として並べる（日付がずれないように）
  const week: BodyDay[] = dates.map((date) => byDate.get(date) ?? normalizeBodyDayPlain(date, undefined));
  const oldest = days.length > 0 ? days[days.length - 1].date : today;
  const move = (delta: number): void => {
    const next = addDays(end, delta * 7);
    if (next > today) return;
    setEnd(next);
    const start = addDays(next, -6);
    if (start < oldest) onNeedFrom(start);
  };
  const atLatest = end >= today;
  const label = (date: string): string => `${Number(date.split("-")[1])}/${Number(date.split("-")[2])}`;
  const stepsTop = niceTop(Math.max(STEPS_TARGET * 1.5, ...week.map((d) => d.steps ?? 0)));
  const sleepTop = Math.max(540, Math.ceil(Math.max(0, ...week.map((d) => d.sleepMin ?? 0)) / 60) * 60);
  const chart = (title: string, value: (d: BodyDay) => number | null, top: number, ticks: number[], tickText: (v: number) => string, text: (v: number) => string, target?: number) => (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: "0.72rem", color: TEXT_MUTED, marginBottom: 6 }}>{title}</div>
      <BarChart
        plotH={64}
        floor={0}
        top={top}
        ticks={ticks}
        tickText={tickText}
        target={target}
        bars={week.map((d) => {
          const v = value(d);
          return { key: d.date, v, label: v === null ? undefined : text(v) || undefined, on: d.date === selected, aria: `${formatDayLabel(d.date)}を開く`, onClick: () => onPick(d.date) };
        })}
      />
    </div>
  );
  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) 44px", alignItems: "center" }}>
        <NavButton label="‹" disabled={false} onClick={() => move(-1)} aria="前の週" />
        <div style={{ textAlign: "center", fontSize: "1rem", fontWeight: 600, color: TEXT_MAIN }}>
          {label(dates[0])} 〜 {label(dates[6])}
          {atLatest && <span style={{ fontSize: "0.72rem", fontWeight: 400, color: TEXT_MUTED }}>　直近</span>}
        </div>
        <NavButton label="›" disabled={atLatest} onClick={() => move(1)} aria="次の週" />
      </div>
      {loading && <div style={{ textAlign: "center", fontSize: "0.72rem", color: TEXT_MUTED }}>読み込み中…</div>}
      {chart("歩数", (d) => d.steps, stepsTop, [0, STEPS_TARGET, stepsTop], (v) => v.toLocaleString("ja-JP"), (v) => v.toLocaleString("ja-JP"), STEPS_TARGET)}
      {chart("睡眠", (d) => d.sleepMin, sleepTop, [0, SLEEP_TARGET, sleepTop], formatMinutes, formatMinutes, SLEEP_TARGET)}
      {chart("調子", (d) => ratings[d.date] ?? null, 3, [1, 2, 3], (v) => RATING_LABELS[v] ?? "", () => "")}
      <div style={{ display: "grid", gridTemplateColumns: `${AXIS_W} minmax(0, 1fr)`, gap: 6, marginTop: 8 }}>
        <span />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))`, gap: 3 }}>
          {week.map((d) => {
            const [y, m, dd] = d.date.split("-").map(Number);
            const on = d.date === selected;
            return (
              <button
                key={d.date}
                type="button"
                onClick={() => onPick(d.date)}
                style={{ all: "unset", boxSizing: "border-box", textAlign: "center", padding: "6px 0", fontSize: "0.66rem", lineHeight: 1.4, cursor: "pointer", color: on ? ACCENT_BODY : TEXT_MUTED, fontWeight: on ? 700 : 400, fontFamily: "inherit" }}
              >
                {m}/{dd}
                <br />
                {WEEK[new Date(y, m - 1, dd).getDay()]}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------ 項目ごとの詳しい画面 */

/** 項目の値を出すときに使う、日ごとの付け足しデータ */
type Ctx = { ratings: RatingMap; room: Record<string, RoomSummary>; samples: RoomSample[] };

type MetricKey = "steps" | "sleep" | "deepPct" | "sleepHr" | "spo2" | "kcal" | "roomTemp" | "roomHum" | "rating";
/** 上のタブ。睡眠に関わる項目（睡眠時間・深い睡眠・心拍・血中酸素・室温・湿度）は「睡眠」の1ページにまとめてある */
type Period = "day" | "week" | "month";
/** 「日」の中で見る項目。睡眠（睡眠・部屋・血中酸素…）と活動（歩数・カロリー・運動）はそれぞれ1ページにまとめてある */
type Item = "all" | "sleep" | "activity" | "rating";

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
  /** 縦軸の上端（省略すると、きりのいい数に切り上げる） */
  top?: (max: number) => number;
  /** 縦軸の目盛り（省略すると、下・真ん中・上） */
  ticks?: number[];
  /** 基準線（あれば縦軸の目盛りに入れ、色つきの線で引く） */
  target?: number;
  /** 縦軸の数字の出し方（省略すると text と同じ） */
  axis?: (v: number) => string;
};

const METRICS: Metric[] = [
  {
    key: "steps",
    label: "歩数",
    unit: "歩",
    value: (d) => d.steps,
    text: (v) => Math.round(v).toLocaleString("ja-JP"),
    sub: (d) => (d.kcalActive == null ? "" : `活動 ${d.kcalActive.toLocaleString("ja-JP")} kcal`),
    scaleMax: STEPS_TARGET * 1.5,
    floor: 0,
    target: STEPS_TARGET,
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
    top: (max) => Math.max(540, Math.ceil(max / 60) * 60), // 基準線の7:00と近すぎないよう、最低9:00
    target: SLEEP_TARGET,
  },
  {
    key: "deepPct",
    label: "深い睡眠の割合",
    unit: "%",
    value: (d) => (d.deepMin !== null && d.sleepMin !== null && d.sleepMin > 0 ? (d.deepMin / d.sleepMin) * 100 : null),
    text: (v) => String(Math.round(v)),
    sub: (d) => (d.deepMin !== null ? `深い ${formatMinutes(d.deepMin)}` : ""),
    scaleMax: 40,
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
    floor: 80, // 90% 台の差が見えるよう、80% からの高さにする
    axis: (v) => String(Math.round(v)),
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
    axis: (v) => String(Math.round(v)),
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
    text: (v) => (Number.isInteger(v) ? RATING_LABELS[v] : (Math.round(v * 10) / 10).toFixed(1)),
    sub: () => "",
    scaleMax: 3,
    floor: 0,
    top: () => 3,
    ticks: [1, 2, 3],
    axis: (v) => RATING_LABELS[v] ?? "",
  },
];

/** 1段目：見る時間の幅 */
const VIEW_PERIODS: { key: Period; label: string }[] = [
  { key: "day", label: "日" },
  { key: "week", label: "週" },
  { key: "month", label: "月" },
];
/** 2段目（「日」のときだけ）：見る項目 */
const ITEM_TABS: { key: Item; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "sleep", label: "睡眠" },
  { key: "activity", label: "活動" },
  { key: "rating", label: "調子" },
];

/** 活動ページの中で切り替える項目 */
const ACTIVITY_ITEMS: { key: MetricKey; label: string }[] = [
  { key: "steps", label: "歩数" },
  { key: "kcal", label: "カロリー" },
];

const metricOf = (key: MetricKey): Metric => METRICS.find((m) => m.key === key) as Metric;

/** 睡眠ページの中で切り替える項目と、ボタンの名前 */
const SLEEP_ITEMS: { key: MetricKey; label: string }[] = [
  { key: "sleep", label: "睡眠時間" },
  { key: "deepPct", label: "深い睡眠" },
  { key: "sleepHr", label: "心拍" },
  { key: "roomTemp", label: "室温" },
  { key: "roomHum", label: "湿度" },
  { key: "spo2", label: "血中酸素" },
];

/** 切り替えのボタン列。equal=true は横幅いっぱいを等分（1段目）、false は小さめの丸ボタン（2段目） */
function TabBar<K extends string>({ tabs, value, onChange, equal }: { tabs: { key: K; label: string }[]; value: K; onChange: (k: K) => void; equal?: boolean }): React.ReactElement {
  return (
    <div style={equal ? { display: "grid", gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, gap: 6, padding: 4, borderRadius: 10, background: SURFACE_2, border: `1px solid ${LINE}` } : { display: "flex", gap: 8, overflowX: "auto", padding: "2px 0 4px", scrollbarWidth: "none" }}>
      {tabs.map((t) => {
        const on = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-pressed={on}
            style={
              equal
                ? { all: "unset", boxSizing: "border-box", textAlign: "center", padding: "9px 0", borderRadius: 7, fontSize: "0.9rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: on ? "#111214" : TEXT_SUB, background: on ? ACCENT_BODY : "transparent" }
                : { all: "unset", boxSizing: "border-box", flexShrink: 0, padding: "8px 14px", borderRadius: 999, fontSize: "0.85rem", cursor: "pointer", fontFamily: "inherit", color: on ? "#111214" : TEXT_SUB, background: on ? ACCENT_BODY : SURFACE_2, border: `1px solid ${on ? ACCENT_BODY : LINE_2}` }
            }
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

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
    </div>
  );
};

/** 1つの項目を詳しく見る：選んだ日・期間の推移・平均/最高/最低・日ごとの一覧 */
const MetricDetail: React.FC<{ metric: Metric; days: BodyDay[]; ctx: Ctx; day: BodyDay; onPick: (date: string) => void; hideTile?: boolean }> = ({
  hideTile,
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
  const scaleTop = metric.top ? metric.top(max ?? 0) : niceTop(Math.max(metric.scaleMax, max ?? 0));
  const ticks = metric.ticks ?? (metric.target !== undefined ? [metric.floor, metric.target, scaleTop] : [metric.floor, (metric.floor + scaleTop) / 2, scaleTop]);
  const axisText = (v: number): string => (metric.axis ? metric.axis(v) : metric.text(v));
  const bars = [...withV].reverse(); // 左が古い日
  const showNumbers = bars.length <= 7 && metric.key !== "rating";
  const stat = (label: string, v: number | null) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: "0.7rem", color: TEXT_MUTED }}>{label}</div>
      <div style={{ fontSize: "0.95rem", marginTop: 2, color: TEXT_MAIN, wordBreak: "break-word" }}>{v === null ? "—" : metric.text(v)}</div>
    </div>
  );
  return (
    <>
      {!hideTile && (
        <Tile label={`${formatDayLabel(day.date)}の${metric.label}`} value={todayV === null ? "—" : metric.text(todayV)} unit={metric.unit} sub={metric.sub(day, ctx) || undefined} />
      )}

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

        <div style={{ marginTop: 14 }}>
          <BarChart
            floor={metric.floor}
            top={scaleTop}
            ticks={ticks}
            tickText={axisText}
            target={metric.target}
            gap={bars.length > 30 ? 1 : 3}
            bars={bars.map(({ d, v }) => ({
              key: d.date,
              v,
              label: showNumbers && v !== null ? metric.text(v) : undefined,
              on: d.date === day.date,
              aria: `${formatDayLabel(d.date)}を開く`,
              onClick: () => onPick(d.date),
            }))}
          >
            {bars.length > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: "0.68rem", color: TEXT_MUTED }}>
                <span>{formatDayLabel(bars[0].d.date)}</span>
                <span>{formatDayLabel(bars[bars.length - 1].d.date)}</span>
              </div>
            )}
          </BarChart>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
          {stat("平均", avg)}
          {stat("最高", max)}
          {stat("最低", min)}
        </div>
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

const NavButton: React.FC<{ label: string; disabled: boolean; onClick: () => void; aria?: string }> = ({ label, disabled, onClick, aria }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={aria ?? (label === "‹" ? "前の日" : "次の日")}
    style={{ all: "unset", boxSizing: "border-box", width: 44, height: 44, textAlign: "center", lineHeight: "44px", fontSize: "1.6rem", cursor: disabled ? "default" : "pointer", color: disabled ? LINE_2 : TEXT_SUB, fontFamily: "inherit" }}
  >
    {label}
  </button>
);

/** 睡眠に関わるものを1ページに集めた画面：その晩のまとめ → 室温と睡眠の関係 → 項目を選んで推移を見る */
const SleepPage: React.FC<{ days: BodyDay[]; ctx: Ctx; day: BodyDay; onPick: (date: string) => void }> = ({ days, ctx, day, onPick }) => {
  const [item, setItem] = useState<MetricKey>("sleep");
  const room = ctx.room[day.date];
  const deepPct = metricOf("deepPct").value(day, ctx);
  return (
    <>
      <Tile
        wide
        label={`${formatDayLabel(day.date)}の睡眠`}
        value={sleepText(day)}
        sub={day.sleepStartMs === null ? undefined : `${formatClock(day.sleepStartMs)} 〜 ${formatClock(day.sleepEndMs)}${deepPct === null ? "" : `　深い睡眠 ${Math.round(deepPct)}%`}`}
      >
        <StageBar day={day} />
      </Tile>
      <SleepTimeline day={day} samples={ctx.samples} />
      <div style={{ ...cardStyle, marginBottom: 0, padding: "14px 16px", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
        {[
          { label: "心拍", value: day.hrSleepAvg == null ? "—" : String(day.hrSleepAvg), unit: "" },
          { label: "血中酸素", value: day.spo2Avg === null ? "—" : String(Math.round(day.spo2Avg)), unit: "%" },
          { label: "室温", value: room ? room.tempAvg.toFixed(1) : "—", unit: "℃" },
          { label: "湿度", value: room ? String(Math.round(room.humAvg)) : "—", unit: "%" },
        ].map((x) => (
          <div key={x.label} style={{ minWidth: 0 }}>
            <div style={{ fontSize: "0.68rem", color: TEXT_MUTED, whiteSpace: "nowrap" }}>{x.label}</div>
            <div style={{ marginTop: 4, fontSize: "1.05rem", fontWeight: 600, color: TEXT_MAIN, whiteSpace: "nowrap" }}>
              {x.value}
              {x.value !== "—" && x.unit && <span style={{ fontSize: "0.68rem", fontWeight: 400, color: TEXT_MUTED }}>{x.unit}</span>}
            </div>
          </div>
        ))}
      </div>

      <RoomLink days={days} ctx={ctx} />

      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 0 4px", scrollbarWidth: "none" }}>
        {SLEEP_ITEMS.map((it) => {
          const on = it.key === item;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => setItem(it.key)}
              aria-pressed={on}
              style={{ all: "unset", boxSizing: "border-box", flexShrink: 0, padding: "7px 13px", borderRadius: 999, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit", color: on ? TEXT_MAIN : TEXT_MUTED, background: on ? SURFACE_2 : "transparent", border: `1px solid ${on ? LINE_2 : LINE}` }}
            >
              {it.label}
            </button>
          );
        })}
      </div>
      <MetricDetail key={item} hideTile metric={metricOf(item)} days={days} ctx={ctx} day={day} onPick={onPick} />
    </>
  );
};

/** 活動に関わるものを1ページに集めた画面：歩数・カロリーを切り替えて推移を見る → その日の運動 */
const ActivityPage: React.FC<{ days: BodyDay[]; ctx: Ctx; day: BodyDay; onPick: (date: string) => void }> = ({ days, ctx, day, onPick }) => {
  const [item, setItem] = useState<MetricKey>("steps");
  return (
    <>
      <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "2px 0 4px", scrollbarWidth: "none" }}>
        {ACTIVITY_ITEMS.map((it) => {
          const on = it.key === item;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => setItem(it.key)}
              aria-pressed={on}
              style={{ all: "unset", boxSizing: "border-box", flexShrink: 0, padding: "7px 13px", borderRadius: 999, fontSize: "0.8rem", cursor: "pointer", fontFamily: "inherit", color: on ? TEXT_MAIN : TEXT_MUTED, background: on ? SURFACE_2 : "transparent", border: `1px solid ${on ? LINE_2 : LINE}` }}
            >
              {it.label}
            </button>
          );
        })}
      </div>
      <MetricDetail key={item} metric={metricOf(item)} days={days} ctx={ctx} day={day} onPick={onPick} />
      <Workouts day={day} />
    </>
  );
};

const BodySection: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const [days, setDays] = useState<BodyDay[]>(() => loadCachedBodyDays());
  const [ratings, setRatings] = useState<RatingMap>(() => loadCachedRatings());
  const [roomDocs, setRoomDocs] = useState<RoomDocs>(() => loadCachedRoomDocs());
  const [selected, setSelected] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("day");
  const [item, setItem] = useState<Item>("all");
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
  const samples = useMemo(() => Object.values(roomDocs).flatMap((raw) => parseRoomSamples(raw)).sort((a, b) => a.ms - b.ms), [roomDocs]);
  const room = useMemo(() => {
    const out: Record<string, RoomSummary> = {};
    for (const d of days) {
      if (d.sleepStartMs === null || d.sleepEndMs === null) continue;
      const r = summarizeRoom(samples, d.sleepStartMs, d.sleepEndMs);
      if (r) out[d.date] = r;
    }
    return out;
  }, [samples, days]);
  const ctx: Ctx = useMemo(() => ({ ratings, room, samples }), [ratings, room, samples]);

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

  const openItem = (i: Item): void => {
    setItem(i);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** 週・月から、その日の「日」画面（すべて）へ */
  const openDay = (date: string): void => {
    setSelected(date);
    setPeriod("day");
    setItem("all");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** 月カレンダーで昔の月を開いたとき、その月の1日まで読み込み範囲を広げる */
  const needFrom = (date: string): void => {
    const [y, m, d] = date.split("-").map(Number);
    const diff = Math.ceil((Date.now() - new Date(y, m - 1, d).getTime()) / 86400000) + 1;
    setRange((r) => Math.max(r, diff));
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
              <TabBar equal tabs={VIEW_PERIODS} value={period} onChange={setPeriod} />

              {period === "month" ? (
                <MonthCalendar days={days} ratings={ratings} selected={day.date} loading={loading} onOpenDay={openDay} onNeedFrom={needFrom} />
              ) : period === "week" ? (
                <WeekBars days={days} ratings={ratings} selected={day.date} loading={loading} onPick={openDay} onNeedFrom={needFrom} />
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) 44px", alignItems: "center" }}>
                    <NavButton label="‹" disabled={index >= days.length - 1} onClick={() => setSelected(days[index + 1].date)} />
                    <div style={{ textAlign: "center", fontSize: "1.25rem", fontWeight: 600 }}>{formatDayLabel(day.date)}</div>
                    <NavButton label="›" disabled={index <= 0} onClick={() => setSelected(days[index - 1].date)} />
                  </div>

                  <TabBar tabs={ITEM_TABS} value={item} onChange={setItem} />

                  {item === "all" ? (
                    <>
                      <RatingCard rating={ratings[day.date] ?? null} onChange={changeRating} />
                      <DayView day={day} room={room[day.date]} onOpen={openItem} />
                    </>
                  ) : item === "sleep" ? (
                    <SleepPage days={days} ctx={ctx} day={day} onPick={pick} />
                  ) : item === "activity" ? (
                    <ActivityPage days={days} ctx={ctx} day={day} onPick={pick} />
                  ) : (
                    <>
                      <RatingCard rating={ratings[day.date] ?? null} onChange={changeRating} />
                      <MetricDetail metric={metricOf("rating")} days={days} ctx={ctx} day={day} onPick={pick} />
                    </>
                  )}
                </>
              )}

              <button type="button" disabled={loading} onClick={() => setRange((r) => r + 180)} style={{ ...secondaryButtonStyle, width: "100%" }}>
                {loading ? "読み込み中…" : "さらに前を見る"}
              </button>
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
