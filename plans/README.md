# Animation Improvement Plans

Prioritized, self-contained implementation plans for UI motion and animation performance, surveyed under the [improve-animations](file:///C:/Users/warun/.gemini/config/skills/improve-animations/SKILL.md) and [apple-design](file:///C:/Users/warun/.gemini/config/skills/apple-design/SKILL.md) guidelines.

## Plans Catalog

| Plan | Title | Severity | Category | Status | Dependencies |
| :---: | :--- | :---: | :---: | :---: | :---: |
| [001](001-optimize-watchlist-animations.md) | Optimize Watchlist Page Animations & Eliminate Rendering Lag | HIGH | Performance, Easing & Physicality | **DONE** | None |

## Recommended Execution Order

1. **Plan 001**: Execute [001-optimize-watchlist-animations.md](001-optimize-watchlist-animations.md).  
   Eliminates CSS vs. Framer Motion frame fight (`transition-all`), removes main-thread `layout` thrashing, resolves multi-pass `backdrop-filter` GPU fill-rate exhaustion, fixes the search popover height reflow, and tunes hover springs to Apple's critically damped standard.

## How to Execute

To execute this plan with any agent, run:
```
improve-animations execute plans/001-optimize-watchlist-animations.md
```
Or instruct your coding agent to implement the steps detailed in [001-optimize-watchlist-animations.md](001-optimize-watchlist-animations.md).
