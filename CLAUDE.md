# CLAUDE.md — 開発エージェント向けメモ

このリポジトリは、オーナーが**スマホだけ**で開発・運用している個人用PWA「MYME（ライフログ）」。
変更依頼はスマホのClaudeアプリから来る。オーナーは「開発したいのではなく、自分用のアプリを作って使いたいだけ」。git・デプロイは全部こちらでやる。

## 守ること
- **実データが入っている。既存データを壊さないのが最優先**
  - データはスマホのブラウザ内（IndexedDB `MymeDatabase`）にある。`src/infrastructure/db.ts` の過去のバージョン定義は消さない。表を足すときは version を上げて追記
  - 旧形式のデータは `src/domain/models.ts` の `normalizeXxx()` が吸収する。項目名を変えるときは normalize で旧名も読む
  - バックアップ JSON のキー名（`ExportedData`）は変えない（旧 MYME のバックアップを読めなくなる）
  - Firebase プロジェクト（myme-c829c）と公開アドレスは変えない。ログインの uid とアドレス（オリジン）が端末内データの持ち主キーになっている
- 変更したら `npm test` と `npm run build` が通ることを確認してから main に push する（push＝本番公開）
- **スマホで見る前提**。画面を変えたら、スマホ幅（390px）で長い文字・長いURL入りのデータを入れてスクリーンショットを撮り、横にはみ出していないか自分で見る
  - grid は `gridTemplateColumns: "minmax(0, 1fr)"` のように最小幅0を指定する（長い1行で列が画面より広がる事故があった）
  - `npm run dev` → http://localhost:5173/?demo でログインを省いて見られる
  - ホームは2列のタイル（オーナーの好み）
- 依存パッケージは増やさない（react / react-dom / dexie / esbuild / tsx だけ）。Firebase SDK は gstatic から動的 import
- 見た目は「落ち着いたデザイン」。グラデーション・光彩・ゲーム風の言い回しは使わない。色は `src/components/uiStyles.ts` のトークンから
- オーナーへの報告は短く、くだけた日本語で。結果と「スマホで何をすればいいか」だけ

## 構成
- `src/App.tsx` 画面の切り替え（`SECTIONS` の表に1行足せば画面が増える）
- `src/components/*Section.tsx` 各画面
  - ライフログ（YearlyGoals）・子どもの記録（Growth）・やりたいこと（BucketList）・真理図鑑（Strategy）・名言（Quote）・遺すもの（Legacy）・自分（Profile：プロフィール、ドライブのバックアップ、ファイル書き出し／読み込み）
  - **真理図鑑**（旧・指針。2026年10月21日に作り直し）：人生で見つけた真理を集めて育てる図鑑。`StrategySection.tsx` と `src/components/strategy/`
    - 内部名（`strategies` 表・`StrategySection`・view `"strategy"`）は旧データ・バックアップ互換のため変えていない
    - 真理＝ kind "lesson"（一言）か "definition"（「〇〇とは」。detail が空なら「まだ見つけてない真理」）。名言は kind "quote" で別セクション
    - 分野 `field`・出どころ `origin`・見つけた日 `foundDate`・きっかけのライフログ `lifeLogId`。旧データの分野は `INITIAL_FIELDS`（タイトルで引く）
    - 「また実感した」は `notes`。確かさ＝1＋notes の数。番号 No.xxx は見つけた日順
    - ホームの「今日の真理」は日付ごとに同じ1つ（`pickOfTheDay`）
    - 一時期あった「気持ちから開く」入口は外した。`emotions`・`moodLogs`・`appSettings.customEmotions` はデータとして残してある（消さない）
  - 人物名鑑は「人間図鑑」アプリ、カウンターは「KEEP」アプリに独立したので画面から外した。**データ（DB の表・バックアップ）は残してある**
- `src/components/uiStyles.ts` 色・共通スタイル（ダーク・モノトーン＋差し色）
- `src/domain/` データの形（models.ts）と保存の窓口（LifeStore.ts）
- `src/infrastructure/` IndexedDB（Dexie）実装、Google ドライブ（drive.file、`MYME_Backup` フォルダ、30世代）、Firebase Auth の読み込み
  - ドライブのトークンは sessionStorage なので、アプリを閉じると切れる。連携の目印と最後の保存時刻を localStorage（`myme.driveLinked` / `myme.lastBackupAt`）に残し、切れていたらホームに「バックアップが止まってる・再開する」を出す
- `src/config.ts` 公開して問題ない設定値（Firebase ウェブ設定、OAuth クライアント ID）
- `build.mjs` esbuild でビルド→ `dist/`、`src/sw.template.js` から sw.js を生成（オフライン対応）
- `.github/workflows/deploy.yml` main への push で test→build→Firebase Hosting（https://myme-c829c.web.app）に公開

## 確認方法
```
npm install
npm test
npm run dev   # http://localhost:5173/?demo
```

## 要件・今後
`docs/requirements.md` が最新の要件。方針変更があったらそこも更新する。
