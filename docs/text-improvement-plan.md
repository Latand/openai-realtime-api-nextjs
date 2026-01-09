# Text Improvement Mode - Implementation Plan

## Feature Overview

A new keyboard shortcut (Ctrl+Shift+G) that triggers a floating overlay window for AI-powered text improvement. The system reads text from the clipboard, applies the user's preferred writing style, and returns polished text ready to paste back.

### Key Behaviors
- **Trigger**: Global shortcut Ctrl+Shift+G
- **Auto-improve**: Starts processing immediately on window open (using last selected style)
- **Style System**: Multiple improvement styles with persistence of user's last choice
- **Default Style**: "Your Style" - mimics Kostiantyn's writing patterns
- **Model**: GPT-5.2 (non-chat variant)

---

# Part 1: Architecture Overview (Senior Developer)

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         ELECTRON MAIN PROCESS                            │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  Global Shortcut Registration (Ctrl+Shift+G)                        ││
│  │  ↓                                                                   ││
│  │  IPC Channel: "shortcut:toggleTextImprovement"                      ││
│  │  ↓                                                                   ││
│  │  Window Manager: Create/Focus textImprovementWindow                 ││
│  │  ↓                                                                   ││
│  │  IPC Handlers:                                                       ││
│  │    - textImprovement:openWindow                                      ││
│  │    - textImprovement:closeWindow                                     ││
│  │    - textImprovement:updateResult                                    ││
│  │    - textImprovement:getClipboard                                    ││
│  │    - textImprovement:saveStyle                                       ││
│  │    - textImprovement:loadStyle                                       ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ↓                               ↓
┌─────────────────────────────────┐  ┌─────────────────────────────────────┐
│      MAIN WINDOW                │  │      OVERLAY WINDOW                  │
│      (main)/page.tsx            │  │      (overlay)/text-improvement/     │
│                                 │  │                                      │
│  - Listens for shortcut IPC     │  │  - Transparent floating window       │
│  - Triggers window open         │  │  - Auto-reads clipboard on mount     │
│  - Manages improvement state    │  │  - Loads last selected style         │
│  - Calls API endpoint           │  │  - Auto-triggers improvement         │
│                                 │  │  - Displays original + result        │
│                                 │  │  - Style selector dropdown           │
│                                 │  │  - Additional instructions input     │
│                                 │  │  - Copy/Close actions                │
└─────────────────────────────────┘  └─────────────────────────────────────┘
                    │
                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                         NEXT.JS API LAYER                                │
│  ┌─────────────────────────────────────────────────────────────────────┐│
│  │  /api/improve-text/route.ts                                         ││
│  │                                                                      ││
│  │  POST Request Body:                                                  ││
│  │    - originalText: string                                            ││
│  │    - style: "your-style" | "formal" | "casual" | "concise"          ││
│  │    - additionalInstructions?: string                                 ││
│  │                                                                      ││
│  │  Processing:                                                         ││
│  │    1. Load style-specific system prompt                              ││
│  │    2. Inject Kostiantyn's writing examples (for "your-style")       ││
│  │    3. Call OpenAI GPT-5.2 API                                        ││
│  │    4. Return improved text                                           ││
│  │                                                                      ││
│  │  Response:                                                           ││
│  │    - improvedText: string                                            ││
│  │    - tokensUsed?: number                                             ││
│  └─────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Flow Sequence

```
1. User copies text → Clipboard
2. User presses Ctrl+Shift+G
3. Electron main process catches shortcut
4. Main process sends IPC to renderer
5. Main page handler opens overlay window
6. Overlay window mounts:
   a. Reads clipboard via IPC
   b. Loads last selected style from electron-store
   c. Immediately calls /api/improve-text
7. API processes with GPT-5.2
8. Result sent back to overlay
9. User can:
   - Copy result
   - Change style (triggers re-improvement)
   - Add instructions (triggers re-improvement)
   - Close window
```

## Style System Architecture

### Available Styles
| Style ID | Display Name | Description |
|----------|--------------|-------------|
| `your-style` | Your Style | Matches Kostiantyn's writing patterns (DEFAULT) |
| `formal` | Formal | Professional, business-appropriate |
| `casual` | Casual | Relaxed, conversational |
| `concise` | Concise | Shortened, to-the-point |

### Style Persistence
- Store last selected style in Electron's persistent storage
- Load on overlay mount
- Save whenever user changes style
- Key: `textImprovement.lastStyle`

## Window Specifications

| Property | Value |
|----------|-------|
| Initial Width | 500px |
| Initial Height | 350px |
| Min Width | 400px |
| Min Height | 250px |
| Max Height | 80% of screen height |
| Position | Centered horizontally, 50px from top |
| Frame | Frameless |
| Transparency | Yes |
| Always on Top | Yes |
| Resizable | Yes (vertical growth with content) |
| Skip Taskbar | Yes |

## Security Considerations

- Sanitize clipboard content before display
- Rate limit API endpoint (10 requests/minute)
- Validate style parameter against allowed list
- No sensitive data logging
- Timeout for API calls (30 seconds)

## Error Handling Strategy

| Error Type | Handling |
|------------|----------|
| Empty clipboard | Show message, allow manual text input |
| API timeout | Show retry button, preserve original text |
| API error | Display error toast, keep window open |
| Network offline | Graceful message, no crash |
| Invalid style | Fallback to "your-style" |

---

# Part 2: Implementation Tasks (Mid-Level Developer)

## Task 1: API Endpoint Creation

**Location**: `/app/api/improve-text/route.ts`

**Requirements**:
- Create POST handler accepting JSON body with `originalText`, `style`, and optional `additionalInstructions`
- Implement style-to-prompt mapping function
- Build the "your-style" prompt with Kostiantyn's writing examples (provided separately)
- Call OpenAI API with model `gpt-5.2`
- Handle errors with appropriate HTTP status codes
- Add request timeout of 30 seconds
- Return JSON with `improvedText` field

**Style Prompt Guidelines**:
- "your-style": Include 5-7 example messages showing Kostiantyn's patterns (casual, direct, sometimes uses Ukrainian/Russian phrases, technical vocabulary)
- "formal": Professional tone, complete sentences, no contractions
- "casual": Relaxed, contractions allowed, friendly
- "concise": Remove fluff, bullet points where appropriate

**Error Responses**:
- 400: Missing required fields
- 429: Rate limit exceeded
- 500: OpenAI API error
- 504: Timeout

---

## Task 2: Electron IPC Layer

**Files to Modify**:
- `main/index.ts`
- `main/preload.ts`
- `types/electron-window.d.ts`

**Shortcut Registration** (in `main/index.ts`):
- Register `CommandOrControl+Shift+G` using globalShortcut
- Send IPC message `shortcut:toggleTextImprovement` to main window
- Follow existing pattern from Ctrl+Shift+R registration

**Window Management** (in `main/index.ts`):
- Create `textImprovementWindow` variable (similar to `transcriptionWindow`)
- Implement `createTextImprovementWindow()` function
- Add IPC handlers:
  - `textImprovement:openWindow` - Create or focus window
  - `textImprovement:closeWindow` - Close window
  - `textImprovement:saveStyle` - Save to electron-store
  - `textImprovement:loadStyle` - Load from electron-store

**Preload Bridge** (in `main/preload.ts`):
- Expose `window.electron.textImprovement` object with methods:
  - `openWindow()`
  - `closeWindow()`
  - `onOpen(callback)` - Listen for window open events
  - `saveStyle(styleId)`
  - `loadStyle()` - Returns Promise<string>

**TypeScript Definitions**:
- Add `textImprovement` interface to electron window types
- Define callback signatures and return types

---

## Task 3: Main Page Integration

**File**: `/app/(main)/page.tsx`

**Requirements**:
- Add `isTextImprovementActive` state
- Add `useEffect` to register shortcut listener via `window.electron.onToggleTextImprovement`
- Create `handleTextImprovementToggle()` function:
  - Check if other modes are active (warn if voice session running)
  - Call `window.electron.textImprovement.openWindow()`
  - Set state to track active status
- Clean up listener on unmount

**State Management**:
- Track whether improvement is in progress
- Handle window close event to reset state

---

## Task 4: Overlay Page Structure

**Files to Create**:
- `/app/(overlay)/text-improvement/page.tsx`
- `/app/(overlay)/text-improvement/layout.tsx` (optional, can use parent layout)

**Component Structure**:
```
TextImprovementPage
├── Header (draggable, with close button)
├── OriginalTextSection
│   └── Read-only display of clipboard text
├── StyleSelector
│   └── Dropdown with style options
├── AdditionalInstructionsInput
│   └── Optional textarea for extra context
├── ImproveButton (if not auto-improving)
├── ResultSection
│   ├── Loading state with animation
│   └── Improved text display
└── ActionButtons
    ├── Copy
    └── Copy & Close
```

**Lifecycle**:
1. On mount: Read clipboard, load saved style, trigger improvement
2. On style change: Save style, re-trigger improvement
3. On instructions change: Debounce, then re-trigger improvement
4. On close: Clean up, notify main window

---

## Task 5: API Integration in Overlay

**Requirements**:
- Create `useTextImprovement` hook or inline fetch logic
- Handle loading, success, and error states
- Implement retry mechanism for failures
- Show appropriate loading indicators
- Auto-scroll to result when ready

**Request Flow**:
```
1. Gather: originalText, selectedStyle, additionalInstructions
2. Show loading state
3. POST to /api/improve-text
4. On success: Display result, enable copy buttons
5. On error: Show error message, enable retry
```

---

# Part 3: UI Implementation Tasks (Junior Developer)

## Task A: Overlay Layout and Styling

**File**: `/app/(overlay)/text-improvement/page.tsx`

**Visual Requirements**:
- Transparent background for the page
- Dark theme card container with rounded corners (2xl)
- Gradient background similar to transcription overlay
- Glass morphism border effect
- Drop shadow for depth

**Header Section**:
- Status indicator dot (animated pulse when processing)
- Title text: "Text Improvement"
- Close button (X) on the right
- Make header draggable using `-webkit-app-region: drag`

**Color Scheme** (match existing app):
- Background: `from-slate-900 to-slate-800`
- Borders: `slate-600/50`
- Text primary: `slate-100`
- Text secondary: `slate-400`
- Accent for actions: `emerald` or `purple`

---

## Task B: Original Text Display

**Requirements**:
- Section label: "ORIGINAL"
- Read-only text area with scrolling
- Subtle background differentiation
- Max height with overflow scroll
- Placeholder if clipboard was empty: "No text in clipboard"
- Monospace or clean sans-serif font

---

## Task C: Style Selector Component

**Requirements**:
- Dropdown or button group for style selection
- Four options: Your Style, Formal, Casual, Concise
- Visual indication of selected style
- "Your Style" should be marked as default
- Smooth transition when changing

**Styling**:
- Pill-shaped buttons or clean dropdown
- Selected state: filled background
- Unselected state: outline/ghost

---

## Task D: Additional Instructions Input

**Requirements**:
- Label: "Additional instructions (optional)"
- Single-line input or small textarea
- Placeholder: "e.g., Make it shorter, Add emoji, etc."
- Subtle styling, not prominent
- Clear button (X) when has content

---

## Task E: Loading State

**Requirements**:
- Show when API request in progress
- Animated indicator (spinner or pulsing dots)
- Text: "Improving..." or similar
- Skeleton placeholder for result area
- Disable action buttons during loading

---

## Task F: Result Display

**Requirements**:
- Section label: "IMPROVED"
- Scrollable text area
- Same height constraints as original
- Slightly different background to distinguish
- Smooth fade-in animation when result arrives

---

## Task G: Action Buttons

**Requirements**:
- Two buttons at bottom: "Copy" and "Copy & Close"
- Copy: Copies improved text to clipboard, shows toast confirmation
- Copy & Close: Copies and closes overlay window
- Disabled state when no result available
- Visual feedback on click (brief color change)

**Styling**:
- Primary action (Copy & Close): Filled, accent color
- Secondary action (Copy): Ghost/outline style
- Full width or side-by-side layout

---

## Task H: Error States

**Requirements**:
- Error message display with red/warning styling
- Retry button when API fails
- "Try Again" text
- Keep original text visible during error

---

## Task I: Responsive Sizing

**Requirements**:
- Window should grow vertically based on content
- Minimum height to show all sections
- Maximum height constraint (80vh)
- Scroll within sections, not whole window
- Test with short and long text inputs

---

## Task J: Keyboard Shortcuts within Overlay

**Requirements**:
- Escape: Close window
- Ctrl/Cmd + Enter: Copy & Close
- Ctrl/Cmd + C when focused on result: Copy

---

# Appendix: File Checklist

## Files to Create
- [ ] `/app/api/improve-text/route.ts`
- [ ] `/app/(overlay)/text-improvement/page.tsx`
- [ ] `/app/(overlay)/text-improvement/layout.tsx` (optional)
- [ ] `/lib/text-improvement-prompts.ts` (style prompts storage)

## Files to Modify
- [ ] `/main/index.ts` - Shortcut + window management
- [ ] `/main/preload.ts` - IPC bridge
- [ ] `/types/electron-window.d.ts` - Type definitions
- [ ] `/app/(main)/page.tsx` - Shortcut listener

## Dependencies
- No new npm packages required
- Uses existing: OpenAI SDK, electron-store, Tailwind CSS

---

# Notes for Prompt Engineering (Separate Document)

The "your-style" prompt will be configured separately with:
1. Role definition for the AI
2. 5-7 real examples of Kostiantyn's writing
3. Style characteristics to preserve
4. Rules for improvement without losing voice

This prompt content will be provided by the project owner and stored in `/lib/text-improvement-prompts.ts`.
