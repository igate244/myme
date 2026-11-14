// src/components/BodySection.tsx — からだ（スマートバンドの日々の記録）
//
// データは Firestore（users/{uid}/health）にあり、中継アプリ（android/）が毎日送ってくる。
// ここでは読んで見せるだけ。端末内の DB には入れない。
// その日の調子（5段階）は自分で付ける記録で、users/{uid}/bodyRatings に保存する（中継アプリの上書きに巻き込まれない）。
import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { BodyDay } from "../domain/body";
import { RATING_LABELS, formatClock, formatDayLabel, formatMinutes, workoutName } from "../domain/body";
import type { RatingMap } from "../infrastructure/bodyRemote";
import {
  cacheRating,
  fetchBodyDays,
  fetchRatings,
  loadCachedBodyDays,
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
const DayView: React.FC<{ day: BodyDay }> = ({ day }) => {
  const heart = day.hrAvg === null ? "—" : String(day.hrAvg);
  const heartSub = day.hrMin !== null && day.hrMax !== null ? `${day.hrMin}〜${day.hrMax} 回/分` : undefined;
  const spo2 = day.spo2Avg === null ? "—" : String(Math.round(day.spo2Avg));
  const spo2Sub = day.spo2Min !== null ? `最低 ${Math.round(day.spo2Min)}%` : undefined;
  const kcalSub =
    day.kcalTotal == null ? "中継アプリ1.3で許可すると入ります" : day.kcalActive != null ? `うち活動 ${day.kcalActive.toLocaleString("ja-JP")}` : undefined;
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: TWO_COLS, gap: 10 }}>
        <Tile label="歩数" value={stepsText(day)} unit="歩" />
        <Tile label="消費カロリー" value={day.kcalTotal == null ? "—" : day.kcalTotal.toLocaleString("ja-JP")} unit="kcal" sub={kcalSub} />
        <Tile
          wide
          label="睡眠"
          value={sleepText(day)}
          sub={day.sleepStartMs === null ? undefined : `${formatClock(day.sleepStartMs)} 〜 ${formatClock(day.sleepEndMs)}`}
        >
          <StageBar day={day} />
        </Tile>
        <Tile label="心拍（平均）" value={heart} unit="回/分" sub={heartSub} />
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

/** 直近7日の棒グラフ（平らな棒だけ。左が古い日。選んだ日は印をつける） */
const WeekBars: React.FC<{ days: BodyDay[]; ratings: RatingMap; selected: string }> = ({ days, ratings, selected }) => {
  const week = days.slice(0, 7).reverse();
  if (week.length < 2) return null;
  const maxSteps = Math.max(1, ...week.map((d) => d.steps ?? 0));
  const maxSleep = Math.max(480, ...week.map((d) => d.sleepMin ?? 0));
  const cols = `repeat(${week.length}, minmax(0, 1fr))`;
  const row = (title: string, value: (d: BodyDay) => number | null, max: number) => (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: "0.72rem", color: TEXT_MUTED, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 6, alignItems: "end", height: 56 }}>
        {week.map((d) => {
          const v = value(d);
          return (
            <div
              key={d.date}
              style={{ height: v === null ? 2 : Math.max(2, Math.round((v / max) * 56)), background: v === null ? LINE : ACCENT_BODY, opacity: d.date === selected || v === null ? 1 : 0.55, borderRadius: 2 }}
            />
          );
        })}
      </div>
    </div>
  );
  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600 }}>この7日</div>
      {row("歩数", (d) => d.steps, maxSteps)}
      {row("睡眠", (d) => d.sleepMin, maxSleep)}
      {row("調子", (d) => ratings[d.date] ?? null, 5)}
      <div style={{ display: "grid", gridTemplateColumns: cols, gap: 6, marginTop: 8 }}>
        {week.map((d) => {
          const [y, m, dd] = d.date.split("-").map(Number);
          return (
            <div key={d.date} style={{ textAlign: "center", fontSize: "0.68rem", color: d.date === selected ? TEXT_MAIN : TEXT_MUTED }}>
              {WEEK[new Date(y, m - 1, dd).getDay()]}
            </div>
          );
        })}
      </div>
    </div>
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
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(90);
  const [code, setCode] = useState<string | null>(null);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [loaded, loadedRatings] = await Promise.all([fetchBodyDays(user.uid, range), fetchRatings(user.uid).catch(() => null)]);
      setDays(loaded);
      if (loadedRatings) setRatings(loadedRatings);
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

              <DayView day={day} />
              <RatingCard rating={ratings[day.date] ?? null} onChange={changeRating} />
              <WeekBars days={days} ratings={ratings} selected={day.date} />

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
          </section>
        </div>
      </div>
    </div>
  );
};

export default BodySection;
