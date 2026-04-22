# Hero Visual Redesign + Underline Fix

**Date:** 2026-04-22  
**Scope:** `landing-hero.tsx`, new `landing-room-visual.tsx`

---

## Problem

1. The wavy underline beneath "room" in the hero headline renders far below the word due to CSS background-image positioning not tracking the text baseline reliably.
2. The hero card (brain model + stat row) doesn't visually communicate the core product concept — understanding how an audience ("the room") will respond to a video before it's posted.

---

## Fix 1 — Underline Position

**File:** `apps/web/src/components/landing-hero.tsx`

Replace the `backgroundImage` / `backgroundRepeat` / `backgroundPosition` style on the `<span>` wrapping "room" with an inline `<svg>` positioned absolutely below the text.

```tsx
<span className="relative inline-block text-primary">
  room
  <svg
    aria-hidden
    className="absolute bottom-[-3px] left-0 w-full"
    height="8"
    viewBox="0 0 100 8"
    preserveAspectRatio="none"
  >
    <path
      d="M0 4 Q12.5 0 25 4 Q37.5 8 50 4 Q62.5 0 75 4 Q87.5 8 100 4"
      fill="none"
      stroke="#35b85f"
      strokeWidth="2.5"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
</span>
```

- `bottom-[-3px]` places the SVG 3px below the text baseline — snug, not floating
- `preserveAspectRatio="none"` stretches the path to match any word width
- `vectorEffect="non-scaling-stroke"` keeps stroke weight at 2.5px regardless of scale
- Remove the `paddingBottom: "12px"` that was creating the gap

---

## Fix 2 — Hero Visual: Audience Personas Panel

**New file:** `apps/web/src/components/landing-room-visual.tsx`

A dark card showing 4 audience personas with signal scores — directly representing "reading the room" (how different audience types would respond to a piece of content). Uses the existing cartoon design system (`surface`, `surface-soft`, `sticker`, `sticker-green`).

### Structure

```
┌─────────────────────────────────────────────┐  ← surface card
│ [sticker: Read the room]  [●sticker: 4 readers]
│                                             │
│ ┌─────────────────────────────────────────┐ │  ← surface-soft row
│ │ CM  Creator Mom          ████████░  92% │ │
│ │     Content creator · 34              │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ GZ  Gen Z Gamer          ██████░░   71% │ │
│ │     Gamer · 22                        │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ FP  Fitness Pro          ███████░   84% │ │
│ │     Health & wellness · 28            │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ BM  Brand Manager        █████░░░   68% │ │
│ │     Marketing · 38                    │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Avg signal strength ──────────────────  79% │  ← summary bar
└─────────────────────────────────────────────┘
```

### Persona data (static)

| Initials | Name | Role | Avatar color | Score |
|---|---|---|---|---|
| CM | Creator Mom | Content creator · 34 | `#86d89e` | 92% |
| GZ | Gen Z Gamer | Gamer · 22 | `#35b85f` | 71% |
| FP | Fitness Pro | Health & wellness · 28 | `#1e6b38` | 84% |
| BM | Brand Manager | Marketing · 38 | `#2a4e39` | 68% |

### Style rules

- **Avatar circle:** `size-8`, `rounded-full`, `border-2 border-border`, `font-cartoon font-black text-xs`, bg = persona color, text = `var(--shadow-stamp)` (`#050705`)
- **Name:** `text-[0.82rem] font-extrabold text-foreground`
- **Role:** `text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground`
- **Meter track:** `w-16 h-1.5 rounded-full bg-primary/15 overflow-hidden`
- **Meter fill:** `h-full rounded-full bg-primary` at `width: score%`
- **Score:** `text-[0.75rem] font-black text-foreground w-8 text-right`
- **Summary bar:** `rounded-[1.2rem] border-2 border-primary/30 bg-primary/8 px-4 py-2.5 flex items-center justify-between`
- **Summary label:** `text-[0.6rem] font-extrabold uppercase tracking-[0.18em] text-primary/80`
- **Summary value:** `font-cartoon text-[1.1rem] font-black text-primary`

### Changes to `landing-hero.tsx`

- Import `LandingRoomVisual` instead of `LandingBrainModel`
- Replace the hero card body (brain area div + stat row grid) with `<LandingRoomVisual />`
- Keep the outer `surface` wrapper, sticker labels, and pop-in animation intact
- Remove the `LandingBrainModel` import (no longer used in this file)

---

## Files Changed

| File | Action |
|---|---|
| `apps/web/src/components/landing-hero.tsx` | Edit: fix underline span + swap visual |
| `apps/web/src/components/landing-room-visual.tsx` | Create: new audience panel component |
