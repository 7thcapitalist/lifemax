# Lifemaxing design language

Status: proposed, 2026-09-15. Owner: founder.
Consumers: every frontend node of the current objective. Build against **this file**, not against a website, a screenshot, or your own taste. If something here is wrong, say so in your result and stop; do not improvise a second design language alongside it.

---

## 0. Where this came from, and where the borrowing stops

The trigger was [Life Reset](https://apps.apple.com/us/app/life-reset-66-day-habit/id6478942469), a 1.5M-user habit app whose own copy is "turns your real goals into daily quests, XP, and streaks." What it does better than Lifemaxing is not colour. It is **legibility of progress**: a bounded arc, a day number, a streak, and a grid of days you can see yourself moving through.

So what is borrowed is **structure and interaction convention** — a day counter, a streak, a completion grid, a single loud number per screen. Those are common UI vocabulary across every habit and fitness app and belong to nobody.

What is **not** borrowed, and must not be reproduced: their visual identity, their icons, illustrations, wordmark, colour choices, screen compositions, or marketing copy. No node should attempt to match a Life Reset screen. If a builder finds itself asking "what does their version look like", the answer is out of scope.

The palette below is Lifemaxing's own, already in `src/app/globals.css`, kept and extended. Nothing in it is derived from another product.

---

## 1. The palette stays

Lifemaxing already has a coherent, distinctive identity and it is an asset: paper and ink, sage green, aged gold, dusty violet, a serif display face over a humanist sans. A field journal, not a game console. It reads as calm and adult, which is the whole differentiation against the category.

**Do not replace it.** Do not introduce a neon accent, a gradient, a glow, or a dark-first "gamer" treatment. The existing tokens in `:root` are the source of truth for hue.

What the system is actually missing is not colour. It is:

1. three verified contrast defects,
2. a dark scheme (`color-scheme: light` is hardcoded),
3. a type scale (sizes are set ad hoc per component),
4. tokens for the new mechanics (streak, arc day states).

---

## 2. Three contrast defects to fix

Measured against WCAG 2.1 with the current token values. Reproduce with the script in §7.

| Token | Current | Measured | Requirement | Verdict |
|---|---|---|---|---|
| `--gold` `#a67632` | body text and badge label | **3.68:1** on `--paper`, **3.34:1** on `--gold-soft` | 4.5:1 for body text | **fails AA** |
| `--mist` `#d7e3ea` | used as a border | **1.20:1** on `--paper` | 3:1 for a meaningful UI boundary (1.4.11) | **fails** where the border carries meaning |
| `--sky` `#8fb3c4` | 2.06:1 on `--paper` | — | 4.5:1 as text, 3:1 as boundary | **decorative fill only**, never text |

Fixes, verified:

```css
--gold: #7d5722;        /* was #a67632 — now 5.94:1 on paper, 5.39:1 on gold-soft */
--boundary: #728c9c;    /* new — 3.25:1 on paper; use wherever a border means something */
--hairline: #d7e3ea;    /* the old --mist value, renamed for honesty: decoration only */
```

`--mist` keeps its value for backgrounds and fills. The rule is: **a border that separates two interactive regions, outlines an input, or marks a state uses `--boundary`. A border that is pure texture uses `--hairline`.**

`--sky` and `--dawn` remain fills. Neither may carry text or state.

---

## 3. Dark scheme

`:root` declares `color-scheme: light` and there is no dark counterpart, so the app renders wrong on every device set to dark. This is the single most visible modernisation available, and it costs one block.

The metaphor inverts rather than changes: paper becomes night, ink becomes parchment. Sage, gold and violet lift in lightness so they keep their identity against a dark ground.

```css
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --ink: #e6eef3;          /* 14.65:1 on --paper */
    --ink-soft: #b4c6d1;     /*  9.78:1 */
    --ink-mute: #8ba0ad;     /*  6.33:1 */
    --paper: #141c24;
    --paper-raised: #1d2831;
    --mist: #22303a;
    --hairline: #22303a;
    --boundary: #5e7888;     /*  3.70:1 on paper, 3.23:1 on raised */
    --sky: #3c5a6b;
    --dawn: #2c4453;
    --grove: #6fbfa5;        /*  7.92:1 */
    --grove-deep: #a8dcc9;   /* 11.25:1 */
    --grove-soft: #1e3b34;
    --gold: #d9a94e;         /*  7.97:1 */
    --gold-soft: #33280f;
    --violet: #a99ac4;       /*  6.64:1 */
    --violet-soft: #2a2438;
    --warn: #d9a94e;
    --warn-soft: #33280f;
    --danger: #e08a8a;       /*  6.69:1 */
    --focus: #57b9cf;        /*  7.57:1 */
    --shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
  }
}
```

Every colour above is verified at or above 4.5:1 for text roles and 3:1 for boundary roles against both `--paper` and `--paper-raised`. The `:not([data-theme="light"])` guard is there so an explicit light override can win later; do not add a theme toggle in this objective.

The paper texture on `body` (`background-attachment: fixed`) must be re-tuned or dropped under dark; a light paper grain over a dark ground reads as dirt.

---

## 4. Type scale

Sizes are currently set per component. Replace with one scale. The display face (`--font-display`, an old-style serif) carries numbers and headings; the body face carries everything else. This pairing is already the app's signature and stays.

```css
--text-2xs: 0.6875rem;  /* 11px — cell labels, never body copy */
--text-xs:  0.8125rem;  /* 13px — captions, meta */
--text-sm:  0.9375rem;  /* 15px — secondary body */
--text-base:1.0625rem;  /* 17px — body, the iOS reading default */
--text-lg:  1.25rem;    /* 20px — card titles */
--text-xl:  1.5rem;     /* 24px — section headings */
--text-2xl: 2rem;       /* 32px — screen title */
--text-hero:3.25rem;    /* 52px — the one loud number per screen */

--leading-tight: 1.15;  /* display and numerals */
--leading-snug: 1.35;   /* headings */
--leading-body: 1.55;   /* body copy */
```

**One hero per screen.** Today's hero is the day number. Character's hero is the level. The momentum view's hero is the streak. No screen gets two. This is the rule that makes progress legible, and it is the actual lesson worth taking from the category.

Minimum body size is `--text-base`. Nothing below `--text-xs` may carry meaning that is not also available elsewhere.

---

## 5. Tokens for the new mechanics

```css
/* arc day states — light */
--day-done: #2f6b5c;     /* = --grove;      5.73:1 on paper */
--day-rest: #5c8ba1;     /* deliberate rest; 3.42:1 on paper */
--day-broken: #91806f;   /* unaccounted;     3.50:1 on paper — muted, NOT --danger */
--day-future: transparent;  /* outlined with --boundary, never filled */
--day-today: #7d5722;    /* = new --gold; ring only, 5.94:1 */

/* dark counterparts */
--day-done: #6fbfa5;  --day-rest: #5f93ab;  --day-broken: #7d6f62;  --day-today: #d9a94e;
```

**A broken day is not an error.** It uses a muted clay, never `--danger`, never red. The product's position is that a missed day is information, not a failure, and the colour has to say that. This is deliberate and is the point at which Lifemaxing diverges from the category.

Colour is never the only channel. Every day cell carries a distinguishing shape or mark as well: done is filled, rest is filled with a centred dot, broken is a hairline diagonal, future is outline only, today adds a 2px ring. A colour-blind owner must be able to read the grid.

---

## 6. Component specs

### 6.1 Arc header

Sits at the top of Today and of the momentum view, inside `AppShell`.

- Day number at `--text-hero`, `--font-display`, `--ink`. Label "of 66" at `--text-sm`, `--ink-mute`, baseline-aligned.
- Streak to its right: count at `--text-xl`, the word "days" at `--text-xs`. No flame, no fire emoji, no pulsing. If the streak is 0 the block is absent, not shown as zero.
- A 3px arc progress rail spanning the full width beneath, `--day-done` fill on `--mist` track, `--radius-sm` caps.
- Total height at 375px: no more than 132px. It must not push the first mission below the fold.

### 6.2 Momentum grid

- 66 cells, CSS grid, `repeat(auto-fill, minmax(34px, 1fr))`, `--space-2` gap. At 375px with a 16px gutter this lands 8 per row and the whole arc fits in about 9 rows with no horizontal scroll, which is the acceptance criterion.
- Cell: `--radius-sm`, `aspect-ratio: 1`, day number at `--text-2xs` centred, `--ink` on light fills and `--paper` on dark fills.
- Tap target is the cell plus its gap, minimum 44x44 effective. If `minmax` computes below 34px, drop to 6 per row rather than shrinking the target.
- Tapping a past day opens that day's chronicle entry. Tapping a future day does nothing and is not focusable.
- A legend sits beneath, always, naming all five states in words.

### 6.3 Mission card

Unchanged in structure. Only: title moves to `--text-lg`, the XP value moves to `--font-mono` so numbers align down a column, and the card gets `border: 1px solid var(--hairline)` rather than relying on shadow alone, which vanishes under dark.

### 6.4 Motion

`--motion: 220ms` and `--ease` already exist and are correct. Use them. One exception: arc completion may run a single 600ms sequence, once, and never again for that arc. No looping animation anywhere. Everything respects `prefers-reduced-motion: reduce` by dropping to an instant state change.

---

## 7. Verification, required before any frontend node reports success

1. **Contrast.** Run the check below. Every text token must be at or above 4.5:1 against both `--paper` and `--paper-raised`, in both schemes. Every boundary token at or above 3:1. Paste the output into the node's evidence.
2. **375px.** Screenshot Today, Character, Chapter, the momentum view and Chronicle at 375px wide in both schemes. No horizontal scroll on any of them. Screenshots go in the evidence manifest.
3. **Colour independence.** Screenshot the momentum grid with a greyscale filter applied. All five states must remain distinguishable.
4. **Reduced motion.** Confirm every transition is suppressed under `prefers-reduced-motion: reduce`.

```python
# scripts/check-contrast.py — add to the repo, run in CI
def h2r(h): h=h.lstrip('#'); return tuple(int(h[i:i+2],16) for i in (0,2,4))
def lum(rgb):
    f=lambda c:(c/255)/12.92 if c/255<=0.03928 else (((c/255)+0.055)/1.055)**2.4
    r,g,b=[f(c) for c in rgb]; return 0.2126*r+0.7152*g+0.0722*b
def ratio(a,b):
    la,lb=lum(h2r(a)),lum(h2r(b)); hi,lo=max(la,lb),min(la,lb)
    return (hi+0.05)/(lo+0.05)
```

Parse the token values out of `globals.css` rather than hardcoding them, so the check fails when someone edits a colour.

---

## 8. Out of scope

No new font files or webfonts; the stacks in `--font-display` and `--font-body` stay. No icon library. No illustration. No gradient, glow or neon. No theme toggle. No animation library. No mini tools, streak punishment, or notification pressure, per the objective's non-goals.
