// src/infrastructure/GoogleDriveService.ts
//
// Google ドライブへのバックアップ。
//
// 以前は gapi-script（更新の止まった外部ラッパー）に依存していたが、
// 実際にやっているのは Drive REST API の呼び出しだけなので fetch に置き換えた。
// 認証は index.html で読み込んでいる Google Identity Services（GIS）のトークンだけを使う。
//
// 変更点:
//  * 取得したトークンを sessionStorage に保持するため、再読み込み後も連携が続く
//    （以前はメモリのみで、リロードするたびに自動バックアップが黙って止まっていた）
//  * 401 を受けたら裏で取り直して 1 度だけ再試行する
//  * バックアップフォルダの ID をキャッシュし、アップロードのたびの検索をなくす
//  * 古いバックアップを自動で間引く（以前は 15 分ごとに増え続けていた）

import { GOOGLE_CLIENT_ID } from "../config";

const CLIENT_ID: string | undefined = GOOGLE_CLIENT_ID;
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_NAME = "MYME_Backup";
const TOKEN_STORAGE_KEY = "myme.driveToken";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";

/** 保持するバックアップの世代数。これを超えた古いものは自動で削除する。 */
export const BACKUP_KEEP_COUNT = 30;

export interface DriveBackupFile {
  id: string;
  name: string;
  createdTime: string;
}

/* ------------------------------- Google Identity Services の最小限の型定義 */

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleAccountsOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }): TokenClient;
  revoke(token: string, done?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts: { oauth2: GoogleAccountsOAuth2 } };
  }
}

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

const readStoredToken = (): StoredToken | null => {
  try {
    const raw = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { accessToken, expiresAt } = parsed as Record<string, unknown>;
    if (typeof accessToken !== "string" || typeof expiresAt !== "number") return null;
    return expiresAt > Date.now() ? { accessToken, expiresAt } : null;
  } catch {
    // プライベートモード等で sessionStorage が使えない場合は未連携として扱う
    return null;
  }
};

const writeStoredToken = (token: StoredToken | null): void => {
  try {
    if (token) sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
    else sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // 保存できなくても動作自体は続けられるので無視する
  }
};

export class GoogleDriveService {
  private tokenClient: TokenClient | null = null;
  private token: StoredToken | null = readStoredToken();
  private folderId: string | null = null;
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private pending: { resolve: () => void; reject: (error: Error) => void } | null = null;
  private listeners = new Set<() => void>();

  get isConfigured(): boolean {
    return typeof CLIENT_ID === "string" && CLIENT_ID.length > 0;
  }

  get isReady(): boolean {
    return this.ready;
  }

  get isSignedIn(): boolean {
    return this.token !== null && this.token.expiresAt > Date.now();
  }

  /** 連携状態が変わったときに呼ばれる購読を登録する。戻り値を呼ぶと解除。 */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private setToken(token: StoredToken | null): void {
    this.token = token;
    writeStoredToken(token);
    this.emit();
  }

  /** GIS のスクリプト読み込みを待ってトークンクライアントを用意する（何度呼んでも 1 回だけ実行される） */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.doInit().catch((error: unknown) => {
        // 失敗しても次回もう一度試せるようにしておく
        this.initPromise = null;
        throw error;
      });
    }
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    if (!this.isConfigured) {
      throw new Error("VITE_GOOGLE_CLIENT_ID が設定されていません");
    }
    const oauth2 = await waitForGis();
    this.tokenClient = oauth2.initTokenClient({
      client_id: CLIENT_ID as string,
      scope: SCOPE,
      callback: (response) => {
        const pending = this.pending;
        this.pending = null;

        if (response.error || !response.access_token) {
          pending?.reject(new Error(response.error ?? "アクセストークンを取得できませんでした"));
          return;
        }
        // 期限ぎりぎりで失敗しないよう 60 秒早めに切れる扱いにする
        const lifetimeSec = Math.max((response.expires_in ?? 3600) - 60, 60);
        this.setToken({
          accessToken: response.access_token,
          expiresAt: Date.now() + lifetimeSec * 1000,
        });
        pending?.resolve();
      },
      error_callback: (error) => {
        const pending = this.pending;
        this.pending = null;
        pending?.reject(new Error(error.message ?? "Google との連携がキャンセルされました"));
      },
    });
    this.ready = true;
    this.emit();
  }

  /** 同意画面を出してトークンを取得する。ポップアップが閉じられた場合は reject される。 */
  async signIn(): Promise<void> {
    await this.init();
    await this.requestToken("");
  }

  /** 画面を出さずにトークンを取り直す。取れなければ false。 */
  private async signInSilently(): Promise<boolean> {
    try {
      await this.init();
      await this.requestToken("none");
      return true;
    } catch {
      return false;
    }
  }

  private requestToken(prompt: string): Promise<void> {
    const client = this.tokenClient;
    if (!client) return Promise.reject(new Error("Google 連携の初期化が終わっていません"));
    if (this.pending) return Promise.reject(new Error("認証処理がすでに進行中です"));

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending) {
          this.pending = null;
          reject(new Error("認証がタイムアウトしました"));
        }
      }, 120_000);

      this.pending = {
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };

      try {
        client.requestAccessToken({ prompt });
      } catch (error) {
        this.pending = null;
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("認証を開始できませんでした"));
      }
    });
  }

  signOut(): void {
    const token = this.token;
    if (token && window.google) {
      window.google.accounts.oauth2.revoke(token.accessToken);
    }
    this.folderId = null;
    this.setToken(null);
  }

  /* --------------------------------------------------------------- API 呼び出し */

  private async authorizedFetch(url: string, init: RequestInit = {}, allowRetry = true): Promise<Response> {
    if (!this.isSignedIn && allowRetry) {
      const refreshed = await this.signInSilently();
      if (!refreshed) throw new DriveAuthError();
    }
    const token = this.token;
    if (!token) throw new DriveAuthError();

    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token.accessToken}`);
    const response = await fetch(url, { ...init, headers });

    if ((response.status === 401 || response.status === 403) && allowRetry) {
      // 期限切れ・権限エラーのときは 1 度だけ取り直して再試行する
      this.setToken(null);
      const refreshed = await this.signInSilently();
      if (refreshed) return this.authorizedFetch(url, init, false);
      throw new DriveAuthError();
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Drive API エラー (${response.status}): ${detail.slice(0, 200)}`);
    }
    return response;
  }

  private async getFolderId(): Promise<string> {
    if (this.folderId) return this.folderId;

    const query = [
      "mimeType='application/vnd.google-apps.folder'",
      `name='${FOLDER_NAME.replace(/'/g, "\\'")}'`,
      "trashed=false",
    ].join(" and ");

    const searchUrl = `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}&fields=${encodeURIComponent("files(id,name)")}&spaces=drive`;
    const searchResponse = await this.authorizedFetch(searchUrl);
    const searchResult = (await searchResponse.json()) as { files?: Array<{ id?: string }> };

    const existingId = searchResult.files?.[0]?.id;
    if (existingId) {
      this.folderId = existingId;
      return existingId;
    }

    const createResponse = await this.authorizedFetch(`${DRIVE_FILES_URL}?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
    });
    const created = (await createResponse.json()) as { id?: string };
    if (!created.id) throw new Error("バックアップ用フォルダを作成できませんでした");

    this.folderId = created.id;
    return created.id;
  }

  async uploadBackup(fileName: string, content: string): Promise<void> {
    const folderId = await this.getFolderId();
    const boundary = `myme-${Date.now().toString(36)}`;
    const metadata = { name: fileName, mimeType: "application/json", parents: [folderId] };

    const body =
      `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${content}\r\n` +
      `--${boundary}--`;

    await this.authorizedFetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });

    await this.pruneBackups(BACKUP_KEEP_COUNT);
  }

  async listBackups(): Promise<DriveBackupFile[]> {
    const folderId = await this.getFolderId();
    const query = `'${folderId}' in parents and trashed=false`;
    const url =
      `${DRIVE_FILES_URL}?q=${encodeURIComponent(query)}` +
      `&fields=${encodeURIComponent("files(id,name,createdTime)")}` +
      "&orderBy=createdTime desc&pageSize=100&spaces=drive";

    const response = await this.authorizedFetch(url);
    const result = (await response.json()) as { files?: Array<Partial<DriveBackupFile>> };

    return (result.files ?? [])
      .filter((file): file is DriveBackupFile =>
        typeof file.id === "string" && typeof file.name === "string" && typeof file.createdTime === "string")
      .map((file) => ({ id: file.id, name: file.name, createdTime: file.createdTime }));
  }

  async downloadBackup(fileId: string): Promise<unknown> {
    const response = await this.authorizedFetch(`${DRIVE_FILES_URL}/${encodeURIComponent(fileId)}?alt=media`);
    return response.json();
  }

  /** 新しい keep 件だけ残して、それより古いバックアップを削除する */
  private async pruneBackups(keep: number): Promise<void> {
    try {
      const files = await this.listBackups();
      const stale = files.slice(keep);
      for (const file of stale) {
        await this.authorizedFetch(`${DRIVE_FILES_URL}/${encodeURIComponent(file.id)}`, { method: "DELETE" }, false);
      }
    } catch {
      // 間引きに失敗してもバックアップ自体は成功しているので握りつぶす
    }
  }
}

/** 認証が切れていて、利用者の操作なしには復帰できない状態 */
export class DriveAuthError extends Error {
  constructor() {
    super("Google との連携が切れています。もう一度連携してください。");
    this.name = "DriveAuthError";
  }
}

/** GIS のスクリプト（index.html で読み込み）が使えるようになるまで待つ */
const waitForGis = (timeoutMs = 15_000): Promise<GoogleAccountsOAuth2> =>
  new Promise((resolve, reject) => {
    const started = Date.now();
    const check = (): void => {
      const oauth2 = window.google?.accounts?.oauth2;
      if (oauth2) {
        resolve(oauth2);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Google のスクリプトを読み込めませんでした"));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });

export const driveService = new GoogleDriveService();
