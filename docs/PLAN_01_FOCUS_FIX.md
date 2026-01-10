# Plan: Fix Focus Stealing in Transcription Window

## Problem Statement
When the transcription overlay window appears, it steals focus from the user's current application. User wants to continue typing in their original app while seeing the transcription.

---

## Senior Developer Tasks

### 1. Research & Architecture Decision
- Evaluate Electron's `showInactive()` behavior across platforms (Linux X11, Wayland, macOS, Windows)
- Decide on fallback mechanism for platforms where `showInactive()` doesn't work
- Document platform-specific limitations

### 2. Design Focus Restoration System
- Create abstraction for focus management in `main/platform/` module
- Design interface:
  ```
  interface FocusManager {
    saveFocus(): Promise<string | null>   // Returns window ID
    restoreFocus(id: string): Promise<void>
  }
  ```
- Implement platform-specific implementations:
  - Linux: Use `xdotool getwindowfocus` / `xdotool windowactivate`
  - macOS: Use `osascript` or accept limitation
  - Windows: Use native Windows API or accept `showInactive()` behavior

### 3. Review & Code Review
- Review Middle developer's implementation
- Ensure no race conditions in focus save/restore
- Verify memory leaks (event listeners cleanup)

---

## Middle Developer Tasks

### 1. Modify `createTranscriptionWindow()` in `main/index.ts`

**Changes needed:**
- Add `focusable: false` to BrowserWindow options
- Add `show: false` to BrowserWindow options
- Replace implicit show with `window.showInactive()`
- Call focus save BEFORE creating window
- Call focus restore AFTER window is shown

**Pseudocode:**
```
function createTranscriptionWindow():
    previousFocusId = await platform.saveFocus()

    window = new BrowserWindow({
        ...existingOptions,
        focusable: false,
        show: false
    })

    await window.loadURL(url)
    window.showInactive()

    if previousFocusId:
        setTimeout(() => platform.restoreFocus(previousFocusId), 100)

    return window
```

### 2. Modify `createTextImprovementWindow()` in `main/index.ts`
- Apply same pattern as transcription window
- Text improvement window should also not steal focus

### 3. Update IPC Handler `transcription:openWindow`
- Remove `transcriptionWindow.focus()` call
- Replace with `showInactive()` if window exists but hidden

### 4. Implement Linux Focus Manager in `main/platform/linux.ts`

**Add methods:**
```
saveFocus():
    result = execSync('xdotool getwindowfocus')
    return result.trim()

restoreFocus(windowId):
    execSync('xdotool windowactivate ' + windowId)
```

---

## Junior Developer Tasks

### 1. Add Import for `execFile` in `main/index.ts`
- Import `execFile` from `child_process`
- Verify `promisify` is already imported

### 2. Update Platform Interface in `main/platform/types.ts`
- Add `saveFocus?(): Promise<string | null>`
- Add `restoreFocus?(windowId: string): Promise<void>`

### 3. Add Stub Implementations for Other Platforms
- In `main/platform/darwin.ts`: Return null (no-op)
- In `main/platform/win32.ts`: Return null (no-op)

### 4. Testing
- Test on Linux: Open text editor, trigger transcription, verify cursor stays in editor
- Test window visibility: Ensure transcription window appears correctly
- Test multiple triggers: Rapid shortcut presses should not cause issues

### 5. Add Console Logging
- Log when focus is saved: `[Focus] Saved focus: {windowId}`
- Log when focus is restored: `[Focus] Restored focus: {windowId}`
- Log errors gracefully (xdotool not installed, etc.)

---

## Files to Modify

| File | Changes |
|------|---------|
| `main/index.ts` | Modify window creation functions, add focus management |
| `main/platform/types.ts` | Add focus interface methods |
| `main/platform/linux.ts` | Implement xdotool focus save/restore |
| `main/platform/darwin.ts` | Add stub methods |
| `main/platform/win32.ts` | Add stub methods |

---

## Testing Checklist

- [ ] Linux X11: Focus stays in original app
- [ ] Linux Wayland: Graceful fallback (may not work perfectly)
- [ ] Transcription window appears on top
- [ ] Window content loads correctly
- [ ] Shortcut works multiple times in succession
- [ ] No console errors

---

## Estimated Effort

| Role | Time |
|------|------|
| Senior | 1 hour (review, architecture) |
| Middle | 2-3 hours (implementation) |
| Junior | 1-2 hours (stubs, testing) |
