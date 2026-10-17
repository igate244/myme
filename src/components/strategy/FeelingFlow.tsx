// src/components/strategy/FeelingFlow.tsx
//
// 気持ちを選んだあとの流れ：一呼吸 → 効く言葉を1枚ずつめくる → 「何があった？」を一言（任意）
// 怒り・落ち込み・不安のときに開く前提なので、文字は大きく、操作は少なく。
import React, { useRef, useState } from "react";
import type { Emotion, StrategyItem, UserProfile } from "../../domain/models";
import {
  BG_COLOR,
  LINE,
  LINE_2,
  SURFACE,
  TEXT_MAIN,
  TEXT_MUTED,
  TEXT_SUB,
  WARN_COLOR,
  ACCENT,
  FONT_SANS,
  primaryButtonStyle,
  secondaryButtonStyle,
  textareaStyle,
} from "../uiStyles";
import { emotionColor, shuffle, verdictLabel } from "./common";

type Card =
  | { type: "item"; item: StrategyItem }
  | { type: "profile"; label: string; sub: string; text: string };

type Props = {
  /** null は「すべてめくる」 */
  emotion: Emotion | null;
  items: StrategyItem[];
  profile: UserProfile | null;
  onSaveDefinition: (item: StrategyItem, detail: string) => Promise<void>;
  onAddNote: (item: StrategyItem, text: string) => Promise<void>;
  onSaveMood: (text: string) => Promise<void>;
  onClose: () => void;
};

const buildDeck = (emotion: Emotion | null, items: StrategyItem[], profile: UserProfile | null): Card[] => {
  const matched = emotion ? items.filter((i) => i.emotions.includes(emotion.id)) : items.filter((i) => i.pinned || i.kind !== "definition" || i.detail);
  const pinned = shuffle(matched.filter((i) => i.pinned));
  const rest = shuffle(matched.filter((i) => !i.pinned));
  // 空の定義は問いかけとして最後のほうに混ぜる（読む言葉を先に）
  const filled = rest.filter((i) => !(i.kind === "definition" && !i.detail));
  const questions = rest.filter((i) => i.kind === "definition" && !i.detail).slice(0, 2);
  const cards: Card[] = [...pinned, ...filled, ...questions].map((item) => ({ type: "item", item }));

  // 「自分」画面に書いた自己分析を、一番効くタイミングで最初に出す
  if (emotion?.id === "anger" && profile?.rules) {
    cards.unshift({ type: "profile", label: "自分の矜持", sub: "譲れないルール", text: profile.rules });
  }
  if (emotion?.id === "envy" && profile?.envy) {
    cards.unshift({ type: "profile", label: "自分の渇望", sub: "本当はどうなりたい？", text: profile.envy });
  }
  if (emotion?.id === "fulfilled" && profile?.fuel) {
    cards.unshift({ type: "profile", label: "自分の燃料", sub: "喜び・エネルギー源", text: profile.fuel });
  }
  return cards;
};

const Breath: React.FC<{ color: string; onDone: () => void }> = ({ color, onDone }) => (
  <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: 24 }}>
    <div style={{ position: "relative", width: 200, height: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          background: `${color}22`,
          border: `1px solid ${color}66`,
          animation: "mymeBreath 8s ease-in-out infinite",
        }}
      />
    </div>
    <span style={{ color: TEXT_SUB, fontSize: "1rem", textAlign: "center", lineHeight: 1.8 }}>
      広がる時に吸って、縮む時にゆっくり吐く
    </span>
    <p style={{ color: TEXT_MUTED, fontSize: "0.85rem", margin: 0, textAlign: "center", lineHeight: 1.8 }}>
      3回だけでいい
    </p>
    <button type="button" onClick={onDone} style={{ ...primaryButtonStyle, width: "auto", padding: "12px 36px" }}>
      読む
    </button>
  </div>
);

const FeelingFlow: React.FC<Props> = ({ emotion, items, profile, onSaveDefinition, onAddNote, onSaveMood, onClose }) => {
  const color = emotion ? emotionColor(emotion) : ACCENT;
  // めくる順は開いたときに決めて固定する（途中でメモを足しても並びが変わらないように）。中身は最新を表示
  const [deck] = useState(() => buildDeck(emotion, items, profile));
  // 一呼吸は落ち着かせたい気持ちのときだけ（すべてめくる・調子いい時は省く）
  const [step, setStep] = useState<"breath" | "cards" | "mood">(emotion?.group === "hard" ? "breath" : "cards");
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [inlineDraft, setInlineDraft] = useState("");
  const [inlineOpen, setInlineOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const touchX = useRef<number | null>(null);

  const go = (delta: number): void => {
    setInlineOpen(false);
    setInlineDraft("");
    setSavedMsg(null);
    const next = index + delta;
    if (next < 0) return;
    if (next >= deck.length) {
      setStep("mood");
      return;
    }
    setIndex(next);
  };

  const rawCard = deck[index];
  const card: Card | undefined =
    rawCard && rawCard.type === "item" ? { type: "item", item: items.find((i) => i.id === rawCard.item.id) ?? rawCard.item } : rawCard;

  const saveInline = async (): Promise<void> => {
    if (!card || card.type !== "item" || !inlineDraft.trim()) return;
    setBusy(true);
    try {
      if (card.item.kind === "definition" && !card.item.detail) await onSaveDefinition(card.item, inlineDraft.trim());
      else await onAddNote(card.item, inlineDraft.trim());
      setSavedMsg("残したよ");
      setInlineOpen(false);
      setInlineDraft("");
    } finally {
      setBusy(false);
    }
  };

  const finish = async (): Promise<void> => {
    if (draft.trim()) {
      setBusy(true);
      try {
        await onSaveMood(draft.trim());
      } finally {
        setBusy(false);
      }
    }
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 900,
        background: BG_COLOR,
        color: TEXT_MAIN,
        fontFamily: FONT_SANS,
        display: "flex",
        flexDirection: "column",
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: `1px solid ${LINE}` }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
          {emotion ? emotion.label : "すべて"}
        </span>
        <button type="button" onClick={onClose} style={{ background: "transparent", border: "none", color: TEXT_SUB, fontSize: "0.95rem", padding: 6 }}>
          閉じる
        </button>
      </div>

      {step === "breath" && <Breath color={color} onDone={() => setStep(deck.length ? "cards" : "mood")} />}

      {step === "cards" && card && (
        <div
          style={{ flex: 1, display: "flex", flexDirection: "column", padding: 16, minHeight: 0 }}
          onTouchStart={(e) => {
            touchX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchX.current === null || inlineOpen) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            touchX.current = null;
            if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
          }}
        >
          {emotion?.hint && index === 0 && (
            <p style={{ textAlign: "center", color: TEXT_MUTED, fontSize: "0.85rem", margin: "4px 0 12px" }}>{emotion.hint}</p>
          )}

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              background: SURFACE,
              border: `1px solid ${LINE}`,
              borderTop: `3px solid ${color}`,
              borderRadius: 18,
              padding: "28px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 16,
            }}
          >
            {card.type === "profile" ? (
              <>
                <div style={{ fontSize: "0.8rem", color: TEXT_MUTED }}>
                  {card.label}・{card.sub}
                </div>
                <div style={{ fontSize: "1.2rem", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{card.text}</div>
              </>
            ) : card.item.kind === "definition" && !card.item.detail ? (
              <>
                <div style={{ fontSize: "0.8rem", color: TEXT_MUTED }}>問いかけ</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, lineHeight: 1.5 }}>「{card.item.title}」とは？</div>
                <div style={{ color: TEXT_SUB, lineHeight: 1.8 }}>今の自分ならどう言う？</div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: TEXT_MUTED }}>
                  {card.item.pinned && <span style={{ color: WARN_COLOR }}>★</span>}
                  {card.item.kind === "quote" ? "名言" : card.item.kind === "definition" ? `定義：${card.item.title}` : "教訓"}
                  {card.item.kind === "lesson" && card.item.verdict !== "none" && <span>・{verdictLabel(card.item.verdict)}</span>}
                </div>
                <div style={{ fontSize: card.item.title.length > 40 ? "1.25rem" : "1.5rem", fontWeight: 700, lineHeight: 1.55 }}>
                  {card.item.kind === "quote"
                    ? `「${card.item.title}」`
                    : card.item.kind === "definition"
                      ? card.item.detail
                      : card.item.title}
                </div>
                {card.item.kind === "quote" && (card.item.source || card.item.detail) && (
                  <div style={{ color: TEXT_SUB, textAlign: "right" }}>— {[card.item.source, card.item.detail].filter(Boolean).join("　")}</div>
                )}
                {card.item.kind === "lesson" && card.item.detail && (
                  <div style={{ color: TEXT_SUB, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{card.item.detail}</div>
                )}
                {card.item.kind === "lesson" && card.item.notes.length > 0 && (
                  <div style={{ borderTop: `1px solid ${LINE}`, paddingTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                    {card.item.notes.slice(0, 3).map((n) => (
                      <div key={n.id} style={{ fontSize: "0.85rem", color: TEXT_SUB, lineHeight: 1.6 }}>
                        <span style={{ color: TEXT_MUTED, marginRight: 8 }}>{n.date.slice(5).replace("-", "/")}</span>
                        {n.text}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {card.type === "item" && (card.item.kind === "lesson" || (card.item.kind === "definition" && !card.item.detail)) && (
            <div style={{ marginTop: 10 }}>
              {inlineOpen ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <textarea
                    style={{ ...textareaStyle, minHeight: 72 }}
                    value={inlineDraft}
                    onChange={(e) => setInlineDraft(e.target.value)}
                    placeholder={card.item.kind === "definition" ? "自分なりの定義" : "振り返りの一言（また破った・効いた など）"}
                    autoFocus
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => void saveInline()} disabled={busy} style={{ ...primaryButtonStyle, flex: 2 }}>
                      残す
                    </button>
                    <button type="button" onClick={() => setInlineOpen(false)} style={{ ...secondaryButtonStyle, flex: 1 }}>
                      やめる
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setInlineOpen(true)}
                  style={{ ...secondaryButtonStyle, width: "100%", borderStyle: "dashed" }}
                >
                  {savedMsg ?? (card.item.kind === "definition" ? "ここで書く" : "振り返りメモを足す")}
                </button>
              )}
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
            <button type="button" onClick={() => go(-1)} disabled={index === 0} style={{ ...secondaryButtonStyle, flex: 1, padding: "14px 0" }}>
              ‹ 前
            </button>
            <span style={{ color: TEXT_MUTED, fontSize: "0.85rem", minWidth: 52, textAlign: "center" }}>
              {index + 1} / {deck.length}
            </span>
            <button type="button" onClick={() => go(1)} style={{ ...secondaryButtonStyle, flex: 1, padding: "14px 0", color: TEXT_MAIN, borderColor: LINE_2 }}>
              {index === deck.length - 1 ? "おわり ›" : "次 ›"}
            </button>
          </div>
        </div>
      )}

      {(step === "mood" || (step === "cards" && !card)) && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 14, padding: 20 }}>
          {deck.length === 0 && (
            <p style={{ color: TEXT_MUTED, fontSize: "0.85rem", lineHeight: 1.8, margin: "0 0 8px", textAlign: "center" }}>
              この気持ちの言葉はまだない。
              <br />
              教訓や名言に気持ちを付けておくと、ここに出るよ。
            </p>
          )}
          <div style={{ fontSize: "1.3rem", fontWeight: 700 }}>何があった？</div>
          <div style={{ color: TEXT_MUTED, fontSize: "0.85rem" }}>一言だけ。書かずに閉じてもいい</div>
          <textarea
            style={{ ...textareaStyle, minHeight: 120 }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="あとで読み返したときの自分へ"
          />
          <button type="button" onClick={() => void finish()} disabled={busy} style={primaryButtonStyle}>
            {draft.trim() ? "残して閉じる" : "閉じる"}
          </button>
          {deck.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setIndex(0);
                setStep("cards");
              }}
              style={secondaryButtonStyle}
            >
              もう一度読む
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default FeelingFlow;
