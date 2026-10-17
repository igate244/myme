// src/components/ErrorBoundary.tsx
//
// 画面のどこかで例外が出たときに真っ白にならないようにする受け皿。
// データは端末内に残っているので、復旧できる案内を出すことを優先する。

import React from "react";

type Props = {
  children: React.ReactNode;
  renderFallback: (error: Error, reset: () => void) => React.ReactNode;
};

type State = {
  error: Error | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: unknown): void {
    console.error("[MYME] 画面でエラーが発生しました", error);
  }

  render(): React.ReactNode {
    const { error } = this.state;
    if (error) {
      return this.props.renderFallback(error, () => this.setState({ error: null }));
    }
    return this.props.children;
  }
}
