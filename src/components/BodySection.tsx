// src/components/BodySection.tsx — からだ（スマートバンドの日々の記録）
//
// データは Firestore（users/{uid}/health）にあり、中継アプリ（android/）が毎日送ってくる。
// ここでは読んで見せるだけ。端末内の DB には入れない。
import React, { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import type { BodyDay } from "../domain/body";
import { formatClock, formatDayLabel, formatMinutes, workoutName } from "../domain/body";
import { fetchBodyDays, loadCachedBodyDays, makePairingCode } from "../infrastructure/bodyRemote";
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
  LINE,
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_SUB,
  WARN_COLOR,
  SECTION_COLORS,
} from "./uiStyles";

type Props = { onBack: () => void };

const ACCENT_BODY = SECTION_COLORS.body;
const WEEK = ["日", "月", "火", "水", "木", "金", "土"];

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: "0.72rem", color: TEXT_MUTED }}>{label}</div>
    <div style={{ fontSize: "0.95rem", color: TEXT_MAIN, marginTop: 2, wordBreak: "break-word" }}>{value}</div>
  </div>
);

const heartText = (d: BodyDay): string =>
  d.hrMin === null || d.hrMax === null ? "—" : `${d.hrMin}〜${d.hrMax}${d.hrAvg !== null ? `（平均${d.hrAvg}）` : ""}`;

const stepsText = (d: BodyDay): string => (d.steps === null ? "—" : d.steps.toLocaleString("ja-JP"));
const sleepText = (d: BodyDay): string => (d.sleepMin === null ? "—" : formatMinutes(d.sleepMin));

/** 詳しい中身（睡眠の内訳・心拍・血中酸素・運動） */
const DayDetail: React.FC<{ day: BodyDay }> = ({ day }) => {
  const stages = [
    day.deepMin !== null && `深い ${formatMinutes(day.deepMin)}`,
    day.lightMin !== null && `浅い ${formatMinutes(day.lightMin)}`,
    day.remMin !== null && `レム ${formatMinutes(day.remMin)}`,
    day.awakeMin !== null && day.awakeMin > 0 && `覚醒 ${formatMinutes(day.awakeMin)}`,
  ].filter(Boolean);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 14 }}>
        <Stat label="寝ていた時間" value={day.sleepStartMs === null ? "—" : `${formatClock(day.sleepStartMs)}〜${formatClock(day.sleepEndMs)}`} />
        <Stat label="血中酸素" value={day.spo2Avg === null ? "—" : `${Math.round(day.spo2Avg)}%${day.spo2Min !== null ? `（最低${Math.round(day.spo2Min)}%）` : ""}`} />
        <Stat label="心拍（回/分）" value={heartText(day)} />
      </div>
      {stages.length > 0 && <div style={{ fontSize: "0.78rem", color: TEXT_SUB, marginTop: 12, lineHeight: 1.7 }}>{stages.join("　")}</div>}
      {day.workouts.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${LINE}`, display: "flex", flexDirection: "column", gap: 4 }}>
          {day.workouts.map((w) => (
            <div key={`${w.startMs}-${w.type}`} style={{ fontSize: "0.82rem", color: TEXT_SUB }}>
              {workoutName(w.type)}　{formatClock(w.startMs)}〜{formatClock(w.endMs)}
              {w.distanceM !== null && w.distanceM > 0 ? `　${(w.distanceM / 1000).toFixed(1)}km` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/** いちばん新しい日を大きく見せる */
const LatestCard: React.FC<{ day: BodyDay }> = ({ day }) => (
  <div style={{ ...cardStyle, marginBottom: 0, padding: "18px 18px 20px" }}>
    <div style={{ fontSize: "0.8rem", color: TEXT_MUTED }}>{formatDayLabel(day.date)}</div>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, margin: "14px 0 18px" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.72rem", color: TEXT_MUTED }}>歩数</div>
        <div style={{ fontSize: "2rem", fontWeight: 600, lineHeight: 1.15, color: TEXT_MAIN }}>{stepsText(day)}</div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "0.72rem", color: TEXT_MUTED }}>睡眠</div>
        <div style={{ fontSize: "2rem", fontWeight: 600, lineHeight: 1.15, color: TEXT_MAIN }}>{sleepText(day)}</div>
      </div>
    </div>
    <div style={{ paddingTop: 14, borderTop: `1px solid ${LINE}` }}>
      <DayDetail day={day} />
    </div>
  </div>
);

/** 直近7日の棒グラフ（平らな棒だけ。左が古い日） */
const WeekBars: React.FC<{ days: BodyDay[] }> = ({ days }) => {
  const week = days.slice(0, 7).reverse();
  if (week.length < 2) return null;
  const maxSteps = Math.max(1, ...week.map((d) => d.steps ?? 0));
  const maxSleep = Math.max(480, ...week.map((d) => d.sleepMin ?? 0));
  const row = (title: string, value: (d: BodyDay) => number | null, max: number, label: (d: BodyDay) => string) => (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: "0.72rem", color: TEXT_MUTED, marginBottom: 6 }}>{title}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))`, gap: 6, alignItems: "end", height: 64 }}>
        {week.map((d) => {
          const v = value(d);
          return (
            <div key={d.date} title={label(d)} style={{ height: v === null ? 2 : Math.max(2, Math.round((v / max) * 64)), background: v === null ? LINE : ACCENT_BODY, opacity: v === null ? 1 : 0.85, borderRadius: 2 }} />
          );
        })}
      </div>
    </div>
  );
  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600 }}>この7日</div>
      {row("歩数", (d) => d.steps, maxSteps, stepsText)}
      {row("睡眠", (d) => d.sleepMin, maxSleep, sleepText)}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${week.length}, minmax(0, 1fr))`, gap: 6, marginTop: 8 }}>
        {week.map((d) => {
          const [y, m, dd] = d.date.split("-").map(Number);
          return (
            <div key={d.date} style={{ textAlign: "center", fontSize: "0.68rem", color: TEXT_MUTED }}>
              {WEEK[new Date(y, m - 1, dd).getDay()]}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** 過去の1日分（タップで詳しく） */
const HistoryRow: React.FC<{ day: BodyDay; open: boolean; onToggle: () => void }> = ({ day, open, onToggle }) => (
  <div style={{ borderTop: `1px solid ${LINE}` }}>
    <button
      type="button"
      onClick={onToggle}
      style={{ all: "unset", boxSizing: "border-box", width: "100%", display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr)", gap: 8, alignItems: "baseline", padding: "12px 2px", cursor: "pointer", color: TEXT_MAIN, fontFamily: "inherit" }}
    >
      <span style={{ fontSize: "0.88rem" }}>{formatDayLabel(day.date)}</span>
      <span style={{ fontSize: "0.88rem", textAlign: "right" }}>{stepsText(day)}<span style={{ color: TEXT_MUTED, fontSize: "0.7rem" }}> 歩</span></span>
      <span style={{ fontSize: "0.88rem", textAlign: "right", color: TEXT_SUB }}>{sleepText(day)}</span>
    </button>
    {open && <div style={{ padding: "2px 2px 16px" }}><DayDetail day={day} /></div>}
  </div>
);

const monthOf = (date: string): string => {
  const [y, m] = date.split("-");
  return `${y}年${Number(m)}月`;
};

const BodySection: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const [days, setDays] = useState<BodyDay[]>(() => loadCachedBodyDays());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState(90);
  const [openDates, setOpenDates] = useState<Set<string>>(() => new Set());
  const [code, setCode] = useState<string | null>(null);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setDays(await fetchBodyDays(user.uid, range));
    } catch (e) {
      console.error(e);
      const code = e instanceof Error ? ((e as { code?: string }).code ?? e.message) : String(e);
      setError(
        `${days.length > 0 ? "最新を読み込めなかったので、前回の分を出しています。" : "読み込めませんでした。電波の良いところでもう一度。"}（${code}）`,
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

          {days.length === 0 ? (
            <p style={emptyStateStyle}>
              {loading ? "読み込み中…" : "まだバンドの記録が届いていません。下の「バンド連携」で中継アプリとつなぐと、毎日ここに入ります。"}
            </p>
          ) : (
            <>
              <LatestCard day={days[0]} />
              <WeekBars days={days} />
              {days.length > 1 && (
                <div style={{ ...cardStyle, marginBottom: 0, padding: "14px 16px 6px" }}>
                  <div style={{ fontSize: "0.8rem", color: TEXT_SUB, fontWeight: 600, paddingBottom: 6 }}>これまで</div>
                  {days.slice(1).map((d, i) => {
                    const month = monthOf(d.date);
                    const newMonth = i === 0 || monthOf(days[i].date) !== month;
                    return (
                      <React.Fragment key={d.date}>
                        {newMonth && <div style={{ fontSize: "0.72rem", color: ACCENT_BODY, margin: i === 0 ? "6px 0 0" : "18px 0 2px" }}>{month}</div>}
                        <HistoryRow
                          day={d}
                          open={openDates.has(d.date)}
                          onToggle={() =>
                            setOpenDates((prev) => {
                              const next = new Set(prev);
                              if (next.has(d.date)) next.delete(d.date);
                              else next.add(d.date);
                              return next;
                            })
                          }
                        />
                      </React.Fragment>
                    );
                  })}
                </div>
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
          </section>
        </div>
      </div>
    </div>
  );
};

export default BodySection;
