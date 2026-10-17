// src/config.ts — 公開して問題ない設定値をまとめる。
//
// Firebase のウェブ設定値と OAuth クライアント ID はブラウザに配る前提の値
// （アクセス制御は Firebase の承認済みドメインと OAuth の承認済みオリジンで行う）。
// 以前は .env.local に置いていたが、スマホだけで開発・公開できるようにリポジトリに入れた。

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC-VPVNpKD2yTrf73hbm6QpocGQB-7LiKk",
  authDomain: "myme-c829c.firebaseapp.com",
  projectId: "myme-c829c",
  storageBucket: "myme-c829c.firebasestorage.app",
  messagingSenderId: "686005856848",
  appId: "1:686005856848:web:f50d5c4404da1f4e257f55",
};

/** Firebase SDK は npm に入れず gstatic から読み込む（sw.js がキャッシュしてオフラインでも起動できる） */
export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.5";

/** Google ドライブのバックアップに使う OAuth クライアント ID（旧 MYME と同じもの。drive.file の都合で変えないこと） */
export const GOOGLE_CLIENT_ID = "690520791633-brjnp80la1su0qruf3jt1jrupva4tbou.apps.googleusercontent.com";

declare global {
  /** build.mjs が埋め込むビルド日時（JST） */
  const __BUILD_TIME__: string;
}
