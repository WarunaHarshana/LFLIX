# Animation Improvement Plans

Prioritized, self-contained implementation plans for UI motion and animation performance, surveyed under the [improve-animations](file:///C:/Users/warun/.gemini/config/skills/improve-animations/SKILL.md) and [apple-design](file:///C:/Users/warun/.gemini/config/skills/apple-design/SKILL.md) guidelines.

## Plans Catalog

| Plan | Title | Severity | Category | Status | Dependencies |
| :---: | :--- | :---: | :---: | :---: | :---: |
| [001](001-optimize-watchlist-animations.md) | Optimize Watchlist Page Animations & Eliminate Rendering Lag | HIGH | Performance, Easing & Physicality | **DONE** | None |
| [002](002-web-player-ui-and-motion-upgrade.md) | Web Player UI, Apple-Style Motion & Cinejoy Adaptations | HIGH | Performance, Easing, Physicality & UI/UX | **DONE** | None |

## Recommended Execution Order

1. **Plan 001**: Execute [001-optimize-watchlist-animations.md](001-optimize-watchlist-animations.md).  
   Eliminates CSS vs. Framer Motion frame fight (`transition-all`), removes main-thread `layout` thrashing, resolves multi-pass `backdrop-filter` GPU fill-rate exhaustion, fixes the search popover height reflow, and tunes hover springs to Apple's critically damped standard.

2. **Plan 002**: Execute [002-web-player-ui-and-motion-upgrade.md](002-web-player-ui-and-motion-upgrade.md).  
   Adapts Cinejoy-proven streaming player architecture and Apple fluid interface principles to `VideoPlayer.tsx`: replaces the blocking full-screen modal with an anchored contextual frosted glass popover, introduces a hover-expanding volume slider, adds top-floating HUD status pills (Volume & Hold-to-2× Speed), refines timeline scrubber tracking with a frosted time tooltip, and adds tactile `active:scale-95` press responses.

## How to Execute

To execute this plan with any agent, run:
```
improve-animations execute plans/002-web-player-ui-and-motion-upgrade.md
```
Or instruct your coding agent to implement the steps detailed in [002-web-player-ui-and-motion-upgrade.md](002-web-player-ui-and-motion-upgrade.md).
