// src/App.tsx
import React, { useCallback, useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LifeStoreProvider, useLifeStore } from "./domain/LifeStoreContext";
import { DexieLifeStore } from "./infrastructure/DexieLifeStore";
import { downloadJson } from "./utils/download";
import { toFileTimestamp } from "./utils/dateUtils";
import { useBackClose } from "./hooks/useBackClose";
import type { SectionView, View } from "./views";

import { ErrorBoundary } from "./components/ErrorBoundary";
import HomeMenu from "./components/HomeMenu";
import YearlyGoalsSection from "./components/YearlyGoalsSection";
import BucketListSection from "./components/BucketListSection";
import StrategySection from "./components/StrategySection";
import QuoteSection from "./components/QuoteSection";
import ProfileSection from "./components/ProfileSection";
import LegacySection from "./components/LegacySection";
import GrowthSection from "./components/GrowthSection";
import AuthScreen from "./components/AuthScreen";
import { AutoBackupManager } from "./components/AutoBackupManager";
import { outerStyle, cardStyle, primaryButtonStyle, secondaryButtonStyle, sectionTitleStyle, DANGER_COLOR } from "./components/uiStyles";

const store = new DexieLifeStore();

// 画面の追加はこの表に 1 行足すだけで済む。
// 人物名鑑（→人間図鑑アプリ）とカウンター（→KEEP）は独立アプリに移したので外した。
// どちらもデータは端末内とバックアップに残してある（DB の表は消していない）。
const SECTIONS: Record<SectionView, React.FC<{ onBack: () => void }>> = {
  lifeLog: YearlyGoalsSection,
  bucketList: BucketListSection,
  strategy: StrategySection,
  quotes: QuoteSection,
  profile: ProfileSection,
  legacy: LegacySection,
  growth: GrowthSection,
};

const centeredScreenStyle: React.CSSProperties = {
  height: "100dvh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "#111214",
  color: "#e8e6e3",
};

/** 画面が落ちたときの受け皿。データの書き出しだけはできるようにしておく。 */
const CrashScreen: React.FC<{ error: Error; onReset: () => void }> = ({ error, onReset }) => {
  const { user } = useAuth();
  const lifeStore = useLifeStore();
  const [exporting, setExporting] = useState(false);

  const handleExport = async (): Promise<void> => {
    if (!user) return;
    try {
      setExporting(true);
      const data = await lifeStore.exportAllData(user.uid);
      downloadJson(`MYME_Rescue_${toFileTimestamp()}.json`, data);
    } catch (exportError) {
      console.error("書き出しに失敗しました", exportError);
      window.alert("書き出しに失敗しました");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ ...outerStyle, justifyContent: "center", padding: 16 }}>
      <div style={{ ...cardStyle, maxWidth: 480 }}>
        <h2 style={{ ...sectionTitleStyle, marginBottom: 12 }}>表示中に問題が起きました</h2>
        <p style={{ color: "#8b8a87", fontSize: "0.9rem", lineHeight: 1.7, marginTop: 0 }}>
          記録したデータはこの端末に残っています。念のため書き出してから開き直してください。
        </p>
        <pre
          style={{
            background: "rgba(0,0,0,0.35)", color: DANGER_COLOR, fontSize: "0.75rem",
            padding: 12, borderRadius: 8, overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word",
          }}
        >
          {error.message}
        </pre>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
          {user && (
            <button type="button" onClick={() => void handleExport()} disabled={exporting} style={primaryButtonStyle}>
              {exporting ? "書き出し中..." : "データを書き出す"}
            </button>
          )}
          <button type="button" onClick={onReset} style={secondaryButtonStyle}>
            画面に戻る
          </button>
          <button type="button" onClick={() => window.location.reload()} style={secondaryButtonStyle}>
            アプリを開き直す
          </button>
        </div>
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<View>("home");

  const goHome = useCallback(() => setCurrentView("home"), []);

  // 各画面（ホーム以外）が開いている間はAndroidの戻るボタンでホームに戻る。
  useBackClose(currentView !== "home", goHome);

  if (loading) return <div style={centeredScreenStyle}>読み込み中…</div>;
  if (!user) return <AuthScreen />;

  const Section = currentView === "home" ? null : SECTIONS[currentView];

  return (
    <>
      {/* 画面には出ないが裏で定期バックアップを動かす */}
      <AutoBackupManager />
      {Section ? <Section onBack={goHome} /> : <HomeMenu onSelect={setCurrentView} />}
    </>
  );
};

const App: React.FC = () => (
  <AuthProvider>
    <LifeStoreProvider store={store}>
      <ErrorBoundary renderFallback={(error, reset) => <CrashScreen error={error} onReset={reset} />}>
        <AppContent />
      </ErrorBoundary>
    </LifeStoreProvider>
  </AuthProvider>
);

export default App;
