import { useEffect, useRef } from 'react';

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

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'video[controls]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Skip controls that are hidden.
 *
 * Deliberately checks computed style rather than offsetWidth/offsetHeight:
 * layout metrics also read as zero for elements inside a collapsed or
 * transformed ancestor, which would drop perfectly focusable controls.
 */
function isVisible(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden')) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

export function useModalBehavior(
  isOpen: boolean,
  onClose: (() => void) | undefined,
  options: { closeOnEscape?: boolean; lockScroll?: boolean; trapFocus?: boolean } = {}
) {
  const { closeOnEscape = true, lockScroll = true, trapFocus = false } = options;
  // Attach to the modal's root element to enable the focus trap. Opt-in,
  // because trapping focus in a container the user cannot escape is worse than
  // not trapping at all — only wire it up where Escape also works.
  const containerRef = useRef<HTMLElement | null>(null);

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

  useEffect(() => {
    if (!isOpen || !trapFocus) return;
    const container = containerRef.current;
    if (!container) return;

    // Restore focus to whatever opened the modal, so keyboard and remote users
    // land back where they were instead of at the top of the page.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const initial = focusableWithin(container)[0];
    if (initial) {
      initial.focus();
    } else if (!container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
      container.focus();
    }

    const handleTab = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = focusableWithin(container);
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && (active === first || !container.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !container.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    container.addEventListener('keydown', handleTab);
    return () => {
      container.removeEventListener('keydown', handleTab);
      previouslyFocused?.focus?.();
    };
  }, [isOpen, trapFocus]);

  return containerRef;
}
