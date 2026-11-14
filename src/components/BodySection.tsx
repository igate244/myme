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

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: "0.72rem", color: TEXT_MUTED }}>{label}</div>
    <div style={{ fontSize: "0.95rem", color: TEXT_MAIN, marginTop: 2, wordBreak: "break-word" }}>{value}</div>
  </div>
);

const heartText = (d: BodyDay): string =>
  d.hrMin === null || d.hrMax === null ? "—" : `${d.hrMin}〜${d.hrMax}${d.hrAvg !== null ? `（平均${d.hrAvg}）` : ""}`;

const DayCard: React.FC<{ day: BodyDay }> = ({ day }) => {
  const stages = [
    day.deepMin !== null && `深い ${formatMinutes(day.deepMin)}`,
    day.lightMin !== null && `浅い ${formatMinutes(day.lightMin)}`,
    day.remMin !== null && `レム ${formatMinutes(day.remMin)}`,
    day.awakeMin !== null && day.awakeMin > 0 && `覚醒 ${formatMinutes(day.awakeMin)}`,
  ].filter(Boolean);

  return (
    <div style={{ ...cardStyle, marginBottom: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontWeight: 700 }}>{formatDayLabel(day.date)}</span>
        <span style={{ fontSize: "1.25rem", fontWeight: 700 }}>
          {day.steps === null ? "—" : day.steps.toLocaleString("ja-JP")}
          <span style={{ fontSize: "0.75rem", color: TEXT_MUTED, marginLeft: 4, fontWeight: 400 }}>歩</span>
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12, marginTop: 14 }}>
        <Stat label="睡眠" value={day.sleepMin === null ? "—" : formatMinutes(day.sleepMin)} />
        <Stat label="寝ていた時間" value={day.sleepStartMs === null ? "—" : `${formatClock(day.sleepStartMs)}〜${formatClock(day.sleepEndMs)}`} />
        <Stat label="心拍（回/分）" value={heartText(day)} />
        <Stat label="血中酸素" value={day.spo2Avg === null ? "—" : `${Math.round(day.spo2Avg)}%${day.spo2Min !== null ? `（最低${Math.round(day.spo2Min)}%）` : ""}`} />
      </div>

      {stages.length > 0 && (
        <div style={{ fontSize: "0.78rem", color: TEXT_SUB, marginTop: 12, lineHeight: 1.7 }}>{stages.join("　")}</div>
      )}

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

const BodySection: React.FC<Props> = ({ onBack }) => {
  const { user } = useAuth();
  const [days, setDays] = useState<BodyDay[]>(() => loadCachedBodyDays());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [codeMessage, setCodeMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setDays(await fetchBodyDays(user.uid));
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
  }, [user]);

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
            days.map((d) => <DayCard key={d.date} day={d} />)
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
