import { useEffect } from 'react';

/**
 * Shared modal behaviour: dismiss on Escape, and stop the page behind the
 * modal from scrolling while it is open.
 *
 * Both were missing almost everywhere. The keyboard-shortcuts overlay
 * advertises `Esc` as "Close modals", but only two of the fifteen modals
 * actually listened for it, and nothing locked body scroll — so scrolling
 * inside a dialog fell through to the library grid behind it, which is
 * especially disorienting on a phone or a TV remote.
 */

/**
 * Open modals, oldest first. Escape must close only the topmost one.
 *
 * A per-modal `document` listener cannot do this: listeners on the same node
 * fire in registration order, so the *oldest* modal would win, and
 * stopPropagation does not suppress siblings on that node. One shared listener
 * driven by this stack gives the right answer regardless of mount order.
 */
const escapeStack: Array<() => void> = [];

/** Body-scroll lock is refcounted so an inner modal closing does not unlock
 *  the page while an outer one is still open. */
let scrollLockCount = 0;
let previousOverflow = '';
let previousPaddingRight = '';

function handleGlobalEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  // Let a composing IME finish first.
  if (event.isComposing) return;

  const top = escapeStack[escapeStack.length - 1];
  if (!top) return;

  event.stopPropagation();
  top();
}

function pushEscapeHandler(handler: () => void) {
  if (escapeStack.length === 0) {
    document.addEventListener('keydown', handleGlobalEscape, true);
  }
  escapeStack.push(handler);
}

function popEscapeHandler(handler: () => void) {
  const index = escapeStack.lastIndexOf(handler);
  if (index !== -1) escapeStack.splice(index, 1);
  if (escapeStack.length === 0) {
    document.removeEventListener('keydown', handleGlobalEscape, true);
  }
}

function acquireScrollLock() {
  const { body } = document;
  if (scrollLockCount === 0) {
    previousOverflow = body.style.overflow;
    previousPaddingRight = body.style.paddingRight;
    // Compensate for the scrollbar disappearing so the page does not jump.
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;
  }
  scrollLockCount += 1;
}

function releaseScrollLock() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = previousOverflow;
    document.body.style.paddingRight = previousPaddingRight;
  }
}

export function useModalBehavior(
  isOpen: boolean,
  onClose: (() => void) | undefined,
  options: { closeOnEscape?: boolean; lockScroll?: boolean } = {}
) {
  const { closeOnEscape = true, lockScroll = true } = options;

  useEffect(() => {
    if (!isOpen || !closeOnEscape || !onClose) return;

    pushEscapeHandler(onClose);
    return () => popEscapeHandler(onClose);
  }, [isOpen, closeOnEscape, onClose]);

  useEffect(() => {
    if (!isOpen || !lockScroll) return;
    if (typeof document === 'undefined') return;

    acquireScrollLock();
    return releaseScrollLock;
  }, [isOpen, lockScroll]);
}
