/**
 * Universal Haptic Feedback utility for LFLIX.
 * Provides subtle tactile feedback on touch devices and mobile browsers
 * via navigator.vibrate, falling back gracefully on desktop.
 */

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning';

export function triggerHaptic(style: HapticStyle = 'light'): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined' || !('vibrate' in navigator)) {
    return;
  }

  try {
    switch (style) {
      case 'selection':
        navigator.vibrate(6);
        break;
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(18);
        break;
      case 'heavy':
        navigator.vibrate(28);
        break;
      case 'success':
        navigator.vibrate([10, 30, 15]);
        break;
      case 'warning':
        navigator.vibrate([18, 40, 20]);
        break;
    }
  } catch {
    // Non-fatal: ignore permission or platform restrictions
  }
}
