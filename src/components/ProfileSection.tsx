// src/components/ProfileSection.tsx — 自分（プロフィール・自己分析・バックアップ）
//
// 変更点:
//  * 15 個に分かれていた入力用の state を 1 つのオブジェクトにまとめた
//  * Google ドライブ連携は useDriveSync に集約（1 秒待ってから初期化する暫定処理を削除）
//  * 復元処理から具体的な実装クラスへの依存（instanceof 判定）をなくした

import React, { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useLifeStore } from "../domain/LifeStoreContext";
import type { UserProfileInput } from "../domain/models";
import { useDriveSync } from "../hooks/useDriveSync";
import SectionHeader from "./SectionHeader";
import {
  outerStyle, scrollAreaStyle, contentMaxWidth, cardStyle,
  inputStyle, textareaStyle, primaryButtonStyle, secondaryButtonStyle,
  errorTextStyle, DANGER_COLOR, ACCENT, TEXT_MAIN, TEXT_SUB, TEXT_MUTED,
} from "./uiStyles";
import { calculateAge, toFileTimestamp } from "../utils/dateUtils";
import { downloadJson } from "../utils/download";

type Props = { onBack: () => void };

type TabKey = "basic" | "os" | "driver" | "skill";

const TABS: Array<{ key: TabKey; label: string; color: string }> = [
  { key: "basic", label: "基本", color: "#b4a0d8" },
  { key: "os", label: "心と体", color: "#8fb4d4" },
  { key: "driver", label: "感情", color: "#d9bd7a" },
  { key: "skill", label: "能力", color: "#8cc5c0" },
];

const EMPTY_FORM: UserProfileInput = { name: "" };

const SpecField: React.FC<{
  label: string;
  subLabel?: string;
  color?: string;
  children: React.ReactNode;
}> = ({ label, subLabel, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
      <label style={{ fontSize: "0.85rem", fontWeight: 700, color: TEXT_SUB }}>{label}</label>
      {subLabel && <span style={{ fontSize: "0.7rem", color: "#8b8a87" }}>{subLabel}</span>}
    </div>
    {children}
  </div>
);

const ProfileSection: React.FC<Props> = ({ onBack }) => {
  const { user, logout } = useAuth();
  const store = useLifeStore();
  const drive = useDriveSync();

  const [form, setForm] = useState<UserProfileInput>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("basic");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      try {
        const profile = await store.getUserProfile(user.uid);
        if (cancelled) return;
        if (profile) {
          const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = profile;
          setForm(rest);
        }
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) setError("読み込みに失敗しました");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, store]);

  const update = (key: keyof UserProfileInput) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (): Promise<void> => {
    if (!user) return;
    try {
      setSaving(true);
      setError(null);
      // 空欄は未設定として保存する
      const cleaned = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, typeof value === "string" && value.trim() === "" ? undefined : value]),
      ) as UserProfileInput;

      await store.saveUserProfile(user.uid, { ...cleaned, name: form.name });
      setMessage("保存しました");
      setTimeout(() => setMessage(null), 3000);
    } catch (saveError) {
      console.error(saveError);
      setError("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  const handleLocalExport = async (): Promise<void> => {
    if (!user) return;
    try {
      const data = await store.exportAllData(user.uid);
      downloadJson(`MYME_Backup_${toFileTimestamp()}.json`, data);
    } catch (exportError) {
      console.error(exportError);
      setError("エクスポートに失敗しました");
    }
  };

  /** 書き出したファイル（旧 MYME のものも可）から戻す。今の記録は置き換わる */
  const handleLocalImport = async (file: File): Promise<void> => {
    if (!user) return;
    if (!window.confirm(`「${file.name}」の内容で、今の記録をすべて置き換えます。よろしいですか？`)) return;
    try {
      setError(null);
      const data: unknown = JSON.parse(await file.text());
      await store.importData(user.uid, data);
      window.alert("読み込みました。画面を開き直します。");
      window.location.reload();
    } catch (importError) {
      console.error(importError);
      setError(importError instanceof Error ? `読み込みに失敗しました：${importError.message}` : "読み込みに失敗しました");
    }
  };

  if (loading) return <div style={{ ...outerStyle, color: TEXT_MUTED, padding: 40, textAlign: "center" }}>読み込み中…</div>;

  const age = calculateAge(form.birthDate);
  const busy = saving || drive.busy;

  const textArea = (key: keyof UserProfileInput, _color: string, minHeight = 60): React.ReactNode => (
    <textarea
      style={{ ...textareaStyle, minHeight }}
      value={(form[key] as string | undefined) ?? ""}
      onChange={(e) => update(key)(e.target.value)}
    />
  );

  return (
    <div style={outerStyle}>
      <SectionHeader title="自分" onBack={onBack} accentColor="#8cc5c0">
        <div style={{ display: "flex", borderBottom: "1px solid #36373d" }}>
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  flex: 1,
                  padding: "12px 0",
                  background: active ? `${tab.color}20` : "transparent",
                  border: "none",
                  borderBottom: `3px solid ${active ? tab.color : "transparent"}`,
                  color: active ? tab.color : "#8b8a87",
                  fontWeight: active ? 800 : 600,
                  fontSize: "0.9rem",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </SectionHeader>

      <div style={scrollAreaStyle}>
        <div style={{ width: "100%", maxWidth: contentMaxWidth, display: "flex", flexDirection: "column", gap: 16, paddingTop: 16 }}>
          {activeTab === "basic" && (
            <>
              <div style={cardStyle}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 12 }}>
                  <SpecField label="名前">
                    <input
                      type="text"
                      style={{ ...inputStyle, fontWeight: 700, minWidth: 0 }}
                      value={form.name}
                      onChange={(e) => update("name")(e.target.value)}
                    />
                  </SpecField>
                  <SpecField label="年齢" color={age !== null ? "#8cc5c0" : "#8b8a87"}>
                    <div style={{ display: "flex", gap: 8, width: "100%" }}>
                      <input
                        type="date"
                        style={{ ...inputStyle, flex: 1, fontSize: "0.8rem", minWidth: 0 }}
                        value={form.birthDate ?? ""}
                        onChange={(e) => update("birthDate")(e.target.value)}
                      />
                      {age !== null && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "#8cc5c020",
                            color: "#8cc5c0",
                            fontWeight: 800,
                            padding: "0 10px",
                            borderRadius: 8,
                            border: "1px solid #8cc5c040",
                            fontSize: "0.9rem",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {age}歳
                        </div>
                      )}
                    </div>
                  </SpecField>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <SpecField label="居住地">
                      <input
                        type="text"
                        style={inputStyle}
                        value={form.location ?? ""}
                        onChange={(e) => update("location")(e.target.value)}
                        placeholder="例: 宮崎県日向市"
                      />
                    </SpecField>
                  </div>
                </div>
              </div>

              <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 16 }}>
                <SpecField label="表層 (建前)" subLabel="社会的な顔・振る舞い" color="#b4a0d8">
                  {textArea("surface", "#b4a0d8", 80)}
                </SpecField>
                <SpecField label="深層 (本音)" subLabel="内なる野心・本当の性格" color="#b4a0d8">
                  {textArea("deep", "#b4a0d8", 80)}
                </SpecField>
              </div>
            </>
          )}

          {activeTab === "os" && (
            <>
              <div style={cardStyle}>
                <div style={{ borderBottom: "1px solid #36373d", paddingBottom: 8, marginBottom: 12, color: "#d99a9a", fontWeight: 700, letterSpacing: "0.04em", fontSize: "0.85rem" }}>
                  身体・健康
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <SpecField label="リズム" subLabel="朝型/夜型・集中できる時間" color="#d99a9a">
                    {textArea("bodyRhythm", "#d99a9a")}
                  </SpecField>
                  <SpecField label="メンテナンス" subLabel="睡眠・食事・運動などの必須条件" color="#e3b0b0">
                    {textArea("bodyCare", "#e3b0b0")}
                  </SpecField>
                </div>
              </div>

              <div style={cardStyle}>
                <div style={{ borderBottom: "1px solid #36373d", paddingBottom: 8, marginBottom: 12, color: "#8fb4d4", fontWeight: 700, letterSpacing: "0.04em", fontSize: "0.85rem" }}>
                  思考・対人
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <SpecField label="判断ロジック" subLabel="直感重視か、論理重視か" color="#8fb4d4">
                    {textArea("mindDecision", "#8fb4d4")}
                  </SpecField>
                  <SpecField label="学習スタイル" subLabel="インプットの癖" color="#a9c6de">
                    {textArea("mindLearning", "#a9c6de")}
                  </SpecField>
                  <div style={{ height: 1, background: "#36373d" }} />
                  <SpecField label="対人・交流" subLabel="コミュニケーションの傾向" color="#d9bd7a">
                    {textArea("socialStyle", "#d9bd7a")}
                  </SpecField>
                </div>
              </div>
            </>
          )}

          {activeTab === "driver" && (
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 16 }}>
              <SpecField label="燃料 (喜び)" subLabel="回復・エネルギー源・没頭" color="#d9bd7a">
                {textArea("fuel", "#d9bd7a", 80)}
              </SpecField>
              <SpecField label="矜持 (怒り)" subLabel="譲れないルール・地雷" color="#e5786d">
                {textArea("rules", "#e5786d", 80)}
              </SpecField>
              <SpecField label="渇望 (嫉妬)" subLabel="隠れた野心・羨む対象" color="#8fc4a1">
                {textArea("envy", "#8fc4a1", 80)}
              </SpecField>
            </div>
          )}

          {activeTab === "skill" && (
            <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 16 }}>
              <SpecField label="強み" subLabel="苦もなくできること・勝てる領域" color="#8cc5c0">
                {textArea("strengths", "#8cc5c0", 100)}
              </SpecField>
              <SpecField label="弱み" subLabel="苦手なこと・つまずきやすいところ" color="#8b8a87">
                {textArea("weaknesses", "#8b8a87", 100)}
              </SpecField>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 40, marginTop: 16 }}>
            {message && <p style={{ color: "#8fc4a1", textAlign: "center", fontWeight: 700, fontSize: "0.9rem" }}>{message}</p>}
            {error && <p style={errorTextStyle}>{error}</p>}

            <button type="button" onClick={() => void handleSave()} disabled={busy} style={primaryButtonStyle}>
              {saving ? "保存中..." : "保存する"}
            </button>

            <div style={{ ...cardStyle, margin: "16px 0 0", padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color: TEXT_MAIN, fontWeight: 700, fontSize: "0.95rem" }}>
                <span>Googleドライブのバックアップ</span>
              </div>

              {drive.message && <p style={{ fontSize: "0.8rem", color: "#8b8a87", marginTop: 0 }}>{drive.message}</p>}

              {!drive.configured ? (
                <p style={{ fontSize: "0.8rem", color: "#8b8a87", margin: 0 }}>
                  ドライブ連携の設定が見つからないため利用できません。
                </p>
              ) : !drive.ready ? (
                <p style={{ fontSize: "0.8rem", color: "#8b8a87", margin: 0 }}>Google の読み込み中...</p>
              ) : !drive.signedIn ? (
                <button
                  type="button"
                  onClick={() => void drive.connect()}
                  disabled={busy}
                  style={{ ...secondaryButtonStyle, width: "100%", color: ACCENT, borderColor: ACCENT }}
                >
                  Googleアカウントと連携する
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void drive.backupNow({ label: "Manual" })}
                    disabled={busy}
                    style={primaryButtonStyle}
                  >
                    今すぐバックアップを作成
                  </button>
                  <button
                    type="button"
                    onClick={() => void drive.restoreLatest()}
                    disabled={busy}
                    style={secondaryButtonStyle}
                  >
                    ドライブの最新バックアップから戻す
                  </button>
                  <button
                    type="button"
                    onClick={drive.disconnect}
                    style={{ ...secondaryButtonStyle, fontSize: "0.7rem", color: "#8b8a87" }}
                  >
                    連携を解除
                  </button>
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button type="button" onClick={() => void handleLocalExport()} style={{ ...secondaryButtonStyle, flex: 1, fontSize: "0.8rem" }}>
                ファイルに書き出す
              </button>
              <label style={{ ...secondaryButtonStyle, flex: 1, fontSize: "0.8rem", textAlign: "center" }}>
                ファイルから戻す
                <input
                  type="file"
                  accept="application/json,.json"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void handleLocalImport(file);
                  }}
                />
              </label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                onClick={() => void logout()}
                style={{ ...secondaryButtonStyle, flex: 1, borderColor: DANGER_COLOR, color: DANGER_COLOR, fontSize: "0.8rem" }}
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSection;
