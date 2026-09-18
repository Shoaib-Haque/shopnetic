'use client';

import { useCallback, useRef, useState } from 'react';
import { notify } from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';

export interface SoftDeleteMessages {
  deleted: (name: string) => string;
  restored: (name: string) => string;
  /** shown instead of `restored`/an error toast when the row is already gone
   * — someone else (another tab, another admin) got there first. */
  alreadyDeleted: (name: string) => string;
  /** same idea, for the restore side. */
  alreadyRestored: (name: string) => string;
  undoLabel: string;
}

export interface UseSoftDeleteWithUndoOptions<T extends { id: string }> {
  deleteItem: (id: string) => Promise<void>;
  /** Return value (if any — Category's/Brand's `restore*` resolve with the
   * restored row) is ignored here; `resync()` is what the screen refreshes
   * from, so nothing is lost by not using it. */
  restoreItem: (id: string) => Promise<unknown>;
  /** Re-fetch whatever's on screen — called on every settle (success *and*
   * failure) of both `doDelete` and `confirmRestore`, so a stale row never
   * lingers just because the action ended in the calm "already X" branch
   * rather than a plain success. */
  resync: () => void;
  labelOf: (item: T | null | undefined) => string;
  messages: SoftDeleteMessages;
  /** Surfaces anything that isn't the calm "already X" `NOT_FOUND` case. */
  onError: (e: unknown) => void;
}

export interface UseSoftDeleteWithUndo<T> {
  doDelete: (item: T) => Promise<void>;
  restoreTarget: T | null;
  setRestoreTarget: (item: T | null) => void;
  restoring: boolean;
  confirmRestore: () => Promise<void>;
  /** Some other, unrelated undo toast (e.g. a drag-reorder undo) is about to
   * overwrite the shared fixed toast id — this hook's own pending-undo
   * bookkeeping is no longer live either, so callers with such a toast of
   * their own should clear this alongside showing it. */
  clearPendingUndo: () => void;
}

/**
 * Soft-delete + one-click-undo + confirm-then-restore, shared by
 * `CategoryList` and `BrandList` (plan/CODING-RULES.md — extracted
 * 2026-09-18; the two were near-verbatim copies, including three separate
 * same-day bug fixes landed by hand in both). Owns the delete/restore
 * request pair, the "already deleted"/"already restored" `NOT_FOUND` calm
 * path (someone else beat this tab to it), and the undo-toast/restore-modal
 * bookkeeping (`pendingUndoId`) that lets `confirmRestore` dismiss a stale
 * delete-undo toast reaching the same row a different way. Deliberately
 * does *not* own `resync` itself — the tree-vs-flat Category view and the
 * always-flat Brand view refresh differently, so that stays with the
 * caller and is only ever invoked, never defined, here.
 */
export function useSoftDeleteWithUndo<T extends { id: string }>(
  opts: UseSoftDeleteWithUndoOptions<T>,
): UseSoftDeleteWithUndo<T> {
  const { deleteItem, restoreItem, resync, labelOf, messages, onError } = opts;

  const [restoreTarget, setRestoreTarget] = useState<T | null>(null);
  const [restoring, setRestoring] = useState(false);
  const pendingUndoId = useRef<string | null>(null);

  const doDelete = useCallback(
    async (item: T): Promise<void> => {
      try {
        await deleteItem(item.id);
        pendingUndoId.current = item.id;
        notify.undo(messages.deleted(labelOf(item)), {
          undoLabel: messages.undoLabel,
          undoneMessage: messages.restored(labelOf(item)),
          onUndo: async () => {
            try {
              await restoreItem(item.id);
              if (pendingUndoId.current === item.id) pendingUndoId.current = null;
              resync();
            } catch (e) {
              onError(e); // surface the real reason (name now taken, parent archived…)
              throw e; // and skip the "restored" confirmation toast
            }
          },
        });
      } catch (e) {
        // already gone (deleted by someone else, another tab) — the outcome
        // this action wanted is already true; an error toast would be
        // actively misleading here.
        if (e instanceof AdminApiError && e.code === 'NOT_FOUND') {
          notify.info(messages.alreadyDeleted(labelOf(item)));
        } else {
          onError(e);
        }
      } finally {
        resync();
      }
    },
    [deleteItem, restoreItem, resync, labelOf, messages, onError],
  );

  const confirmRestore = useCallback(async (): Promise<void> => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreItem(restoreTarget.id);
      if (pendingUndoId.current === restoreTarget.id) {
        notify.dismissUndo();
        pendingUndoId.current = null;
      }
      notify.saved(messages.restored(labelOf(restoreTarget)));
      setRestoreTarget(null);
    } catch (e) {
      // already restored elsewhere — same reasoning as doDelete's own
      // NOT_FOUND case above.
      if (e instanceof AdminApiError && e.code === 'NOT_FOUND') {
        notify.info(messages.alreadyRestored(labelOf(restoreTarget)));
      } else {
        onError(e);
      }
      setRestoreTarget(null);
    } finally {
      // runs on *every* settle, not just success — an error (including the
      // calm "already restored" case above) would otherwise leave the stale
      // row on screen with nothing to refresh it. `doDelete` above already
      // gets this right via its own `finally`; this matches it.
      resync();
      setRestoring(false);
    }
  }, [restoreTarget, restoreItem, resync, labelOf, messages, onError]);

  const clearPendingUndo = useCallback(() => {
    pendingUndoId.current = null;
  }, []);

  return { doDelete, restoreTarget, setRestoreTarget, restoring, confirmRestore, clearPendingUndo };
}
