// src/domain/LifeStoreContext.tsx
import React, { createContext, useContext } from "react";
import type { LifeStore } from "./LifeStore";

const LifeStoreContext = createContext<LifeStore | null>(null);

export const LifeStoreProvider: React.FC<{ store: LifeStore; children: React.ReactNode }> = ({
  store,
  children,
}) => {
  return <LifeStoreContext.Provider value={store}>{children}</LifeStoreContext.Provider>;
};

export const useLifeStore = (): LifeStore => {
  const context = useContext(LifeStoreContext);
  if (!context) {
    throw new Error("useLifeStore は LifeStoreProvider の中で使ってください");
  }
  return context;
};

export type { LifeStore };
