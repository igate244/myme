// src/hooks/useBackClose.ts
//
// Android実機で「戻るボタン」を押すとブラウザ/PWAごと閉じてしまう問題への対処。
// このアプリは画面遷移をURL（ブラウザの履歴）ではなくReactのstateで行っているため、
// 何もしないと戻るボタンを押しても戻れる履歴が無く、そのままアプリが終了してしまう。
//
// 使い方: 「開いている/閉じている」を表すbooleanと、閉じる処理を渡すだけ。
//
//   useBackClose(selectedId !== null, () => setSelectedId(null));
//
// isOpenがtrueの間、履歴を1つ積んでおく。戻るボタンが押されて履歴が1つ消費されたら
// （popstate）、渡した関数を呼んでアプリ側の表示も1段階戻す。
// アプリ内の「×」ボタンなどプログラムで閉じた場合は、積んでおいた履歴をこちらで
// 消費しておく（放っておくと無駄な履歴だけが残り、次の戻るボタンが1回空振りする）。
//
// 同じ画面の中で複数箇所（一覧→詳細、詳細→編集モーダル、など）がこのフックを使っても、
// 開いた順に積まれたスタックとして扱うので、戻るボタンは常に一番手前のものだけを閉じる。

import { useEffect, useRef } from "react";

type StackEntry = { close: () => void };

const stack: StackEntry[] = [];
let listenerAttached = false;
let ignoreNextPopStateCount = 0;

function ensureListener(): void {
  if (listenerAttached) return;
  listenerAttached = true;

  window.addEventListener("popstate", () => {
    // history.back() をこちら側（プログラムによる close）から呼んだ分は、
    // 本物の「戻るボタン」ではないので読み飛ばす。
    if (ignoreNextPopStateCount > 0) {
      ignoreNextPopStateCount -= 1;
      return;
    }
    const top = stack.pop();
    top?.close();
  });
}

export function useBackClose(isOpen: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    ensureListener();

    const entry: StackEntry = { close: () => onCloseRef.current() };
    stack.push(entry);
    window.history.pushState({ mymeBack: true }, "");

    return () => {
      // 戻るボタンで既に消費済み（スタックから抜けている）なら何もしない。
      const index = stack.lastIndexOf(entry);
      if (index === -1) return;

      // 戻るボタン以外で閉じられた場合: 積んでおいた履歴をこちらで片付ける。
      stack.splice(index, 1);
      ignoreNextPopStateCount += 1;
      window.history.back();
    };
  }, [isOpen]);
}
