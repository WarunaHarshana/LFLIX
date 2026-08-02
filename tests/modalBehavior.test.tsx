/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, renderHook } from '@testing-library/react';
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

describe('focus trap', () => {
  function Dialog({ trapFocus }: { trapFocus: boolean }) {
    const ref = useModalBehavior(true, vi.fn(), { trapFocus }) as React.RefObject<HTMLDivElement>;
    return (
      <div ref={ref}>
        <button id="a">A</button>
        <button id="b">B</button>
        <button id="c">C</button>
      </div>
    );
  }

  it('focuses the first control when it opens', () => {
    render(<Dialog trapFocus />);
    expect(document.activeElement?.id).toBe('a');
  });

  it('leaves focus alone when not enabled', () => {
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    outside.focus();

    render(<Dialog trapFocus={false} />);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });

  it('wraps Tab from the last control back to the first', () => {
    const { container } = render(<Dialog trapFocus />);
    const dialog = container.firstElementChild as HTMLElement;
    const last = dialog.querySelector<HTMLElement>('#c')!;

    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement?.id).toBe('a');
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    const { container } = render(<Dialog trapFocus />);
    const dialog = container.firstElementChild as HTMLElement;
    const first = dialog.querySelector<HTMLElement>('#a')!;

    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement?.id).toBe('c');
  });

  it('restores focus to the opener on close', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    const view = render(<Dialog trapFocus />);
    expect(document.activeElement?.id).toBe('a');

    view.unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});
