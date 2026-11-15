// src/components/body/SleepTimeline.tsx — 一晩の「時間ごとの図」
//
// 上：眠りの段階（覚醒・レム・浅い・深い）を、段階ごとに色を変えた4本の横の帯で見せる。
// 下：同じ時間の軸にそろえて、心拍・血中酸素・室温・湿度の推移を並べる。
// 線は、グラフが横に伸び縮みしても太さが変わらないようにしてある（vectorEffect）。
import React from "react";
import type { BodyDay, RoomSample, SeriesPoint } from "../../domain/body";
import { formatClock } from "../../domain/body";
import { ACCENT, ACCENT_STRONG, DANGER_COLOR, LINE, LINE_2, OK_COLOR, TEXT_MUTED, TEXT_SUB, WARN_COLOR, SECTION_COLORS, cardStyle } from "../uiStyles";

/** 段階ごとの名前と色。上から順に並べる（覚醒が上、深いが下） */
export const STAGE_META: { stage: 0 | 1 | 2 | 3; name: string; color: string }[] = [
  { stage: 0, name: "覚醒", color: WARN_COLOR },
  { stage: 1, name: "レム", color: OK_COLOR },
  { stage: 2, name: "浅い", color: ACCENT },
  { stage: 3, name: "深い", color: ACCENT_STRONG },
];

const LABEL_W = "3.6rem";
const LANE_H = 24;
const W = 1000; // 横の座標は 0〜1000 に正規化して描く

/** 時間の軸の目盛り（ちょうどの時刻）。夜が長いときは2時間おき */
const hourTicks = (t0: number, t1: number): number[] => {
  const stepH = t1 - t0 > 6.5 * 3600000 ? 2 : 1;
  const d = new Date(t0);
  d.setMinutes(0, 0, 0);
  const out: number[] = [];
  let t = d.getTime() + 3600000;
  while (t < t1) {
    if (new Date(t).getHours() % stepH === 0) out.push(t);
    t += 3600000;
  }
  return out;
};

type Row = { key: string; label: string; unit: string; color: string; points: SeriesPoint[]; fmt: (v: number) => string };

/** 1本の推移（折れ線）。上下は、その晩の最小〜最大に合わせる */
const TrendRow: React.FC<{ row: Row; t0: number; t1: number; ticks: number[] }> = ({ row, t0, t1, ticks }) => {
  const pts = row.points;
  const lo = Math.min(...pts.map((p) => p.value));
  const hi = Math.max(...pts.map((p) => p.value));
  const span = hi - lo || 1;
  const H = 44;
  const x = (ms: number): number => ((ms - t0) / (t1 - t0)) * W;
  const y = (v: number): number => 6 + (1 - (v - lo) / span) * (H - 12);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W} minmax(0, 1fr)`, gap: 8, alignItems: "center", marginTop: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.72rem", color: row.color }}>{row.label}</div>
        <div style={{ fontSize: "0.66rem", color: TEXT_MUTED, lineHeight: 1.4 }}>
          {row.fmt(lo)}〜{row.fmt(hi)}
          {row.unit}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block" }} role="img" aria-label={`${row.label}の推移`}>
        {ticks.map((t) => (
          <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={H} stroke={LINE} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        ))}
        <polyline
          fill="none"
          stroke={row.color}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          points={pts.map((p) => `${x(p.ms).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ")}
        />
      </svg>
    </div>
  );
};

/** 寝ていた時間（寝た〜起きた）の中の点だけにそろえる */
const within = (pts: SeriesPoint[], t0: number, t1: number): SeriesPoint[] => pts.filter((p) => p.ms >= t0 && p.ms <= t1);

export const SleepTimeline: React.FC<{ day: BodyDay; samples: RoomSample[] }> = ({ day, samples }) => {
  const t0 = day.sleepStartMs;
  const t1 = day.sleepEndMs;
  if (t0 === null || t1 === null || t1 <= t0) return null;

  const segs = day.sleepStages.filter((s) => s.endMs > t0 && s.startMs < t1);
  const ticks = hourTicks(t0, t1);
  const x = (ms: number): number => ((Math.min(Math.max(ms, t0), t1) - t0) / (t1 - t0)) * W;
  const inRoom = samples.filter((s) => s.ms >= t0 && s.ms <= t1);

  const rows: Row[] = [
    { key: "hr", label: "心拍", unit: "", color: DANGER_COLOR, points: within(day.hrSeries, t0, t1), fmt: (v) => String(Math.round(v)) },
    { key: "spo2", label: "血中酸素", unit: "%", color: SECTION_COLORS.strategy, points: within(day.spo2Series, t0, t1), fmt: (v) => String(Math.round(v)) },
    { key: "temp", label: "室温", unit: "℃", color: SECTION_COLORS.body, points: inRoom.map((s) => ({ ms: s.ms, value: s.temp })), fmt: (v) => v.toFixed(1) },
    { key: "hum", label: "湿度", unit: "%", color: ACCENT, points: inRoom.map((s) => ({ ms: s.ms, value: s.hum })), fmt: (v) => String(Math.round(v)) },
  ].filter((r) => r.points.length >= 2);

  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600 }}>一晩の流れ</span>
        <span style={{ fontSize: "0.7rem", color: TEXT_MUTED }}>
          {formatClock(t0)} 〜 {formatClock(t1)}
        </span>
      </div>

      {segs.length === 0 ? (
        <p style={{ margin: "10px 0 0", fontSize: "0.78rem", color: TEXT_MUTED, lineHeight: 1.7 }}>眠りの段階の時間ごとの記録は、中継アプリ1.5で同期すると入ります。</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W} minmax(0, 1fr)`, gap: 8, marginTop: 12 }}>
          <div>
            {STAGE_META.map((m) => (
              <div key={m.stage} style={{ height: LANE_H, lineHeight: `${LANE_H}px`, fontSize: "0.72rem", color: m.color }}>
                {m.name}
              </div>
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${LANE_H * 4}`} preserveAspectRatio="none" width="100%" height={LANE_H * 4} style={{ display: "block" }} role="img" aria-label="眠りの段階">
            {STAGE_META.map((m, lane) => (
              <rect key={m.stage} x={0} y={lane * LANE_H} width={W} height={LANE_H} fill={lane % 2 === 0 ? LINE : "transparent"} opacity={0.35} />
            ))}
            {ticks.map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1={0} y2={LANE_H * 4} stroke={LINE_2} strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {segs.map((s) => {
              const lane = STAGE_META.findIndex((m) => m.stage === s.stage);
              const left = x(s.startMs);
              return <rect key={`${s.startMs}-${s.stage}`} x={left} y={lane * LANE_H + 4} width={Math.max(2, x(s.endMs) - left)} height={LANE_H - 8} rx={2} fill={STAGE_META[lane].color} />;
            })}
          </svg>
        </div>
      )}

      {rows.map((r) => (
        <TrendRow key={r.key} row={r} t0={t0} t1={t1} ticks={ticks} />
      ))}

      {/* 時間の軸（段階の図・各推移と同じ幅にそろえる） */}
      <div style={{ display: "grid", gridTemplateColumns: `${LABEL_W} minmax(0, 1fr)`, gap: 8, marginTop: 6 }}>
        <span />
        <div style={{ position: "relative", height: 16 }}>
          {ticks.map((t) => (
            <span
              key={t}
              style={{ position: "absolute", left: `${((t - t0) / (t1 - t0)) * 100}%`, transform: "translateX(-50%)", fontSize: "0.66rem", color: TEXT_MUTED, whiteSpace: "nowrap" }}
            >
              {new Date(t).getHours()}時
            </span>
          ))}
        </div>
      </div>
      {rows.length === 0 && segs.length > 0 && (
        <p style={{ margin: "8px 0 0", fontSize: "0.7rem", color: TEXT_MUTED }}>心拍・血中酸素・室温・湿度の時間ごとの記録は、まだありません。</p>
      )}
    </div>
  );
};
