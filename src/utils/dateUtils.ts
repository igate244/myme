// src/utils/dateUtils.ts
//
// 日付は常に「端末のローカルタイムゾーン」基準で扱う。
// new Date("2026-09-12") は UTC 解釈されるため、日本時間では 9/12 09:00 になる。
// これをローカルの 0 時と比較すると期限や集計が 1 日ズレるので、
// 日付文字列のパースは必ず parseLocalDate() を通すこと。

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 生まれ年が不明な誕生日を表すダミー年（月日だけ登録したい場合に使う） */
export const UNKNOWN_BIRTH_YEAR = 1000;

/** Date -> "YYYY-MM-DD"（ローカル基準） */
export const toDateString = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

/** 時刻を切り落としたコピーを返す */
export const startOfDay = (date: Date): Date => {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
};

/** 日数を加減したコピーを返す */
export const shiftDays = (date: Date, days: number): Date => {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
};

/**
 * "YYYY-MM-DD" / "YYYY/MM/DD" / ISO 文字列を、ローカル基準の 0 時の Date にする。
 * パースできない場合は null。
 */
export const parseLocalDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const matched = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(trimmed);
  if (matched) {
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    const day = Number(matched[3]);
    const date = new Date(year, month - 1, day);
    // 2026-02-31 のような存在しない日付を弾く
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return null;
    }
    return date;
  }

  const fallback = new Date(trimmed);
  return Number.isNaN(fallback.getTime()) ? null : startOfDay(fallback);
};

/** 今日の "YYYY-MM-DD" */
export const getTodayString = (): string => toDateString(new Date());

/** 昨日の "YYYY-MM-DD" */
export const getYesterdayString = (): string => toDateString(shiftDays(new Date(), -1));

/** "YYYY-MM-DD" を days 日ずらした "YYYY-MM-DD" */
export const addDaysToDateString = (dateStr: string, days: number): string => {
  const parsed = parseLocalDate(dateStr);
  if (!parsed) return dateStr;
  return toDateString(shiftDays(parsed, days));
};

/** 2 つの日付文字列の差（to - from）を日数で返す */
export const diffInDays = (fromDateStr: string, toDateStr: string): number | null => {
  const from = parseLocalDate(fromDateStr);
  const to = parseLocalDate(toDateStr);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
};

/** 今日から指定日までの残り日数。今日ならちょうど 0、過去ならマイナス。 */
export const daysUntilDate = (dateStr?: string): number | null => {
  if (!dateStr) return null;
  const target = parseLocalDate(dateStr);
  if (!target) return null;
  return Math.round((target.getTime() - startOfDay(new Date()).getTime()) / MS_PER_DAY);
};

/** 生まれ年が不明扱い（ダミー年）かどうか */
export const hasUnknownBirthYear = (birthday?: string): boolean => {
  const parsed = parseLocalDate(birthday);
  return parsed !== null && parsed.getFullYear() === UNKNOWN_BIRTH_YEAR;
};

/**
 * 年齢を計算する。
 * targetDateStr を渡すと「その日時点の年齢」、省略すると「現在の年齢」。
 * 生まれ年が不明な場合は null。
 */
export const calculateAge = (birthday?: string, targetDateStr?: string): number | null => {
  const birth = parseLocalDate(birthday);
  if (!birth || birth.getFullYear() === UNKNOWN_BIRTH_YEAR) return null;

  const target = targetDateStr ? parseLocalDate(targetDateStr) : startOfDay(new Date());
  if (!target) return null;

  let age = target.getFullYear() - birth.getFullYear();
  const monthDiff = target.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && target.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

/** 次の誕生日までの日数（今日が誕生日なら 0）。生まれ年が不明でも月日だけで計算できる。 */
export const calculateDaysUntil = (birthday?: string): number | null => {
  const birth = parseLocalDate(birthday);
  if (!birth) return null;

  const today = startOfDay(new Date());
  let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next.getTime() < today.getTime()) {
    next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
  }
  return Math.round((next.getTime() - today.getTime()) / MS_PER_DAY);
};

/** 生まれてからの総日数。生まれ年が不明なら null。 */
export const calculateTotalDays = (birthday?: string): number | null => {
  const birth = parseLocalDate(birthday);
  if (!birth || birth.getFullYear() === UNKNOWN_BIRTH_YEAR) return null;
  const today = startOfDay(new Date());
  return Math.floor((today.getTime() - birth.getTime()) / MS_PER_DAY);
};

/** "3歳2ヶ月" / "5ヶ月12日" / "20日" のような細かい年齢表記 */
export const formatExactAge = (birthDate?: string, targetDateStr?: string): string => {
  const birth = parseLocalDate(birthDate);
  if (!birth || birth.getFullYear() === UNKNOWN_BIRTH_YEAR) return "";

  const target = targetDateStr ? parseLocalDate(targetDateStr) : startOfDay(new Date());
  if (!target) return "";
  if (target.getTime() < birth.getTime()) return "誕生前";

  let years = target.getFullYear() - birth.getFullYear();
  let months = target.getMonth() - birth.getMonth();
  let days = target.getDate() - birth.getDate();

  if (days < 0) {
    months--;
    // 対象月の前月の日数を足して繰り下げる
    const lastDayOfPrevMonth = new Date(target.getFullYear(), target.getMonth(), 0).getDate();
    days += lastDayOfPrevMonth;
  }
  if (months < 0) {
    years--;
    months += 12;
  }

  if (years === 0) {
    return months === 0 ? `${days}日` : `${months}ヶ月${days}日`;
  }
  return `${years}歳${months}ヶ月`;
};

/** 表示用の誕生日文字列。生まれ年が不明なら "M/D" だけ返す。 */
export const formatBirthday = (birthday?: string): string => {
  const parsed = parseLocalDate(birthday);
  if (!parsed) return "";
  const monthDay = `${parsed.getMonth() + 1}/${parsed.getDate()}`;
  return parsed.getFullYear() === UNKNOWN_BIRTH_YEAR ? monthDay : `${parsed.getFullYear()}/${monthDay}`;
};

/** ファイル名に使える時刻表記（例: 2026-09-12_14-30-05） */
export const toFileTimestamp = (date: Date = new Date()): string => {
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join("-");
  return `${toDateString(date)}_${time}`;
};
