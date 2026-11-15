// src/components/body/MonthCalendar.tsx — 月のカレンダー：睡眠が足りたか・その日の調子（3段階）を一目で見る表
//
// 1マス＝1日。睡眠の時間を、7時間以上は緑・7時間未満は黄の色面で、調子は3本の棒（1〜3本）で出す。
// マスを押すと、その日の「すべて」に飛ぶ。
import React, { useMemo, useState } from "react";
import type { BodyDay } from "../../domain/body";
import { RATING_LABELS, SLEEP_TARGET_MIN, buildMonthGrid, formatMinutes, judgeSleep, summarizeMonth } from "../../domain/body";
import type { RatingMap } from "../../infrastructure/bodyRemote";
import { cardStyle, LINE, LINE_2, OK_COLOR, SECTION_COLORS, SURFACE_2, TEXT_MAIN, TEXT_MUTED, TEXT_SUB, WARN_COLOR } from "../uiStyles";

const WEEK = ["日", "月", "火", "水", "木", "金", "土"];
const ACCENT = SECTION_COLORS.body;
const pad2 = (n: number): string => String(n).padStart(2, "0");
const localDate = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 調子の3本棒。rating 本ぶん塗る。未記録は全部うすく */
const RatingBars: React.FC<{ rating: number | null }> = ({ rating }) => (
  <span aria-hidden style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2, height: 11 }}>
    {[1, 2, 3].map((n) => (
      <span key={n} style={{ width: 5, height: 3 + n * 2.5, borderRadius: 1, background: rating !== null && n <= rating ? ACCENT : "rgba(255,255,255,0.16)" }} />
    ))}
  </span>
);

type Props = {
  days: BodyDay[];
  ratings: RatingMap;
  /** 開いている日（枠で目印を付ける） */
  selected: string;
  loading: boolean;
  onOpenDay: (date: string) => void;
  /** まだ読み込んでいない昔の月を見たとき、その月の1日を知らせる（呼び出し側が読み込み範囲を広げる） */
  onNeedFrom: (date: string) => void;
};

const MonthCalendar: React.FC<Props> = ({ days, ratings, selected, loading, onOpenDay, onNeedFrom }) => {
  const today = localDate(new Date());
  const [ym, setYm] = useState<{ y: number; m: number }>(() => {
    const [y, m] = selected.split("-").map(Number);
    return { y, m };
  });
  const sleepByDate = useMemo(() => {
    const map: Record<string, number | null> = {};
    for (const d of days) map[d.date] = d.sleepMin;
    return map;
  }, [days]);
  const oldest = days.length > 0 ? days[days.length - 1].date : today;

  const weeks = useMemo(() => buildMonthGrid(ym.y, ym.m), [ym]);
  const summary = useMemo(
    () => summarizeMonth(weeks, (d) => sleepByDate[d] ?? null, (d) => ratings[d] ?? null, today),
    [weeks, sleepByDate, ratings, today],
  );

  const [ty, tm] = today.split("-").map(Number);
  const atLatest = ym.y === ty && ym.m === tm;
  const move = (delta: number): void => {
    const d = new Date(ym.y, ym.m - 1 + delta, 1);
    const next = { y: d.getFullYear(), m: d.getMonth() + 1 };
    setYm(next);
    const first = `${next.y}-${pad2(next.m)}-01`;
    if (first < oldest) onNeedFrom(first);
  };

  const chip = (label: string, value: string, color: string): React.ReactNode => (
    <div style={{ minWidth: 0, padding: "10px 8px", borderRadius: 8, background: SURFACE_2, border: `1px solid ${LINE}`, textAlign: "center" }}>
      <div style={{ fontSize: "0.64rem", color: TEXT_MUTED, whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ marginTop: 3, fontSize: "1.05rem", fontWeight: 600, color }}>{value}</div>
    </div>
  );

  return (
    <div style={{ ...cardStyle, marginBottom: 0, padding: "14px 12px 16px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr) 44px", alignItems: "center" }}>
        <button type="button" onClick={() => move(-1)} aria-label="前の月" style={navStyle(false)}>
          ‹
        </button>
        <div style={{ textAlign: "center", fontSize: "1rem", fontWeight: 600, color: TEXT_MAIN }}>
          {ym.y}年{ym.m}月
        </div>
        <button type="button" disabled={atLatest} onClick={() => move(1)} aria-label="次の月" style={navStyle(atLatest)}>
          ›
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 10 }}>
        {chip(`足りた（${formatMinutes(SLEEP_TARGET_MIN)}〜）`, `${summary.enough}日`, OK_COLOR)}
        {chip("足りない", `${summary.short}日`, WARN_COLOR)}
        {chip("平均睡眠", summary.avgSleepMin === null ? "—" : formatMinutes(summary.avgSleepMin), TEXT_MAIN)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 4, marginTop: 14 }}>
        {WEEK.map((w, i) => (
          <div key={w} style={{ textAlign: "center", fontSize: "0.64rem", color: i === 0 ? WARN_COLOR : TEXT_MUTED, paddingBottom: 2 }}>
            {w}
          </div>
        ))}
        {weeks.flat().map((c, i) => {
          if (!c.date) return <div key={`e${i}`} />;
          const future = c.date > today;
          const min = sleepByDate[c.date] ?? null;
          const judge = judgeSleep(min);
          const rating = ratings[c.date] ?? null;
          const isSel = c.date === selected;
          const isToday = c.date === today;
          const tint = judge === "enough" ? `${OK_COLOR}33` : judge === "short" ? `${WARN_COLOR}33` : "transparent";
          const timeColor = judge === "enough" ? OK_COLOR : judge === "short" ? WARN_COLOR : TEXT_MUTED;
          const aria = `${ym.m}月${c.day}日 睡眠${min === null ? "記録なし" : `${formatMinutes(min)}（${judge === "enough" ? "足りてる" : "足りない"}）`} 調子${rating === null ? "未記録" : RATING_LABELS[rating]}`;
          return (
            <button
              key={c.date}
              type="button"
              disabled={future}
              onClick={() => onOpenDay(c.date as string)}
              aria-label={aria}
              style={{
                all: "unset",
                boxSizing: "border-box",
                minWidth: 0,
                height: 62,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "5px 0 6px",
                borderRadius: 6,
                cursor: future ? "default" : "pointer",
                opacity: future ? 0.35 : 1,
                background: tint,
                border: `1px solid ${isSel ? ACCENT : judge === "none" ? LINE : "transparent"}`,
                outline: isSel ? `1px solid ${ACCENT}` : "none",
              }}
            >
              <span style={{ fontSize: "0.62rem", lineHeight: 1, color: isToday ? ACCENT : TEXT_SUB, fontWeight: isToday ? 700 : 400 }}>{c.day}</span>
              <span style={{ fontSize: "0.74rem", lineHeight: 1, fontWeight: 600, color: timeColor, whiteSpace: "nowrap" }}>{min === null ? "—" : formatMinutes(min)}</span>
              <RatingBars rating={rating} />
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: "6px 14px", fontSize: "0.68rem", color: TEXT_MUTED, alignItems: "center" }}>
        <span>
          <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: `${OK_COLOR}55`, marginRight: 4, verticalAlign: "-1px" }} />
          7時間以上
        </span>
        <span>
          <i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: `${WARN_COLOR}55`, marginRight: 4, verticalAlign: "-1px" }} />
          7時間未満
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          調子
          <RatingBars rating={1} />
          {RATING_LABELS[1]}
          <RatingBars rating={2} />
          {RATING_LABELS[2]}
          <RatingBars rating={3} />
          {RATING_LABELS[3]}
        </span>
      </div>

      <div style={{ marginTop: 10, fontSize: "0.72rem", color: TEXT_MUTED, lineHeight: 1.7 }}>
        調子の記録：{RATING_LABELS[3]} {summary.ratingCounts[3]}日 ／ {RATING_LABELS[2]} {summary.ratingCounts[2]}日 ／ {RATING_LABELS[1]} {summary.ratingCounts[1]}日
        {summary.none > 0 && <div>睡眠の記録なし {summary.none}日</div>}
        {loading && <div>読み込み中…</div>}
      </div>
    </div>
  );
};

const navStyle = (disabled: boolean): React.CSSProperties => ({
  all: "unset",
  boxSizing: "border-box",
  width: 44,
  height: 44,
  textAlign: "center",
  lineHeight: "44px",
  fontSize: "1.6rem",
  cursor: disabled ? "default" : "pointer",
  color: disabled ? LINE_2 : TEXT_SUB,
  fontFamily: "inherit",
});

export default MonthCalendar;
