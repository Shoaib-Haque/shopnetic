import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { notify } from '@shopnetic/ui';
import { AdminApiError } from '@/features/admin-api/client';
import {
  useSoftDeleteWithUndo,
  type UseSoftDeleteWithUndoOptions,
} from './use-soft-delete-with-undo';

vi.mock('@shopnetic/ui', async () => {
  const actual = await vi.importActual<typeof import('@shopnetic/ui')>('@shopnetic/ui');
  return {
    ...actual,
    notify: { saved: vi.fn(), error: vi.fn(), info: vi.fn(), undo: vi.fn(), dismissUndo: vi.fn() },
  };
});

const mockedNotify = vi.mocked(notify);

interface Item {
  id: string;
  name: string;
}

function item(id: string, name: string): Item {
  return { id, name };
}

function options(
  overrides: Partial<UseSoftDeleteWithUndoOptions<Item>> = {},
): UseSoftDeleteWithUndoOptions<Item> {
  return {
    deleteItem: vi.fn().mockResolvedValue(undefined),
    restoreItem: vi.fn().mockResolvedValue(undefined),
    resync: vi.fn(),
    labelOf: (i) => i?.name ?? '',
    onError: vi.fn(),
    messages: {
      deleted: (name) => `${name} deleted`,
      restored: (name) => `${name} restored`,
      alreadyDeleted: (name) => `${name} already deleted`,
      alreadyRestored: (name) => `${name} already restored`,
      undoLabel: 'Undo',
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useSoftDeleteWithUndo', () => {
  describe('doDelete', () => {
    it('deletes, shows an undo toast, and resyncs — on success', async () => {
      const opts = options();
      const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));

      await act(() => result.current.doDelete(item('a', 'Alpha')));

      expect(opts.deleteItem).toHaveBeenCalledWith('a');
      expect(mockedNotify.undo).toHaveBeenCalledWith(
        'Alpha deleted',
        expect.objectContaining({ undoLabel: 'Undo', undoneMessage: 'Alpha restored' }),
      );
      expect(opts.resync).toHaveBeenCalledTimes(1);
    });

    it('a NOT_FOUND (deleted elsewhere already) shows the calm "already deleted" toast, not an error, and still resyncs', async () => {
      const opts = options({
        deleteItem: vi.fn().mockRejectedValue(new AdminApiError('NOT_FOUND', 404)),
      });
      const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));

      await act(() => result.current.doDelete(item('a', 'Alpha')));

      expect(mockedNotify.info).toHaveBeenCalledWith('Alpha already deleted');
      expect(opts.onError).not.toHaveBeenCalled();
      expect(opts.resync).toHaveBeenCalledTimes(1);
    });

    it('any other delete failure goes through onError, and still resyncs', async () => {
      const boom = new Error('offline');
      const opts = options({ deleteItem: vi.fn().mockRejectedValue(boom) });
      const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));

      await act(() => result.current.doDelete(item('a', 'Alpha')));

      expect(opts.onError).toHaveBeenCalledWith(boom);
      expect(mockedNotify.info).not.toHaveBeenCalled();
      expect(opts.resync).toHaveBeenCalledTimes(1);
    });

    it("the undo toast's onUndo restores the row and resyncs on success, or surfaces the real error and skips the confirmation on failure", async () => {
      const opts = options();
      const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));
      await act(() => result.current.doDelete(item('a', 'Alpha')));
      const onUndo = mockedNotify.undo.mock.calls[0]?.[1]?.onUndo;
      expect(onUndo).toBeTypeOf('function');

      await act(() => onUndo!());
      expect(opts.restoreItem).toHaveBeenCalledWith('a');
      expect(opts.resync).toHaveBeenCalledTimes(2); // once from doDelete, once from onUndo
    });

    it("the undo toast's onUndo surfaces the real error (name now taken, parent archived…) and rethrows to skip the confirmation toast", async () => {
      const boom = new Error('name taken');
      const opts = options({ restoreItem: vi.fn().mockRejectedValue(boom) });
      const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));
      await act(() => result.current.doDelete(item('a', 'Alpha')));
      const onUndo = mockedNotify.undo.mock.calls[0]?.[1]?.onUndo;

      await expect(act(() => onUndo!())).rejects.toThrow('name taken');
      expect(opts.onError).toHaveBeenCalledWith(boom);
    });
  });

  describe('confirmRestore', () => {
    it('does nothing when no restoreTarget is set', async () => {
      const opts = options();
      const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));

      await act(() => result.current.confirmRestore());

      expect(opts.restoreItem).not.toHaveBeenCalled();
      expect(opts.resync).not.toHaveBeenCalled();
    });

    it('restores, shows a saved toast, clears the target, and resyncs — on success', async () => {
      const opts = options();
      const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));
      act(() => result.current.setRestoreTarget(item('a', 'Alpha')));

      await act(() => result.current.confirmRestore());

      expect(opts.restoreItem).toHaveBeenCalledWith('a');
      expect(mockedNotify.saved).toHaveBeenCalledWith('Alpha restored');
      expect(result.current.restoreTarget).toBeNull();
      expect(result.current.restoring).toBe(false);
      expect(opts.resync).toHaveBeenCalledTimes(1);
    });

    it('dismisses a still-open undo toast only when it belongs to the same row being restored', async () => {
      const opts = options();
      const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));
      // a delete-undo toast is showing for row "a"…
      await act(() => result.current.doDelete(item('a', 'Alpha')));
      // …but the restore reaches an unrelated row "b" instead
      act(() => result.current.setRestoreTarget(item('b', 'Bravo')));
      await act(() => result.current.confirmRestore());
      expect(mockedNotify.dismissUndo).not.toHaveBeenCalled();

      // now the restore reaches the same row the undo toast is for
      act(() => result.current.setRestoreTarget(item('a', 'Alpha')));
      await act(() => result.current.confirmRestore());
      expect(mockedNotify.dismissUndo).toHaveBeenCalledTimes(1);
    });

    it('a NOT_FOUND (restored elsewhere already) shows the calm "already restored" toast, clears the target, and still resyncs — the 2026-09-18 fix, now shared', async () => {
      const opts = options({
        restoreItem: vi.fn().mockRejectedValue(new AdminApiError('NOT_FOUND', 404)),
      });
      const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));
      act(() => result.current.setRestoreTarget(item('a', 'Alpha')));

      await act(() => result.current.confirmRestore());

      expect(mockedNotify.info).toHaveBeenCalledWith('Alpha already restored');
      expect(opts.onError).not.toHaveBeenCalled();
      expect(result.current.restoreTarget).toBeNull();
      // the actual 2026-09-18 bug: resync() must fire on this error branch
      // too, or the stale row is left on screen with nothing to refresh it.
      expect(opts.resync).toHaveBeenCalledTimes(1);
    });

    it('any other restore failure goes through onError, clears the target, and still resyncs', async () => {
      const boom = new Error('offline');
      const opts = options({ restoreItem: vi.fn().mockRejectedValue(boom) });
      const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));
      act(() => result.current.setRestoreTarget(item('a', 'Alpha')));

      await act(() => result.current.confirmRestore());

      expect(opts.onError).toHaveBeenCalledWith(boom);
      expect(result.current.restoreTarget).toBeNull();
      expect(opts.resync).toHaveBeenCalledTimes(1);
    });
  });

  it('clearPendingUndo lets an unrelated undo toast (e.g. a drag-reorder undo sharing the same fixed toast id) take over without a later restore dismissing it', async () => {
    const opts = options();
    const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));
    await act(() => result.current.doDelete(item('a', 'Alpha')));

    act(() => result.current.clearPendingUndo());

    act(() => result.current.setRestoreTarget(item('a', 'Alpha')));
    await act(() => result.current.confirmRestore());
    expect(mockedNotify.dismissUndo).not.toHaveBeenCalled();
  });

  it('restoring flips true while in flight and back to false once settled', async () => {
    let resolveRestore!: () => void;
    const opts = options({
      restoreItem: vi
        .fn()
        .mockReturnValue(new Promise<void>((resolve) => (resolveRestore = resolve))),
    });
    const { result } = renderHook(() => useSoftDeleteWithUndo<Item>(opts));
    act(() => result.current.setRestoreTarget(item('a', 'Alpha')));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.confirmRestore();
    });
    await waitFor(() => expect(result.current.restoring).toBe(true));

    await act(async () => {
      resolveRestore();
      await pending;
    });
    expect(result.current.restoring).toBe(false);
  });
});
