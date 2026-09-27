# 001 — Optimize Watchlist Page Animations & Eliminate Rendering Lag

- **Status**: DONE
- **Commit**: e1a179e
- **Severity**: HIGH
- **Category**: Performance, Easing & Physicality
- **Estimated scope**: 2 files (`app/components/WatchlistPage.tsx`, `app/globals.css`)

## Problem

Interactions on the Watchlist page (`http://localhost:3000` under the Watchlist tab) suffer from heavy frame drops, stuttering hover states, and delayed tab switching. The lag is caused by four compounding issues:

1. **CSS vs. Framer Motion Conflict**: Cards in both Grid and List views apply Tailwind's `transition-all duration-300` / `duration-200` alongside Framer Motion's `whileHover` and `whileTap` inline transform springs. Every 16ms rAF spring update triggers a 300ms CSS transition, creating a continuous frame fight and judder.
   - Location: `app/components/WatchlistPage.tsx:885` and `app/components/WatchlistPage.tsx:1023`
   ```tsx
   /* app/components/WatchlistPage.tsx:885 — current */
   className={`group relative rounded-2xl sm:rounded-3xl overflow-hidden cursor-pointer apple-glass-card transition-all duration-300 shadow-lg ${
       available && !inLibrary
           ? 'border-emerald-500/40 shadow-emerald-500/10 hover:border-emerald-400/80 hover:shadow-emerald-500/25'
           : 'border-white/12 hover:border-white/35'
   }`}
   ```

2. **Synchronous Layout Thrashing**: Both the grid container and every card specify Framer Motion's `layout` prop inside `<AnimatePresence mode="popLayout">`. When switching tabs ('Movies', 'TV Shows', 'Available', 'In Library') or filtering, Framer Motion synchronously invokes `getBoundingClientRect()` on 10–50 elements, forcing expensive main-thread layout reflows and stalls.
   - Location: `app/components/WatchlistPage.tsx:864, 875, 1005, 1014`
   ```tsx
   /* app/components/WatchlistPage.tsx:864-875 — current */
   <motion.div
       layout
       className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-5 sm:gap-6 relative z-10"
   >
       <AnimatePresence mode="popLayout">
           {filteredWatchlist.map((item) => {
               ...
               return (
                   <motion.div
                       layout
                       initial={{ opacity: 0, scale: 0.92 }}
                       animate={{ opacity: 1, scale: 1 }}
                       exit={{ opacity: 0, scale: 0.85 }}
                       whileHover={{ y: -8, scale: 1.025 }}
                       whileTap={{ scale: 0.98 }}
                       transition={{ type: 'spring', damping: 22, stiffness: 280 }}
   ```

3. **GPU Multi-Pass Backdrop Overdraw**: 20–50 cards with `backdrop-filter: blur(20px)` stacked over fixed 80px blur auras, compounded by nested badge `backdrop-blur-md` and hover scrim `backdrop-blur-[3px]`. The GPU rasterizer must execute hundreds of dual-pass Gaussian blurs per frame during scroll or animation.
   - Location: `app/components/WatchlistPage.tsx:912-936` and `app/globals.css:1081-1091`

4. **Non-Composited Search Height Animation**: Search dropdown animates `height: 0` to `height: 'auto'`, which cannot run on the GPU compositor and triggers CPU layout recalculations on every animation frame.
   - Location: `app/components/WatchlistPage.tsx:490-495`
   ```tsx
   /* app/components/WatchlistPage.tsx:490-495 — current */
   <motion.div
       initial={{ opacity: 0, height: 0, y: -4 }}
       animate={{ opacity: 1, height: 'auto', y: 0 }}
       exit={{ opacity: 0, height: 0, y: -4 }}
       transition={{ type: 'spring', damping: 26, stiffness: 300 }}
       className="border-t border-white/10 mt-3 pt-3 overflow-hidden"
   >
   ```

5. **Underdamped Card Hover Springs**: Hover springs use `damping: 22, stiffness: 280`, causing cards to wobble/oscillate on pointer hover instead of settling cleanly per Apple's critically damped standard.

---

## Target

1. **Pure GPU Transforms**: Remove `transition-all duration-300` / `duration-200` from card classes. Only transition `border-color` and `box-shadow` via CSS. Let Framer Motion manage transforms exclusively.
2. **Instant Compositor-Accelerated Grid Transitions**: Remove `layout` prop from container and cards. Replace `mode="popLayout"` with fast compositor-friendly opacity + subtle scale (`scale: 0.96` to `1`) transitions.
3. **Apple Critically Damped Springs**: Start card hover motion at `damping: 32, stiffness: 360` (critically damped, zero overshoot, ~220ms settle).
4. **Optimized GPU Compositing Isolation**:
   - Add `isolation: isolate` and `transform: translateZ(0)` to cards in `app/globals.css`.
   - Remove nested `backdrop-blur-[3px]` from card hover scrims.
   - Replace nested badge `backdrop-blur-md` with opaque high-contrast dark backgrounds (`bg-black/90` or `bg-neutral-950/90`).
5. **Compositor-Friendly Search Popover**: Animate `opacity` and `y` (`initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}`) using `ease-out` token `cubic-bezier(0.16, 1, 0.3, 1)` without animating `height`.
6. **Accessibility**: Implement `useReducedMotion()` from `framer-motion` to replace spatial transforms with clean opacity crossfades when `prefers-reduced-motion: reduce` is active.

---

## Repo Conventions to Follow

- Motion imports from `framer-motion`: `import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';`
- Glass tokens and card styles in `app/globals.css:1081-1091` (`.apple-glass-card`).
- Custom easing for smooth Apple-style transitions: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Existing test suite located at `tests/watchlistPage.test.tsx` (all 5 tests must continue to pass).

---

## Steps

### Step 1: Optimize `.apple-glass-card` in `app/globals.css`
In `app/globals.css` around lines 1081–1099:
1. Ensure `.apple-glass-card` does NOT inherit or allow broad `transition: all`.
2. Restrict CSS transition strictly to `border-color` and `box-shadow`:
   ```css
   /* target */
   .apple-glass-card {
     position: relative;
     background: rgba(22, 22, 32, 0.6);
     backdrop-filter: blur(20px) saturate(180%);
     -webkit-backdrop-filter: blur(20px) saturate(180%);
     border: 1px solid rgba(255, 255, 255, 0.12);
     box-shadow: 
       0 10px 30px -5px rgba(0, 0, 0, 0.5),
       inset 0 1px 1px rgba(255, 255, 255, 0.2);
     isolation: isolate;
     transform: translateZ(0);
     transition: border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s cubic-bezier(0.16, 1, 0.3, 1);
   }
   ```

### Step 2: Update Imports and Hook in `WatchlistPage.tsx`
In `app/components/WatchlistPage.tsx`:
1. Update `framer-motion` import at line 28 to include `useReducedMotion`:
   ```tsx
   import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
   ```
2. Inside `WatchlistPage` component body (around line 88), add:
   ```tsx
   const shouldReduceMotion = useReducedMotion();
   ```

### Step 3: Remove `height` Animation from Search Popover
In `app/components/WatchlistPage.tsx` lines 489–496, replace the `height: 'auto'` spring animation:
```tsx
/* app/components/WatchlistPage.tsx:489-496 — target */
<AnimatePresence>
    {(searching || searchQuery.trim().length >= 2) && (
        <motion.div
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-white/10 mt-3 pt-3 overflow-hidden"
        >
```

### Step 4: Fix Active Tab Indicator Performance
In `app/components/WatchlistPage.tsx` line 671:
Replace `backdrop-blur-xl` and heavy glow with a lightweight `backdrop-blur-sm` and GPU hint:
```tsx
/* app/components/WatchlistPage.tsx:669-673 — target */
{isActive && (
    <motion.div
        layoutId="activeWatchlistTab"
        className="absolute inset-0 bg-white/20 border border-white/35 rounded-xl shadow-[0_2px_10px_rgba(255,255,255,0.18)] backdrop-blur-sm will-change-transform"
        transition={{ type: 'spring', damping: 28, stiffness: 350 }}
    />
)}
```

### Step 5: Fix Grid View Cards (Remove `layout`, `transition-all`, and Nested Blurs)
In `app/components/WatchlistPage.tsx` lines 863–937:
1. Remove `layout` from parent `<motion.div>` at line 864.
2. Remove `mode="popLayout"` from `<AnimatePresence>` at line 867.
3. On the card `<motion.div>` (lines 874–890):
   - Remove `layout` prop.
   - Update `initial`, `animate`, `exit`, `whileHover`, `whileTap`, and `transition` with critically damped spring and `shouldReduceMotion` checks:
     ```tsx
     initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
     animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
     exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.94 }}
     whileHover={shouldReduceMotion ? {} : { y: -6, scale: 1.02 }}
     whileTap={shouldReduceMotion ? {} : { scale: 0.98 }}
     transition={{ type: 'spring', damping: 32, stiffness: 360, mass: 0.8 }}
     ```
   - On the card `className` (line 885): remove `transition-all duration-300`, and replace with `transition-colors duration-200`:
     ```tsx
     className={`group relative rounded-2xl sm:rounded-3xl overflow-hidden cursor-pointer apple-glass-card transition-colors duration-200 shadow-lg ${
         available && !inLibrary
             ? 'border-emerald-500/40 shadow-emerald-500/10 hover:border-emerald-400/80 hover:shadow-emerald-500/25'
             : 'border-white/12 hover:border-white/35'
     }`}
     ```
4. On status badges (lines 912–925):
   - Replace `backdrop-blur-md` with high-contrast `bg-black/90` or `bg-emerald-950/90`.
5. On the hover scrim (line 936):
   - Remove `backdrop-blur-[3px]`:
     ```tsx
     className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-4 z-20"
     ```

### Step 6: Fix List View Cards
In `app/components/WatchlistPage.tsx` lines 1005–1026:
1. Remove `layout` from parent `<motion.div>` at line 1005.
2. Remove `mode="popLayout"` from `<AnimatePresence>` at line 1006.
3. On list item `<motion.div>`:
   - Remove `layout` prop.
   - Update hover & spring props:
     ```tsx
     initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
     animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
     exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
     whileHover={shouldReduceMotion ? {} : { scale: 1.01 }}
     transition={{ type: 'spring', damping: 30, stiffness: 350 }}
     ```
   - On `className` (line 1023): remove `transition-all duration-200` and replace with `transition-colors duration-200`.

---

## Boundaries

- Do NOT modify business logic, API requests (`/api/watchlist`, `/api/watchlist/track`), or state management.
- Do NOT remove or modify `data-testid` attributes (`watchlist-card-*`, `watchlist-list-item-*`, `tab-*`).
- Do NOT change modal dialog behavior in `DownloadModal.tsx` or `TrailerModal.tsx`.
- Scope is strictly limited to `app/components/WatchlistPage.tsx` and `app/globals.css`.

---

## Verification

### Mechanical Verification
Run the Vitest test suite and project verification script:
```powershell
npx vitest run tests/watchlistPage.test.tsx
npm run typecheck
```
**Expected outcome**: All 5 existing unit and interaction tests pass cleanly with zero TypeScript errors.

### Feel Check
1. **Card Hover Feel**: Move pointer rapidly across the cards in grid view. Cards should lift instantly (`y: -6, scale: 1.02`) with zero delay, no oscillation/overshoot, and settle smoothly with locked 60/120fps.
2. **Tab Switch Feel**: Click between 'All', 'Movies', 'TV Shows', and 'Available'. The view should transition instantaneously without freezing the active tab indicator or stuttering.
3. **Search Popover**: Type into the TMDB search box. The results popover should slide in smoothly without page-wide layout jumping.
4. **Reduced Motion**: In Chrome DevTools (Rendering tab -> Emulate CSS media feature `prefers-reduced-motion: reduce`), verify that hovering and tab changes cross-fade smoothly without any spatial scaling or translation.

### Done When
- No card element has `transition-all`.
- No card or grid container uses Framer Motion's `layout` prop.
- No nested `backdrop-blur` exists inside card hover scrims.
- `npx vitest run tests/watchlistPage.test.tsx` passes 5/5 tests.
