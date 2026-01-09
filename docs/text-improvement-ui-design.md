# Text Improvement Overlay - UI Design Specification

## Design Direction: "Editorial Terminal"

A fusion of **editorial elegance** and **terminal precision**. Clean typography meets technical efficiency. The overlay feels like a refined writing tool that a discerning developer would appreciate—not generic AI slop, but a crafted instrument.

### Design Philosophy
- **Editorial**: Thoughtful typography, generous whitespace, content-first hierarchy
- **Terminal**: Monospace accents, keyboard-driven, status indicators, command-like efficiency
- **Personal**: Warm accent color, subtle personality, feels like YOUR tool

---

## Color Palette

### Primary Colors
```
--bg-deep:        #0a0f14          /* Almost black with blue undertone */
--bg-surface:     #111820          /* Card background */
--bg-elevated:    #1a222d          /* Input fields, sections */
--bg-hover:       #232d3b          /* Hover states */
```

### Text Colors
```
--text-primary:   #e8eaed          /* Main content */
--text-secondary: #8b939e          /* Labels, hints */
--text-muted:     #4a5568          /* Disabled, placeholders */
```

### Accent Colors
```
--accent-primary: #f59e0b          /* Amber/Gold - warm, personal */
--accent-glow:    rgba(245, 158, 11, 0.15)  /* Subtle glow effect */
--accent-success: #10b981          /* Emerald for success states */
--accent-error:   #ef4444          /* Red for errors */
```

### Special Effects
```
--border-subtle:  rgba(255, 255, 255, 0.06)
--border-accent:  rgba(245, 158, 11, 0.3)
--shadow-deep:    0 25px 50px -12px rgba(0, 0, 0, 0.7)
--noise-opacity:  0.02             /* Subtle grain texture */
```

---

## Typography

### Font Stack
```css
--font-display: 'Instrument Serif', Georgia, serif;
--font-body: 'Geist', -apple-system, sans-serif;
--font-mono: 'Geist Mono', 'SF Mono', monospace;
```

### Type Scale
| Element | Font | Size | Weight | Tracking |
|---------|------|------|--------|----------|
| Window Title | Instrument Serif | 18px | 400 | -0.02em |
| Section Labels | Geist Mono | 10px | 500 | 0.1em (uppercase) |
| Body Text | Geist | 14px | 400 | 0 |
| Input Text | Geist | 14px | 400 | 0 |
| Button Text | Geist | 13px | 500 | 0.02em |
| Status Text | Geist Mono | 11px | 400 | 0.05em |

### Font Loading
```html
<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif&display=swap" rel="stylesheet">
```
Note: Geist is already in the project.

---

## Layout Structure

### Window Dimensions
```
Width:  520px (fixed)
Height: 400px initial, max 600px (grows with content)
Position: Center-X, 60px from top
```

### Visual Wireframe
```
┌─────────────────────────────────────────────────────────────┐
│░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│ ← Noise texture overlay
│  ┌───────────────────────────────────────────────────────┐  │
│  │                                                       │  │
│  │  ◉ Improving...              Text Improvement    ✕   │  │ ← Header (draggable)
│  │                                                       │  │
│  ├───────────────────────────────────────────────────────┤  │
│  │                                                       │  │
│  │  ORIGINAL ─────────────────────────────────────────   │  │ ← Section label (mono)
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │                                                 │  │  │
│  │  │  The quick brown fox jumps over the lazy dog   │  │  │ ← Original text
│  │  │  and runs away into the forest...              │  │  │
│  │  │                                                 │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                       │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │  │
│  │  │Your Style│ │  Formal  │ │  Casual  │ │ Concise  │  │  │ ← Style pills
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │  │
│  │                                                       │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │ + Add instructions...                           │  │  │ ← Collapsed input
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                       │  │
│  │  IMPROVED ────────────────────────────────────────    │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │                                                 │  │  │
│  │  │  ████████████████████████████                   │  │  │ ← Loading skeleton
│  │  │  ████████████████                               │  │  │    OR improved text
│  │  │                                                 │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  │                                                       │  │
│  │  ┌─────────────────────┐  ┌────────────────────────┐  │  │
│  │  │       Copy          │  │    Copy & Close   ◉    │  │  │ ← Action buttons
│  │  └─────────────────────┘  └────────────────────────┘  │  │
│  │                                                       │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Header Bar

```
Height: 48px
Background: transparent (inherits card gradient)
Padding: 0 20px
```

**Left Side - Status Indicator:**
```css
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-primary);

  /* Pulse animation when processing */
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}
```

**Center - Title:**
```css
.title {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--text-primary);
  letter-spacing: -0.02em;
}
```

**Right Side - Close Button:**
```css
.close-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  transition: all 0.15s ease;
}

.close-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
```

---

### 2. Section Labels

Distinctive monospace labels with decorative line:

```css
.section-label {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.section-label span {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.section-label::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, var(--border-subtle) 0%, transparent 100%);
}
```

---

### 3. Text Display Areas

**Original Text Box:**
```css
.text-box {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 14px 16px;
  min-height: 80px;
  max-height: 120px;
  overflow-y: auto;

  font-family: var(--font-body);
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-primary);
}

/* Custom scrollbar */
.text-box::-webkit-scrollbar {
  width: 6px;
}

.text-box::-webkit-scrollbar-track {
  background: transparent;
}

.text-box::-webkit-scrollbar-thumb {
  background: var(--border-subtle);
  border-radius: 3px;
}
```

**Improved Text Box (with accent border when filled):**
```css
.text-box--improved {
  border: 1px solid var(--border-accent);
  box-shadow: inset 0 0 20px var(--accent-glow);
}
```

---

### 4. Style Selector Pills

Horizontal button group with smooth selection:

```css
.style-pills {
  display: flex;
  gap: 8px;
  padding: 4px;
  background: var(--bg-elevated);
  border-radius: 12px;
  border: 1px solid var(--border-subtle);
}

.style-pill {
  flex: 1;
  padding: 10px 16px;
  border-radius: 8px;
  border: none;
  background: transparent;

  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);

  cursor: pointer;
  transition: all 0.2s ease;
}

.style-pill:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}

.style-pill--active {
  color: var(--bg-deep);
  background: var(--accent-primary);
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3);
}
```

---

### 5. Additional Instructions Input

Expandable input that grows on focus:

```css
.instructions-input {
  width: 100%;
  padding: 12px 16px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;

  font-family: var(--font-body);
  font-size: 14px;
  color: var(--text-primary);

  transition: all 0.2s ease;
}

.instructions-input::placeholder {
  color: var(--text-muted);
}

.instructions-input:focus {
  outline: none;
  border-color: var(--border-accent);
  box-shadow: 0 0 0 3px var(--accent-glow);
}
```

**Collapsed State (before first focus):**
```css
.instructions-collapsed {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  color: var(--text-muted);
  cursor: pointer;
}

.instructions-collapsed:hover {
  color: var(--text-secondary);
  border-color: var(--border-accent);
}
```

---

### 6. Loading State

Elegant skeleton with shimmer effect:

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-elevated) 0%,
    var(--bg-hover) 50%,
    var(--bg-elevated) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 6px;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.skeleton-line {
  height: 14px;
  margin-bottom: 10px;
}

.skeleton-line:nth-child(1) { width: 100%; }
.skeleton-line:nth-child(2) { width: 85%; }
.skeleton-line:nth-child(3) { width: 65%; }
```

**Processing Status Text:**
```css
.processing-status {
  display: flex;
  align-items: center;
  gap: 8px;

  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.05em;
  color: var(--accent-primary);
}
```

---

### 7. Action Buttons

Two-button layout with primary emphasis on "Copy & Close":

```css
.action-buttons {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.btn {
  flex: 1;
  padding: 14px 20px;
  border-radius: 10px;
  border: none;

  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.02em;

  cursor: pointer;
  transition: all 0.2s ease;
}

/* Secondary button */
.btn--secondary {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}

.btn--secondary:hover {
  background: var(--bg-hover);
  border-color: var(--text-muted);
}

/* Primary button */
.btn--primary {
  background: var(--accent-primary);
  color: var(--bg-deep);
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.25);
}

.btn--primary:hover {
  background: #fbbf24; /* Slightly lighter amber */
  box-shadow: 0 6px 16px rgba(245, 158, 11, 0.35);
  transform: translateY(-1px);
}

/* Disabled state */
.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none;
}
```

---

### 8. Container Card

Main card with gradient and texture:

```css
.card {
  position: relative;
  width: 100%;
  height: 100%;

  background: linear-gradient(
    135deg,
    var(--bg-surface) 0%,
    var(--bg-deep) 100%
  );

  border: 1px solid var(--border-subtle);
  border-radius: 20px;

  box-shadow: var(--shadow-deep);
  overflow: hidden;
}

/* Noise texture overlay */
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: var(--noise-opacity);
  pointer-events: none;
}

/* Subtle top gradient line */
.card::after {
  content: '';
  position: absolute;
  top: 0;
  left: 20px;
  right: 20px;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--accent-primary) 50%,
    transparent 100%
  );
  opacity: 0.3;
}
```

---

## Micro-Interactions & Animations

### 1. Window Appear Animation
```css
@keyframes windowEnter {
  0% {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  100% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.card {
  animation: windowEnter 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
```

### 2. Result Text Reveal
```css
@keyframes textReveal {
  0% {
    opacity: 0;
    transform: translateY(8px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

.improved-text {
  animation: textReveal 0.4s ease-out;
}
```

### 3. Style Pill Selection
```css
.style-pill--active {
  animation: pillSelect 0.2s ease-out;
}

@keyframes pillSelect {
  0% { transform: scale(0.95); }
  50% { transform: scale(1.02); }
  100% { transform: scale(1); }
}
```

### 4. Copy Success Feedback
```css
@keyframes copyFlash {
  0% { background: var(--accent-success); }
  100% { background: var(--accent-primary); }
}

.btn--copied {
  animation: copyFlash 0.4s ease-out;
}
```

---

## Responsive Behavior

### Content-Based Height
```css
.card {
  min-height: 350px;
  max-height: min(600px, 80vh);
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: 0 20px 20px;
}
```

### Text Overflow Handling
- Original text: max 3 lines visible, scroll for more
- Improved text: max 5 lines visible, scroll for more
- Both expand on hover/focus to show more

---

## Keyboard Shortcuts Visual Hints

Small hints in footer or on hover:

```css
.keyboard-hint {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-muted);

  padding: 2px 6px;
  background: var(--bg-elevated);
  border-radius: 4px;
  border: 1px solid var(--border-subtle);
}
```

Display: `⌘↵ Copy & Close` | `Esc Close`

---

## Error State Design

```css
.error-state {
  padding: 16px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 12px;

  color: #fca5a5;
  font-size: 13px;
}

.error-state .retry-btn {
  margin-top: 12px;
  padding: 8px 16px;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  border-radius: 8px;
}
```

---

## Complete Visual Mockup (Final State)

```
╭─────────────────────────────────────────────────────────────────╮
│                                                                 │
│  ◉  Improved                    Text Improvement            ✕   │
│                                                                 │
│─────────────────────────────────────────────────────────────────│
│                                                                 │
│  ORIGINAL ──────────────────────────────────────────────────    │
│  ╭───────────────────────────────────────────────────────────╮  │
│  │ So yeah I was thinking we should probably look into      │  │
│  │ that issue with the API, seems like it's causing some    │  │
│  │ problems for users...                                     │  │
│  ╰───────────────────────────────────────────────────────────╯  │
│                                                                 │
│  ╭────────────╮╭────────────╮╭────────────╮╭────────────╮       │
│  │ Your Style ││   Formal   ││   Casual   ││  Concise   │       │
│  │    ████    ││            ││            ││            │       │
│  ╰────────────╯╰────────────╯╰────────────╯╰────────────╯       │
│                                                                 │
│  ╭───────────────────────────────────────────────────────────╮  │
│  │ + Make it sound more confident                            │  │
│  ╰───────────────────────────────────────────────────────────╯  │
│                                                                 │
│  IMPROVED ───────────────────────────────────────────────────   │
│  ╭───────────────────────────────────────────────────────────╮  │
│  │ Yeah, we need to dig into that API issue — it's def      │  │
│  │ causing headaches for users. Let's prioritize fixing     │  │
│  │ it this sprint.                                           │  │
│  ╰───────────────────────────────────────────────────────────╯  │
│                                                                 │
│  ╭─────────────────────────╮  ╭─────────────────────────────╮   │
│  │         Copy            │  │      Copy & Close     ◉     │   │
│  ╰─────────────────────────╯  ╰─────────────────────────────╯   │
│                                                                 │
│                           ⌘↵ Copy & Close  ·  Esc Close         │
│                                                                 │
╰─────────────────────────────────────────────────────────────────╯
```

---

## Implementation Notes

### CSS Variables Setup
Add to `globals.css` or create `text-improvement.css`:
```css
:root {
  /* All CSS variables listed above */
}
```

### Font Loading
Ensure Instrument Serif is loaded in the overlay layout.

### Animation Library
Use CSS animations for simplicity (no external deps needed).

### Tailwind Integration
These custom styles can coexist with Tailwind. Use `@layer components` for custom classes or inline styles for one-off uses.

---

## Summary: What Makes This Design Distinctive

1. **Editorial serif title** - Instrument Serif adds sophistication
2. **Monospace section labels** - Technical precision
3. **Warm amber accent** - Personal, not corporate blue
4. **Noise texture overlay** - Subtle depth and character
5. **Accent glow on improved text** - Celebrates the result
6. **Pill-style selector** - Modern, tactile feel
7. **Smooth animations** - Polished, intentional motion
8. **Keyboard hints** - Respects power users
9. **Deep dark theme** - Easy on eyes, feels premium
10. **Generous spacing** - Breathes, not cramped

This is NOT generic AI UI. It's a crafted tool that feels personal and intentional.
