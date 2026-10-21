// src/components/strategy/useStrategyItems.ts — 真理図鑑・名言のデータ操作（両方の画面で共用）
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import { useLifeStore } from "../../domain/LifeStoreContext";
import type { StrategyItem, StrategyItemInput } from "../../domain/models";
import { newId } from "../../utils/id";
import { todayString } from "./common";

export const toInput = (item: StrategyItem): StrategyItemInput => ({
  kind: item.kind,
  category: item.category,
  title: item.title,
  detail: item.detail,
  source: item.source,
  emotions: item.emotions,
  pinned: item.pinned,
  notes: item.notes,
  field: item.field,
  origin: item.origin,
  foundDate: item.foundDate,
  lifeLogId: item.lifeLogId,
  verdict: item.verdict,
  strength: item.strength,
});

export const useStrategyItems = () => {
  const { user } = useAuth();
  const store = useLifeStore();
  const [items, setItems] = useState<StrategyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void store
      .getStrategies(user.uid)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch((loadError: unknown) => {
        console.error(loadError);
        if (!cancelled) setError("読み込みに失敗しました");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, store]);

  const save = useCallback(
    async (id: string | null, input: StrategyItemInput): Promise<boolean> => {
      if (!user) return false;
      setSaving(true);
      try {
        if (id) {
          const updated = await store.updateStrategyItem(user.uid, id, input);
          setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
        } else {
          const created = await store.addStrategyItem(user.uid, input);
          setItems((prev) => [created, ...prev]);
        }
        setError(null);
        return true;
      } catch (saveError) {
        console.error(saveError);
        setError("保存に失敗しました");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [user, store],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user || !window.confirm("削除しますか？")) return false;
      try {
        await store.deleteStrategyItem(user.uid, id);
        setItems((prev) => prev.filter((item) => item.id !== id));
        return true;
      } catch (deleteError) {
        console.error(deleteError);
        setError("削除に失敗しました");
        return false;
      }
    },
    [user, store],
  );

  /** 「また実感した」を1件足す。戻り値は更新後の項目 */
  const addReconfirm = useCallback(
    async (item: StrategyItem, text: string, date = todayString()): Promise<boolean> =>
      save(item.id, { ...toInput(item), notes: [{ id: newId(), date, text }, ...item.notes] }),
    [save],
  );

  const removeReconfirm = useCallback(
    async (item: StrategyItem, noteId: string): Promise<boolean> =>
      save(item.id, { ...toInput(item), notes: item.notes.filter((n) => n.id !== noteId) }),
    [save],
  );

  return { items, loading, saving, error, save, remove, addReconfirm, removeReconfirm };
};
