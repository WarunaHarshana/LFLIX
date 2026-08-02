/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import { useModalBehavior } from '@/app/hooks/useModalBehavior';

function pressEscape() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

// The hook keeps module-level state (the escape stack and the scroll-lock
// refcount) on purpose, so every mounted hook must be unmounted between tests
// or the counts leak into the next one.
afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
  document.body.style.paddingRight = '';
});

describe('escape handling', () => {
  it('closes an open modal', () => {
    const onClose = vi.fn();
    renderHook(() => useModalBehavior(true, onClose));
    pressEscape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores a closed modal', () => {
    const onClose = vi.fn();
    renderHook(() => useModalBehavior(false, onClose));
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes only the topmost modal when several are open', () => {
    // The reason this hook keeps a stack: listeners on the same node fire in
    // registration order, so a naive per-modal listener would close the
    // *outermost* modal first, or close every open layer at once.
    const outer = vi.fn();
    const inner = vi.fn();
    renderHook(() => useModalBehavior(true, outer));
    renderHook(() => useModalBehavior(true, inner));

    pressEscape();
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it('falls back to the outer modal once the inner one unmounts', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    renderHook(() => useModalBehavior(true, outer));
    const innerHook = renderHook(() => useModalBehavior(true, inner));

    innerHook.unmount();
    pressEscape();
    expect(outer).toHaveBeenCalledTimes(1);
    expect(inner).not.toHaveBeenCalled();
  });

  it('stops listening once every modal has closed', () => {
    const onClose = vi.fn();
    const hook = renderHook(() => useModalBehavior(true, onClose));
    hook.unmount();
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('can be opted out of', () => {
    const onClose = vi.fn();
    renderHook(() => useModalBehavior(true, onClose, { closeOnEscape: false }));
    pressEscape();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('body scroll lock', () => {
  it('locks while open and restores on close', () => {
    const hook = renderHook(() => useModalBehavior(true, vi.fn()));
    expect(document.body.style.overflow).toBe('hidden');
    hook.unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('stays locked until the last nested modal closes', () => {
    const outer = renderHook(() => useModalBehavior(true, vi.fn()));
    const inner = renderHook(() => useModalBehavior(true, vi.fn()));

    inner.unmount();
    expect(document.body.style.overflow, 'outer modal is still open').toBe('hidden');

    outer.unmount();
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('does not lock when disabled', () => {
    renderHook(() => useModalBehavior(true, vi.fn(), { lockScroll: false }));
    expect(document.body.style.overflow).not.toBe('hidden');
  });
});
