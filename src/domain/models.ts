// src/domain/models.ts
//
// アプリが扱うデータの正式な形を定義する。
//
// 【重要】以前のバージョンでは同じ意味の項目が二重に存在していた
//   （detail / content、checklist / checkItems、birthDate / birthday、description / note など）。
// ここでは片方を正式な項目として決め、保存時は正式な項目だけを書き込む。
// 既に保存されている古い形式のデータは normalizeXxx() が読み込み時に吸収するので、
// 過去のデータが消えたり読めなくなったりすることはない。

/* ------------------------------------------------------------- 変換ヘルパ */

type Raw = Record<string, unknown>;

const asRaw = (value: unknown): Raw =>
  typeof value === "object" && value !== null ? (value as Raw) : {};

/** 中身のある文字列だけを返す（空文字・空白のみは未設定扱い） */
const str = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() !== "" ? value : undefined;

const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const strArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

const numArray = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** 数値でも ISO 文字列でも受け取ってエポックミリ秒にする */
const toEpoch = (value: unknown, fallback: number): number => {
  const asNumber = num(value);
  if (asNumber !== undefined) return asNumber;
  const asText = str(value);
  if (asText) {
    const parsed = new Date(asText).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
};

/* --------------------------------------------------------------- Profile */

export interface UserProfile {
  id: string;
  name: string;
  birthDate?: string;
  location?: string;
  /** 表層（建前） */
  surface?: string;
  /** 深層（本音） */
  deep?: string;
  /** 燃料（喜び） */
  fuel?: string;
  /** 矜持（怒り） */
  rules?: string;
  /** 渇望（嫉妬） */
  envy?: string;
  bodyRhythm?: string;
  bodyCare?: string;
  mindDecision?: string;
  mindLearning?: string;
  socialStyle?: string;
  strengths?: string;
  weaknesses?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type UserProfileInput = Omit<UserProfile, "id" | "createdAt" | "updatedAt">;

export const normalizeUserProfile = (raw: unknown, fallbackId: string): UserProfile => {
  const r = asRaw(raw);
  return {
    id: str(r.id) ?? fallbackId,
    name: str(r.name) ?? "",
    birthDate: str(r.birthDate),
    location: str(r.location),
    surface: str(r.surface),
    deep: str(r.deep),
    fuel: str(r.fuel),
    rules: str(r.rules),
    envy: str(r.envy),
    bodyRhythm: str(r.bodyRhythm),
    bodyCare: str(r.bodyCare),
    mindDecision: str(r.mindDecision),
    mindLearning: str(r.mindLearning),
    socialStyle: str(r.socialStyle),
    strengths: str(r.strengths),
    weaknesses: str(r.weaknesses),
    createdAt: str(r.createdAt),
    updatedAt: str(r.updatedAt),
  };
};

/* -------------------------------------------------------------- Life Log */

export const LIFE_LOG_TAGS = ["turning_point", "family", "work", "hobby", "other"] as const;
export type LifeLogTag = (typeof LIFE_LOG_TAGS)[number] | (string & {});

export interface LifeLog {
  id: string;
  userId: string;
  date: string;
  title: string;
  /** 本文。旧 content は読み込み時にここへ寄せる */
  detail?: string;
  tags: LifeLogTag[];
  createdAt: number;
}

export interface LifeLogInput {
  date: string;
  title: string;
  detail?: string;
  tags: LifeLogTag[];
}

export const normalizeLifeLog = (raw: unknown, fallbackUserId: string): LifeLog => {
  const r = asRaw(raw);
  return {
    id: str(r.id) ?? "",
    userId: str(r.userId) ?? fallbackUserId,
    date: str(r.date) ?? "",
    title: str(r.title) ?? "無題",
    detail: str(r.detail) ?? str(r.content),
    tags: strArray(r.tags),
    createdAt: toEpoch(r.createdAt, 0),
  };
};

/* ----------------------------------------------------------- Bucket List */

export const BUCKET_STATUSES = ["want", "doing", "done"] as const;
export type BucketStatus = (typeof BUCKET_STATUSES)[number];

export interface CheckItem {
  id: string;
  label: string;
  isDone: boolean;
}

export interface BucketItem {
  id: string;
  userId: string;
  title: string;
  status: BucketStatus;
  category: string;
  deadline?: string;
  /** 詳細。旧 description は読み込み時にここへ寄せる */
  detail?: string;
  doneDate?: string;
  /** サブタスク。旧 checkItems は読み込み時にここへ寄せる */
  checklist: CheckItem[];
  createdAt: number;
}

export interface BucketItemInput {
  title: string;
  status: BucketStatus;
  category: string;
  deadline?: string;
  detail?: string;
  doneDate?: string;
  checklist: CheckItem[];
}

const normalizeCheckItem = (raw: unknown, index: number): CheckItem => {
  const r = asRaw(raw);
  return {
    id: str(r.id) ?? `check-${index}`,
    label: str(r.label) ?? "",
    isDone: r.isDone === true,
  };
};

export const normalizeBucketItem = (raw: unknown, fallbackUserId: string): BucketItem => {
  const r = asRaw(raw);
  const rawChecklist = Array.isArray(r.checklist)
    ? r.checklist
    : Array.isArray(r.checkItems)
      ? r.checkItems
      : [];
  return {
    id: str(r.id) ?? "",
    userId: str(r.userId) ?? fallbackUserId,
    title: str(r.title) ?? "無題",
    status: oneOf(r.status, BUCKET_STATUSES, "want"),
    category: str(r.category) ?? "other",
    deadline: str(r.deadline),
    detail: str(r.detail) ?? str(r.description),
    doneDate: str(r.doneDate),
    checklist: rawChecklist.map(normalizeCheckItem),
    createdAt: toEpoch(r.createdAt, 0),
  };
};

/* -------------------------------------------------------------- Strategy */

export const STRATEGY_CATEGORIES = ["tactics", "theory", "aesthetic", "definition", "impression"] as const;
export type StrategyCategory = (typeof STRATEGY_CATEGORIES)[number];

export const STRATEGY_VERDICTS = ["adopted", "rejected", "none"] as const;
export type StrategyVerdict = (typeof STRATEGY_VERDICTS)[number];

export type StrategyStrength = 1 | 2 | 3;

/** 2026年10月の作り直しで追加した「種類」。旧 category から読み替える（impression＝名言、definition＝定義、それ以外＝教訓） */
export const STRATEGY_KINDS = ["lesson", "definition", "quote"] as const;
export type StrategyKind = (typeof STRATEGY_KINDS)[number];

export const kindFromCategory = (category: StrategyCategory): StrategyKind =>
  category === "impression" ? "quote" : category === "definition" ? "definition" : "lesson";

/** 新しく作るときに旧 category にも入れておく値（旧形式しか読めない環境でも分類が崩れないように） */
export const categoryFromKind = (kind: StrategyKind): StrategyCategory =>
  kind === "quote" ? "impression" : kind === "definition" ? "definition" : "theory";

/** 教訓につける振り返りメモ（「また破った」「効いた」など） */
export interface StrategyNote {
  id: string;
  date: string;
  text: string;
}

export interface StrategyItem {
  id: string;
  userId: string;
  /** 旧分類。互換のため保持する（画面では kind を使う） */
  category: StrategyCategory;
  kind: StrategyKind;
  title: string;
  detail?: string;
  /** 名言なら「誰の言葉か」 */
  source?: string;
  /** どの気持ちのときに効くか（Emotion の id） */
  emotions: string[];
  pinned: boolean;
  notes: StrategyNote[];
  /** 旧：採用／不採用・重要度。画面からは外したがデータは保持する */
  verdict: StrategyVerdict;
  strength: StrategyStrength;
  /** 既存データとの互換のため ISO 文字列のまま保持する */
  createdAt: string;
}

export interface StrategyItemInput {
  category: StrategyCategory;
  kind: StrategyKind;
  title: string;
  detail?: string;
  source?: string;
  emotions: string[];
  pinned: boolean;
  notes: StrategyNote[];
  verdict: StrategyVerdict;
  strength: StrategyStrength;
}

const toStrength = (value: unknown): StrategyStrength => {
  const n = num(value);
  return n === 1 || n === 3 ? n : 2;
};

const normalizeStrategyNote = (raw: unknown, index: number): StrategyNote => {
  const r = asRaw(raw);
  return { id: str(r.id) ?? `note-${index}`, date: str(r.date) ?? "", text: str(r.text) ?? "" };
};

export const normalizeStrategyItem = (raw: unknown, fallbackUserId: string): StrategyItem => {
  const r = asRaw(raw);
  const category = oneOf(r.category, STRATEGY_CATEGORIES, "tactics");
  const title = str(r.title) ?? "無題";
  const strength = toStrength(r.strength);
  return {
    id: str(r.id) ?? "",
    userId: str(r.userId) ?? fallbackUserId,
    category,
    kind: oneOf(r.kind, STRATEGY_KINDS, kindFromCategory(category)),
    title,
    detail: str(r.detail),
    source: str(r.source),
    // 感情がまだ付いていない旧データは、最初の振り分け（下の表）を使う
    emotions: Array.isArray(r.emotions) ? strArray(r.emotions) : (INITIAL_EMOTIONS[title.trim()] ?? []),
    // 旧「重要度：大」はピン留めとして引き継ぐ
    pinned: typeof r.pinned === "boolean" ? r.pinned : strength === 3,
    notes: Array.isArray(r.notes) ? r.notes.map(normalizeStrategyNote) : [],
    verdict: oneOf(r.verdict, STRATEGY_VERDICTS, "none"),
    strength,
    createdAt: str(r.createdAt) ?? new Date(0).toISOString(),
  };
};

/* --------------------------------------------------------------- 気持ち */

export type EmotionGroup = "hard" | "good";

export interface Emotion {
  id: string;
  label: string;
  group: EmotionGroup;
  /** 選んだときの案内 */
  hint: string;
}

/** 決まっている気持ち。id は保存データに入るので変えないこと（落ち込みは後悔も含む） */
export const DEFAULT_EMOTIONS: Emotion[] = [
  { id: "anger", label: "怒り", group: "hard", hint: "何が許せなかった？" },
  { id: "down", label: "落ち込み", group: "hard", hint: "自分を責めすぎてない？" },
  { id: "anxiety", label: "不安・焦り", group: "hard", hint: "今できることは一つだけでいい" },
  { id: "envy", label: "嫉妬", group: "hard", hint: "本当はどうなりたい？" },
  { id: "lost", label: "迷い", group: "hard", hint: "大事にしたいのはどっち？" },
  { id: "unmotivated", label: "やる気が出ない", group: "hard", hint: "小さく一歩だけ" },
  { id: "going_well", label: "うまくいってる", group: "good", hint: "油断してない？" },
  { id: "fulfilled", label: "満たされてる", group: "good", hint: "今を味わって、感謝を" },
];

/** あとから自分で足した気持ち（設定に保存） */
export const normalizeCustomEmotions = (raw: unknown): Emotion[] =>
  (Array.isArray(raw) ? raw : [])
    .map((row) => {
      const r = asRaw(row);
      const id = str(r.id);
      const label = str(r.label);
      if (!id || !label) return null;
      return { id, label, group: oneOf(r.group, ["hard", "good"] as const, "hard"), hint: str(r.hint) ?? "" };
    })
    .filter((e): e is Emotion => e !== null);

/** 気持ちを選んで読んだあとの一言（「何があった？」） */
export interface MoodLog {
  id: string;
  date: string;
  emotion: string;
  text: string;
  createdAt: number;
}

export const normalizeMoodLog = (raw: unknown): MoodLog | null => {
  const r = asRaw(raw);
  const id = str(r.id);
  if (!id) return null;
  return { id, date: str(r.date) ?? "", emotion: str(r.emotion) ?? "", text: str(r.text) ?? "", createdAt: toEpoch(r.createdAt, 0) };
};

/**
 * 2026年10月時点の指針への最初の感情付け（オーナーと相談して Claude が中身から振り分けた）。
 * 感情を一度でも保存した項目にはもう使われない。スマホから自由に直せる。
 */
const INITIAL_EMOTIONS: Record<string, string[]> = {
  "迷った時はわくわくする方を選択": ["lost", "anxiety"],
  "瞑想すすめ": ["anxiety", "anger"],
  "1人で子育ては不可能、頼れる人に頼れる時に頼ろう": ["anxiety", "down"],
  "共通の敵を作って戦う": ["anger"],
  "学生は「時間内に満点」。 社会は「最速で7割」": ["anxiety", "lost"],
  "胸を張って正しい行いをする": ["anger", "lost", "going_well"],
  "何事にも感謝を": ["fulfilled", "envy", "down"],
  "小さな変化でいいので変化し続ける": ["unmotivated", "down", "going_well"],
  "責任が人を強くする": ["unmotivated", "anxiety"],
  "酒を飲むと人生クオリティ下がる": ["going_well", "fulfilled"],
  "寝不足は１日を無駄にするし危険、お肌に良くない、耳も聞こえない": ["unmotivated", "going_well"],
  "洗濯乾燥機導入": ["anger"],
  "食洗機導入": ["anger"],
  "スマホゲーム": ["unmotivated"],
  "幸せ": ["fulfilled", "down"],
  "運": ["going_well", "down"],
  "教育": ["anger"],
  "失敗": ["down"],
  "成功": ["going_well"],
  "成長": ["unmotivated", "down"],
  "才能": ["envy"],
  "自由": ["lost"],
  "時間": ["unmotivated"],
  "人生": ["lost"],
  "家族": ["anger", "fulfilled"],
  "プロフェッショナル": ["going_well"],
  "正義": ["anger"],
  "大人": ["anger"],
  "チャンスは目の前にあるものよ": ["anxiety", "lost"],
  "悪いが、俺は大人じゃなくて...男なんだよ。": ["lost", "unmotivated"],
  "今の自分が一番好き。そう言えるようになりたい": ["envy", "down"],
  "当たり前のような毎日が、実は奇跡の連続": ["down", "fulfilled"],
  "弱き者には弱き者の戦い方がある": ["envy", "down", "anxiety"],
  "現状維持は、後退するのと同じだ": ["going_well", "unmotivated"],
  "勝ちに不思議の勝ちあり、負けに不思議の負けなし": ["going_well", "down"],
  "人間は、枠にはまるとつまらない。枠をはみ出したところに、面白さがある": ["lost", "envy"],
  "俺が知りたいのは楽な道のりじゃない、険しい道の歩き方だ": ["down", "unmotivated", "anxiety"],
  "お洒落して、街に出て、恋をしろ": ["unmotivated", "down"],
  "当たり前を疑問に思わなくなったら、大人": ["going_well", "fulfilled"],
  "自分を縛る鎖は自分で選ぶ。": ["lost", "anger"],
};

/* ------------------------------------------------------------ Companions */

export const COMPANION_CATEGORIES = ["family", "relative", "work", "friend", "other"] as const;
export type CompanionCategory = (typeof COMPANION_CATEGORIES)[number];

export interface Companion {
  id: string;
  userId: string;
  name: string;
  category: CompanionCategory;
  relation?: string;
  /** 誕生日。旧 birthday は読み込み時にここへ寄せる */
  birthDate?: string;
  /** メモ。旧 description は読み込み時にここへ寄せる */
  note?: string;
  learnings?: string;
  createdAt: number;
}

export interface CompanionInput {
  name: string;
  category: CompanionCategory;
  relation?: string;
  birthDate?: string;
  note?: string;
  learnings?: string;
}

export const normalizeCompanion = (raw: unknown, fallbackUserId: string): Companion => {
  const r = asRaw(raw);
  return {
    id: str(r.id) ?? "",
    userId: str(r.userId) ?? fallbackUserId,
    name: str(r.name) ?? "名称未設定",
    category: oneOf(r.category, COMPANION_CATEGORIES, "other"),
    relation: str(r.relation),
    birthDate: str(r.birthDate) ?? str(r.birthday),
    note: str(r.note) ?? str(r.description),
    learnings: str(r.learnings),
    createdAt: toEpoch(r.createdAt, 0),
  };
};

/* ----------------------------------------------------------- Experiments */

// 現在の画面からは使っていないが、過去に保存されたデータを失わないよう型と保存先は残す
export interface Experiment {
  id: string;
  userId: string;
  title: string;
  status: "draft" | "running" | "completed";
  hypothesis?: string;
  result?: string;
  startDate?: string;
  createdAt: number;
}

export const normalizeExperiment = (raw: unknown, fallbackUserId: string): Experiment => {
  const r = asRaw(raw);
  return {
    id: str(r.id) ?? "",
    userId: str(r.userId) ?? fallbackUserId,
    title: str(r.title) ?? "無題",
    status: oneOf(r.status, ["draft", "running", "completed"] as const, "draft"),
    hypothesis: str(r.hypothesis),
    result: str(r.result),
    startDate: str(r.startDate),
    createdAt: toEpoch(r.createdAt, 0),
  };
};

/* ---------------------------------------------------------------- Legacy */

export const LEGACY_CATEGORIES = ["asset", "message", "memory", "other"] as const;
export type LegacyCategory = (typeof LEGACY_CATEGORIES)[number];

export interface LegacyItem {
  id: string;
  userId: string;
  title: string;
  content: string;
  category: LegacyCategory;
  forWho?: string;
  /**
   * 手紙を書いた日（記入日）。
   * 以前は createdAt が記入日を兼ねていたため編集すると日付が今日に戻ってしまっていた。
   * 記入日と記録作成時刻を分離して、編集しても記入日が保たれるようにする。
   */
  date: string;
  createdAt: number;
}

export interface LegacyItemInput {
  title: string;
  content: string;
  category: LegacyCategory;
  forWho?: string;
  date: string;
}

const toDatePart = (epoch: number): string => {
  const d = new Date(epoch);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export const normalizeLegacyItem = (raw: unknown, fallbackUserId: string): LegacyItem => {
  const r = asRaw(raw);
  const createdAt = toEpoch(r.createdAt ?? r.recordedAt, Date.now());
  return {
    id: str(r.id) ?? "",
    userId: str(r.userId) ?? fallbackUserId,
    title: str(r.title) ?? "無題",
    content: str(r.content) ?? "",
    category: oneOf(r.category, LEGACY_CATEGORIES, "message"),
    forWho: str(r.forWho) ?? str(r.targetName),
    // date が無い古いデータは createdAt の日付を記入日として引き継ぐ
    date: str(r.date) ?? toDatePart(createdAt),
    createdAt,
  };
};

/* --------------------------------------------------------------- Counter */

export const COUNTER_MODES = ["count", "check", "rating"] as const;
export type CounterMode = (typeof COUNTER_MODES)[number];

export const COUNTER_USAGE_TYPES = ["accumulation", "mission", "limit"] as const;
export type CounterUsageType = (typeof COUNTER_USAGE_TYPES)[number];

export const COUNTER_RESET_CYCLES = ["none", "daily", "weekly", "monthly", "yearly"] as const;
export type CounterResetCycle = (typeof COUNTER_RESET_CYCLES)[number];

export interface CounterItem {
  id: string;
  userId: string;
  title: string;
  mode: CounterMode;
  usageType: CounterUsageType;
  /** 実施する曜日（0=日）。空なら毎日 */
  targetDays: number[];
  targetValue?: number;
  resetCycle: CounterResetCycle;
  deadline?: string;
  order: number;
  createdAt: number;
}

export interface CounterItemInput {
  title: string;
  mode: CounterMode;
  usageType: CounterUsageType;
  targetDays: number[];
  targetValue?: number;
  resetCycle: CounterResetCycle;
  deadline?: string;
}

export interface CounterLog {
  /** Dexie の autoIncrement に対応する数値 ID */
  id: number;
  itemId: string;
  date: string;
  value: number;
  createdAt: number;
}

export const normalizeCounterItem = (raw: unknown, fallbackUserId: string, index = 0): CounterItem => {
  const r = asRaw(raw);
  // 旧 "habit" は積み上げ型と同じ挙動だったため accumulation に寄せる
  const usageTypeRaw = r.usageType === "habit" ? "accumulation" : r.usageType;
  return {
    id: str(r.id) ?? "",
    userId: str(r.userId) ?? fallbackUserId,
    title: str(r.title) ?? "無題",
    mode: oneOf(r.mode, COUNTER_MODES, "count"),
    usageType: oneOf(usageTypeRaw, COUNTER_USAGE_TYPES, "accumulation"),
    targetDays: numArray(r.targetDays).filter((day) => day >= 0 && day <= 6),
    targetValue: num(r.targetValue),
    resetCycle: oneOf(r.resetCycle, COUNTER_RESET_CYCLES, "none"),
    deadline: str(r.deadline),
    order: num(r.order) ?? index,
    createdAt: toEpoch(r.createdAt, 0),
  };
};

export const normalizeCounterLog = (raw: unknown): CounterLog | null => {
  const r = asRaw(raw);
  const id = num(r.id);
  const itemId = str(r.itemId);
  const date = str(r.date);
  if (id === undefined || !itemId || !date) return null;
  return {
    id,
    itemId,
    date,
    // 旧データは value 未設定で「1 回」を意味していた
    value: num(r.value) ?? 1,
    createdAt: toEpoch(r.createdAt, 0),
  };
};

/* ---------------------------------------------------------------- Growth */

export const GROWTH_TAGS = ["daily", "event", "skill", "dialogue", "other"] as const;
export type GrowthTag = (typeof GROWTH_TAGS)[number] | (string & {});

export interface GrowthLog {
  id: string;
  childId: string;
  date: string;
  content: string;
  tags: GrowthTag[];
  relatedLifeLogId?: string;
  createdAt: number;
}

export interface FamilyMember {
  id: string;
  name: string;
  order: number;
  birthDate?: string;
  themeColor?: string;
}

export const normalizeGrowthLog = (raw: unknown): GrowthLog => {
  const r = asRaw(raw);
  return {
    id: str(r.id) ?? "",
    childId: str(r.childId) ?? "",
    date: str(r.date) ?? "",
    content: str(r.content) ?? "",
    tags: strArray(r.tags),
    relatedLifeLogId: str(r.relatedLifeLogId),
    createdAt: toEpoch(r.createdAt, 0),
  };
};

export const normalizeFamilyMember = (raw: unknown, index = 0): FamilyMember => {
  const r = asRaw(raw);
  return {
    id: str(r.id) ?? "",
    name: str(r.name) ?? "名称未設定",
    order: num(r.order) ?? index,
    birthDate: str(r.birthDate),
    themeColor: str(r.themeColor),
  };
};

/* --------------------------------------------------------- エクスポート形式 */

// バックアップファイルの形。過去のバックアップを読み込めるようキー名は変更しない。
export interface ExportedData {
  profile: UserProfile | null;
  lifeLog: LifeLog[];
  bucketList: BucketItem[];
  strategies: StrategyItem[];
  companions: Companion[];
  experiments: Experiment[];
  legacies: LegacyItem[];
  counterItems: CounterItem[];
  counterLogs: CounterLog[];
  growthLogs: GrowthLog[];
  familyMembers: FamilyMember[];
  /** 2026年10月に追加。古いバックアップには無い */
  moodLogs?: MoodLog[];
  customEmotions?: Emotion[];
}

/** バックアップ JSON から配列を安全に取り出す */
export const rawArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
