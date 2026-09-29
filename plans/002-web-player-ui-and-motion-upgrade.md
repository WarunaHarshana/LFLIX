# 002 — Web Player UI, Apple-Style Motion & Cinejoy Adaptations

- **Status**: DONE
- **Commit**: 87fc650
- **Severity**: HIGH
- **Category**: Performance, Easing, Physicality & UI/UX
- **Estimated scope**: 2 files (`app/components/VideoPlayer.tsx`, `app/globals.css`)

---

## Context & Cinejoy Benchmark

An investigation into the modern streaming web player at [Cinejoy.pk](https://cinejoy.pk/) and audit of LFLIX's existing [`VideoPlayer.tsx`](file:///g:/projects/LFLIX/app/components/VideoPlayer.tsx) under the `/apple-design`, `/improve-ui`, and `/improve-animations` frameworks revealed five high-leverage opportunities to elevate LFLIX's web player to Apple-grade fluid fidelity:

1. **Inline Contextual Settings Popover**: Cinejoy utilizes an inline popover (`.settings-popover`) floating right above the player controls with `backdrop-filter: blur(28px) saturate(180%)` and spring height transitions (`cubic-bezier(0.33, 1, 0.68, 1)`), whereas LFLIX centers an opaque full-screen blocking modal (`fixed inset-0 bg-black/75 backdrop-blur-sm`) that obscures the video while adjusting tracks or styling.
2. **Hover-Expanding Volume Slider**: Cinejoy uses a collapsed slider (`w-0 group-hover:w-24`) to conserve critical toolbar real estate across laptops, tablets, and phones, while LFLIX maintains a static inline input that crowds the bottom toolbar.
3. **Floating Frosted HUD Status Pills**: Cinejoy presents volume adjustments and speed toggles in non-intrusive frosted top pills (`bg-black/50 backdrop-blur-xl border border-white/10 px-4 py-2.5 rounded-full shadow-lg`), giving immediate visual confirmation without obscuring content.
4. **Scrubber Bar Physicality & 1:1 Thumb Tracking**: LFLIX uses broad `transition-all` on the scrubber and track with a static thumb knob. Cinejoy utilizes an expanding track (`h-1 group-hover:h-1.5`) and an expanding playhead thumb (`scale-0 group-hover:scale-100`) with a floating frosted time tooltip.
5. **Tactile Response & Hold-to-2× Speed**: Cinejoy responds instantly on pointer-down with tactile scale feedback (`active:scale-95`, center controls `active:scale-90`) and features a press-and-hold 2× fast-forward gesture.

---

## Problem Specification

1. **Blocking Settings Modal Obscures Video**:
   - Location: [`app/components/VideoPlayer.tsx:2063-2075`](file:///g:/projects/LFLIX/app/components/VideoPlayer.tsx#L2063-L2075)
   - Current Code:
     ```tsx
     {showSettingsModal && (
       <div
         role="dialog"
         aria-modal="true"
         className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn"
         onClick={() => setShowSettingsModal(false)}
       >
         <div
           className="w-full max-w-md liquid-glass-menu rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
           onClick={(e) => e.stopPropagation()}
         >
     ```
   - Issue: Breaks spatial continuity (Apple Design Principle §7) and forces the user out of the viewing experience just to change audio or subtitle tracks.

2. **Static Scrubber Knob & Broad `transition-all`**:
   - Location: [`app/components/VideoPlayer.tsx:1955-1974`](file:///g:/projects/LFLIX/app/components/VideoPlayer.tsx#L1955-L1974)
   - Current Code:
     ```tsx
     <div className="w-full h-1.5 group-hover:h-2.5 bg-white/25 rounded-full overflow-hidden relative transition-all">
       <div className="absolute top-0 bottom-0 left-0 bg-white/40 transition-all duration-200" style={{ width: `${bufferPercent}%` }} />
       <div className="absolute top-0 bottom-0 left-0 bg-red-600" style={{ width: `${progressPercent}%` }} />
     </div>
     <div
       className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 group-hover:w-4.5 group-hover:h-4.5 bg-red-500 border border-white rounded-full shadow-lg transition-transform pointer-events-none"
       style={{ left: `${progressPercent}%` }}
     />
     ```
   - Issue: `transition-all` fights live drag updates during scrubbing. The thumb knob is perpetually visible, adding clutter, rather than scaling up smoothly on hover/scrub.

3. **Static Volume Slider Space Consumption**:
   - Location: [`app/components/VideoPlayer.tsx:2003-2012`](file:///g:/projects/LFLIX/app/components/VideoPlayer.tsx#L2003-L2012)
   - Current Code:
     ```tsx
     <input
       type="range"
       min="0"
       max="1"
       step="0.05"
       value={isMuted ? 0 : volume}
       onChange={(e) => setVolume(parseFloat(e.target.value))}
       className="hidden sm:inline-block w-16 md:w-20 accent-red-600 h-1 cursor-pointer bg-white/20 rounded-lg"
       aria-label="Volume slider"
     />
     ```
   - Issue: Always takes up 80px on desktop; when volume is adjusted via `ArrowUp`/`ArrowDown` keyboard shortcuts, there is zero on-screen HUD feedback.

4. **Missing Tactile Latency Killers (`active:scale-95`)**:
   - Buttons throughout [`VideoPlayer.tsx`](file:///g:/projects/LFLIX/app/components/VideoPlayer.tsx) use standard `hover:bg-white/15` without press-down scale compression. Per Apple Design Principle §1 (*Response — kill latency*), tactile pointer-down compression makes interfaces feel immediately physical and alive.

---

## Target Architecture

1. **Frosted Apple Glass Tokens (`app/globals.css`)**:
   - Introduce `.player-glass-popover` with `backdrop-filter: blur(28px) saturate(180%)`, deep obsidian backing `rgba(15, 15, 20, 0.85)`, and 1px highlight border `rgba(255, 255, 255, 0.1)`.
   - Introduce `.player-hud-pill` with `backdrop-filter: blur(24px) saturate(180%)`, rounded pill geometry (`rounded-full`), and spring entrance.
   - Define custom easing token `--player-spring: cubic-bezier(0.33, 1, 0.68, 1)`.

2. **Expanding Scrubber Bar & Frosted Time Tooltip**:
   - Scrubber track: `h-1 group-hover/progress:h-2 transition-[height] duration-150 rounded-full`.
   - Playhead thumb: `w-4 h-4 bg-red-500 border-2 border-white rounded-full shadow-lg scale-0 group-hover/progress:scale-100 transition-transform duration-150 pointer-events-none`.
   - Tooltip: Floating frosted pill (`.player-hud-pill`) anchored to pointer coordinates `hoverPosition.x`.

3. **Hover-Expanding Volume Slider**:
   - Collapsed to `w-0` by default; expands smoothly to `w-20 sm:w-24` on hover of `.group/vol` container with `transition-all duration-200 ease-out`.

4. **Floating HUD Pill (Volume & Hold-to-2× Speed)**:
   - Dynamic top-center HUD indicator (`top-8 left-1/2 -translate-x-1/2`) showing volume changes (with percentage and volume icon) and speed shifts.
   - Hold-to-2× speed interaction: Holding pointer down on video canvas for >350ms increases playback rate to 2× with visual `2× SPEED` pill; release smoothly restores previous rate.

5. **Anchored Contextual Settings Popover**:
   - Replaces the full-screen centered modal.
   - Anchored at `bottom-16 right-4 sm:right-6` above the control toolbar.
   - Smooth height transition `transition: height 0.28s var(--player-spring)`.
   - Dismisses cleanly on clicking outside or pressing `Escape`.

6. **Accessibility**:
   - `@media (prefers-reduced-motion: reduce)` replaces scale springs with static opacity crossfades.

---

## Step-by-Step Implementation

### Step 1: Add Glass & Spring Utilities in `app/globals.css`

Add the following player utilities to [`app/globals.css`](file:///g:/projects/LFLIX/app/globals.css):

```css
/* ==========================================================================
   Player Glassmorphism & Apple Fluid Motion Tokens
   ========================================================================== */
:root {
  --player-spring: cubic-bezier(0.33, 1, 0.68, 1);
}

.player-glass-popover {
  background: rgba(15, 15, 20, 0.85);
  backdrop-filter: blur(28px) saturate(180%);
  -webkit-backdrop-filter: blur(28px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 1.25rem;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05) inset;
}

.player-hud-pill {
  background: rgba(12, 12, 18, 0.72);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
}

@media (prefers-reduced-motion: reduce) {
  .player-glass-popover,
  .player-hud-pill {
    transition: opacity 150ms ease !important;
    transform: none !important;
  }
}
```

---

### Step 2: Add HUD Notification State & Hold-to-2x Gesture in `app/components/VideoPlayer.tsx`

In [`app/components/VideoPlayer.tsx`](file:///g:/projects/LFLIX/app/components/VideoPlayer.tsx):

1. Add HUD state and hold timer ref:
   ```tsx
   // Floating HUD Notification State
   const [hudNotification, setHudNotification] = useState<{
     id: number;
     text: string;
     icon: React.ReactNode;
   } | null>(null);
   const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

   const showHud = useCallback((text: string, icon: React.ReactNode) => {
     if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
     setHudNotification({ id: Date.now(), text, icon });
     hudTimeoutRef.current = setTimeout(() => {
       setHudNotification(null);
     }, 1400);
   }, []);
   ```

2. Add Hold-to-2× playback speed state & handlers:
   ```tsx
   const [isHoldingSpeed, setIsHoldingSpeed] = useState(false);
   const speedHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
   const previousSpeedRef = useRef<number>(1);

   const handlePointerDownCanvas = (e: React.PointerEvent) => {
     if (e.button !== 0) return;
     // Ignore clicks on control overlays
     if ((e.target as HTMLElement).closest('.player-controls-layer')) return;

     previousSpeedRef.current = playbackRate;
     speedHoldTimerRef.current = setTimeout(() => {
       setIsHoldingSpeed(true);
       if (videoRef.current) {
         videoRef.current.playbackRate = 2;
         showHud('2× Speed', <Gauge className="w-4 h-4 text-amber-400" />);
       }
     }, 350);
   };

   const handlePointerUpCanvas = () => {
     if (speedHoldTimerRef.current) {
       clearTimeout(speedHoldTimerRef.current);
       speedHoldTimerRef.current = null;
     }
     if (isHoldingSpeed) {
       setIsHoldingSpeed(false);
       if (videoRef.current) {
         videoRef.current.playbackRate = previousSpeedRef.current;
         showHud(`${previousSpeedRef.current}× Speed`, <Gauge className="w-4 h-4 text-white" />);
       }
     }
   };
   ```

3. Update keyboard volume handlers in `handleKeyDown` to invoke `showHud`:
   ```tsx
   case 'ArrowUp':
     e.preventDefault();
     const nextVolUp = Math.min(1, Math.round((volume + 0.05) * 100) / 100);
     setVolume(nextVolUp);
     showHud(`${Math.round(nextVolUp * 100)}%`, <Volume2 className="w-4 h-4 text-white" />);
     break;
   case 'ArrowDown':
     e.preventDefault();
     const nextVolDown = Math.max(0, Math.round((volume - 0.05) * 100) / 100);
     setVolume(nextVolDown);
     showHud(nextVolDown === 0 ? 'Muted' : `${Math.round(nextVolDown * 100)}%`, nextVolDown === 0 ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume1 className="w-4 h-4 text-white" />);
     break;
   case 'm':
   case 'M':
     e.preventDefault();
     toggleMute();
     showHud(isMuted ? 'Unmuted' : 'Muted', isMuted ? <Volume2 className="w-4 h-4 text-white" /> : <VolumeX className="w-4 h-4 text-red-400" />);
     break;
   ```

---

### Step 3: Upgrade the Scrubber Bar & Frosted Time Tooltip

Replace lines 1935–1974 in [`app/components/VideoPlayer.tsx`](file:///g:/projects/LFLIX/app/components/VideoPlayer.tsx#L1935-L1974) with the expanding scrubber and frosted floating tooltip:

```tsx
{/* ── Timeline Track & Time Scrubber ── */}
<div
  ref={timelineRef}
  onPointerDown={handleTimelinePointerDown}
  onPointerMove={handleTimelinePointerMove}
  onPointerLeave={() => setHoverPosition(null)}
  className="group/progress w-full h-8 flex items-center relative cursor-pointer touch-none select-none py-2"
  role="slider"
  aria-label="Seek time"
  aria-valuemin={0}
  aria-valuemax={duration || 100}
  aria-valuenow={currentTime}
>
  {/* Floating Frosted Time Tooltip */}
  {hoverPosition && (
    <div
      className="absolute -top-9 -translate-x-1/2 player-hud-pill px-3 py-1 rounded-full text-xs text-white pointer-events-none whitespace-nowrap shadow-xl font-mono font-medium tracking-wide z-40 transition-transform duration-75"
      style={{ left: `${hoverPosition.x}px` }}
    >
      {formatTime(hoverPosition.time)}
    </div>
  )}

  {/* Background Track with Dynamic Height Transition */}
  <div className="relative w-full h-1 group-hover/progress:h-2 transition-[height] duration-150 rounded-full bg-white/20 overflow-hidden">
    {/* Buffer Lead Bar */}
    <div
      className="absolute top-0 bottom-0 left-0 bg-white/35 rounded-full transition-[width] duration-200"
      style={{ width: `${bufferPercent}%` }}
    />
    {/* Progress Fill Bar */}
    <div
      className="absolute top-0 bottom-0 left-0 bg-red-600 rounded-full"
      style={{ width: `${progressPercent}%` }}
    />
  </div>

  {/* Playhead Knob Thumb */}
  <div
    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 border-2 border-white rounded-full shadow-lg scale-0 group-hover/progress:scale-100 transition-transform duration-150 ease-out pointer-events-none z-30"
    style={{ left: `${progressPercent}%` }}
  />
</div>
```

---

### Step 4: Upgrade Volume Slider to Hover-Expanding Track

Replace the volume block at lines 1989–2014 in [`app/components/VideoPlayer.tsx`](file:///g:/projects/LFLIX/app/components/VideoPlayer.tsx#L1989-L2014) with:

```tsx
{/* Hover-Expanding Volume Control */}
<div className="flex items-center group/vol relative">
  <button
    onClick={toggleMute}
    aria-label={isMuted ? 'Unmute' : 'Mute'}
    className="p-1.5 hover:bg-white/15 active:scale-95 rounded-lg transition-transform duration-100"
  >
    {isMuted || volume === 0 ? (
      <VolumeX className="w-5 h-5 text-red-400" />
    ) : volume < 0.5 ? (
      <Volume1 className="w-5 h-5" />
    ) : (
      <Volume2 className="w-5 h-5" />
    )}
  </button>
  <div className="w-0 group-hover/vol:w-20 sm:group-hover/vol:w-24 overflow-hidden transition-all duration-250 ease-out flex items-center h-8 -ml-1 pl-1">
    <input
      type="range"
      min="0"
      max="1"
      step="0.05"
      value={isMuted ? 0 : volume}
      onChange={(e) => {
        const val = parseFloat(e.target.value);
        setVolume(val);
        showHud(`${Math.round(val * 100)}%`, <Volume2 className="w-4 h-4 text-white" />);
      }}
      className="w-16 sm:w-20 accent-red-600 h-1 cursor-pointer bg-white/25 rounded-lg"
      aria-label="Volume slider"
    />
  </div>
</div>
```

---

### Step 5: Replace Fullscreen Modal with Anchored Settings Popover

Replace lines 2063–2360 in [`app/components/VideoPlayer.tsx`](file:///g:/projects/LFLIX/app/components/VideoPlayer.tsx#L2063-L2360) with the contextual popover:

```tsx
{/* ── Contextual Frosted Settings Popover ── */}
{showSettingsModal && (
  <>
    {/* Click-outside dismissal backdrop */}
    <div
      className="fixed inset-0 z-40 bg-black/20"
      onClick={() => setShowSettingsModal(false)}
    />
    <div
      role="dialog"
      aria-label="Playback Settings"
      className="absolute bottom-16 right-4 sm:right-6 w-80 sm:w-96 player-glass-popover z-50 overflow-hidden flex flex-col max-h-[75vh] animate-fadeIn"
      style={{ transition: 'height 0.28s var(--player-spring)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Popover Header */}
      <div className="flex items-center justify-between p-3.5 border-b border-white/10 bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-red-500" />
          <h3 className="font-semibold text-white text-sm">Playback Settings</h3>
        </div>
        <button
          onClick={() => setShowSettingsModal(false)}
          className="p-1 hover:bg-white/10 active:scale-95 rounded-full text-neutral-400 hover:text-white transition"
          aria-label="Close settings"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 bg-white/[0.02] overflow-x-auto no-scrollbar">
        {(['audio', 'subtitles', 'quality', 'speed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveSettingsTab(tab)}
            className={`flex-1 min-w-[65px] py-2 px-2.5 text-xs font-medium border-b-2 transition-all capitalize active:scale-95 ${
              activeSettingsTab === tab
                ? 'border-red-500 text-white font-bold bg-white/[0.08]'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Popover Body Content */}
      <div className="p-3.5 overflow-y-auto max-h-[55vh] space-y-2">
        {/* Render Tab Content cleanly (Audio, Subtitles, Quality, Speed) */}
        {renderTabContent()}
      </div>
    </div>
  </>
)}
```

---

### Step 6: Add Tactile Scale States to All Player Controls

Update buttons in the control toolbar and overlay (Play/Pause, Seek, Settings, Fullscreen, PiP) to add:
```tsx
className="... hover:bg-white/15 active:scale-95 transition-all duration-100"
```
And center Play/Pause overlay:
```tsx
className="... hover:scale-105 active:scale-90 transition-transform duration-150"
```

---

## Verification & Feel-Check

1. **Scrubber Scrubbing Latency**:
   - Scrub rapidly across the timeline using a mouse or touch swipe.
   - Verify the thumb knob follows the pointer without rubber-banding or frame drops.
   - Verify the floating frosted tooltip displays the exact time at the pointer position and disappears cleanly on mouse leave.
2. **Volume Expander & Floating HUD**:
   - Hover over the volume speaker icon. Verify the volume track smoothly expands from `0` to `80px` (`w-20`) in ~200ms.
   - Press `ArrowUp` and `ArrowDown` on the keyboard. Verify the floating top HUD pill appears at top-center with percentage and dismisses after 1.4s.
3. **Hold-to-2× Speed**:
   - Press and hold mouse/touch on the video canvas. Verify that after 350ms the speed switches to 2× with a `2× Speed` top HUD pill.
   - Release the mouse/touch. Verify playback speed smoothly restores to 1×.
4. **Settings Popover Continuity**:
   - Click the gear icon. Verify the settings panel opens directly above the gear icon as a floating frosted glass card, leaving the video visible and playing.
   - Switch between Audio, Subtitles, Quality, and Speed tabs. Verify instant switching without jumping or layout shift.
5. **Vitest Test Suite**:
   - Run `npx vitest run tests/videoPlayerHls.test.tsx tests/playerSetup.test.ts` to ensure 100% of player tests pass.
