# Plan: App Size Optimization

## Problem Statement
Current app sizes are too large for easy distribution:
- AppImage: 343MB
- Mac zip: 541MB
- Unpacked node_modules: 620MB

Target: Reduce to ~100-150MB per platform.

---

## Current Size Breakdown

| Component | Size | Notes |
|-----------|------|-------|
| `@next/swc-*` | 299MB | SWC binaries for ALL platforms |
| `next/` | 130MB | Next.js core |
| `.next/` | 202MB | Build output |
| `@picovoice/` | 33MB | Wake word (optional) |
| `date-fns/` | 33MB | Date library |
| `lucide-react/` | 30MB | Icons |
| Electron | ~150MB | Runtime |

---

## Senior Developer Tasks

### 1. Evaluate Next.js Standalone Output

**Decision needed:** Should we switch to `output: 'standalone'`?

**Pros:**
- Reduces node_modules from 620MB to ~50-80MB
- Only includes actually used dependencies
- Recommended by Next.js for production

**Cons:**
- Requires changes to Electron file loading
- May break dynamic imports if not properly traced
- Needs thorough testing

**Recommendation:** YES, implement standalone mode

### 2. Evaluate asar Re-enablement

**Current state:** `asar: false` (disabled because Next.js had issues)

**Investigation needed:**
- Test with `asar: true` + `asarUnpack` for specific directories
- Identify which files MUST be unpacked:
  - `.node` native modules
  - `@picovoice` (needs file system access)
  - Any dynamically loaded files

**asarUnpack candidates:**
```
asarUnpack:
    - "**/*.node"
    - "**/node_modules/@picovoice/**/*"
    - "**/public/models/**/*"
```

### 3. Architecture Decision: Remove Picovoice?

**If wake word is rarely used:**
- Removing `@picovoice` saves 33MB
- Could be made optional (user installs separately)
- Or loaded dynamically only when enabled

**Decision:** Keep for now, but make it unpackable from asar

### 4. Review Build Pipeline

**Ensure CI/CD builds each platform on native OS:**
- Linux builds on Linux runner
- macOS builds on macOS runner
- Windows builds on Windows runner

This ensures only platform-native SWC binaries are installed.

---

## Middle Developer Tasks

### 1. Implement Next.js Standalone Mode

**Step 1: Update `next.config.js`**
```
Add to config:
    output: 'standalone'

Full pseudocode:
    const nextConfig = {
        reactStrictMode: false,
        eslint: { ignoreDuringBuilds: true },
        output: 'standalone',  // <-- ADD THIS
    }
```

**Step 2: Understand standalone output structure**
```
After `next build`:
    .next/
        standalone/
            node_modules/     <-- Minimal, traced dependencies only
            server.js         <-- Standalone server
            package.json
        static/               <-- Static assets (CSS, JS, images)
```

**Step 3: Update Electron to use standalone**

Current approach loads Next.js programmatically:
```
const nextApp = next({ dev: false, dir: appPath })
```

With standalone, need to:
- Either run the standalone server.js
- Or continue using programmatic approach but with standalone's node_modules

### 2. Update electron-builder.yml

**Replace current files configuration:**

```yaml
# OLD
files:
  - "node_modules/**/*"
  - ".next/**/*"

# NEW
files:
  - "package.json"
  - "dist-electron/**/*"
  - ".next/standalone/**/*"
  - ".next/static/**/*"
  - "public/**/*"
  # Exclude all platform-specific binaries not for current target
```

**Add platform-specific exclusions:**

```yaml
linux:
  files:
    - "!node_modules/@next/swc-darwin-*/**"
    - "!node_modules/@next/swc-win32-*/**"
    - "!node_modules/@next/swc-linux-*-musl/**"

mac:
  files:
    - "!node_modules/@next/swc-linux-*/**"
    - "!node_modules/@next/swc-win32-*/**"

win:
  files:
    - "!node_modules/@next/swc-darwin-*/**"
    - "!node_modules/@next/swc-linux-*/**"
```

**Add global exclusions:**

```yaml
files:
  # ... existing
  - "!**/*.map"
  - "!**/*.d.ts"
  - "!**/node_modules/**/*.md"
  - "!**/node_modules/**/test/**"
  - "!**/node_modules/**/__tests__/**"
  - "!**/node_modules/**/docs/**"
  - "!**/node_modules/**/examples/**"
  - "!**/node_modules/**/.github/**"
```

### 3. Test asar with asarUnpack

**Update electron-builder.yml:**
```yaml
asar: true
asarUnpack:
  - "**/*.node"
  - "**/node_modules/@picovoice/**/*"
  - "**/public/models/**/*"
```

**Testing required:**
- App starts without errors
- Picovoice loads (if enabled)
- All API routes work
- All pages render correctly

### 4. Update Main Process File Paths

**If using standalone mode, paths change:**

```
Current:
    appPath = app.getAppPath()
    nextApp = next({ dev: false, dir: appPath })

With standalone:
    appPath = app.getAppPath()
    standalonePath = path.join(appPath, '.next', 'standalone')
    // Adjust server initialization
```

**For static files:**
```
staticPath = path.join(appPath, '.next', 'static')
// May need to serve static files separately
```

---

## Junior Developer Tasks

### 1. Audit Current Dependencies

**Run analysis:**
```bash
npx depcheck
npx npm-check
```

**Document:**
- Unused dependencies to remove
- Dependencies that could be devDependencies
- Large dependencies with smaller alternatives

### 2. Move Type Packages to devDependencies

**In package.json, move these to devDependencies:**
```
@types/node
@types/react
@types/react-dom
@types/uuid
@types/canvas-confetti
... all @types/* packages
```

### 3. Update Build Scripts

**Add to package.json:**
```json
"scripts": {
    "build": "next build",
    "electron-build": "next build && tsc -p main && electron-builder",
    "electron-build:linux": "npm run electron-build -- --linux",
    "electron-build:mac": "npm run electron-build -- --mac",
    "electron-build:win": "npm run electron-build -- --win"
}
```

### 4. Create Size Analysis Script

**Create `scripts/analyze-size.sh`:**
```bash
#!/bin/bash
echo "=== Build Size Analysis ==="
echo ""
echo "node_modules:"
du -sh node_modules/
echo ""
echo "Top 20 largest packages:"
du -sh node_modules/*/ | sort -hr | head -20
echo ""
echo ".next folder:"
du -sh .next/
echo ""
echo "dist folder:"
du -sh dist/
ls -lh dist/*.AppImage dist/*.zip dist/*.dmg 2>/dev/null
```

### 5. Testing After Optimization

**Test matrix:**
```
| Test | Linux | Mac | Windows |
|------|-------|-----|---------|
| App starts | | | |
| Main window loads | | | |
| Settings page | | | |
| Transcription works | | | |
| Text improvement works | | | |
| Tray icon appears | | | |
| Global shortcuts work | | | |
| API keys save/load | | | |
```

### 6. Document Final Sizes

**Create `docs/BUILD_SIZES.md`:**
```markdown
# Build Sizes

## Before Optimization
- AppImage: 343MB
- Mac DMG: XXX MB
- Windows NSIS: XXX MB

## After Optimization
- AppImage: XXX MB
- Mac DMG: XXX MB
- Windows NSIS: XXX MB

## Optimization Applied
- [x] Next.js standalone mode
- [x] Platform-specific binary exclusion
- [x] asar compression
- [x] File exclusions (maps, docs, tests)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `next.config.js` | Add `output: 'standalone'` |
| `electron-builder.yml` | Complete rewrite with optimizations |
| `package.json` | Move @types to devDependencies, add build scripts |
| `main/index.ts` | Update paths for standalone (if needed) |

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/analyze-size.sh` | Size analysis script |
| `docs/BUILD_SIZES.md` | Document before/after sizes |

---

## Expected Results

| Metric | Before | After | Savings |
|--------|--------|-------|---------|
| node_modules in build | 620MB | ~60MB | 90% |
| AppImage | 343MB | ~100-120MB | 65% |
| Mac zip | 541MB | ~150-180MB | 67% |

---

## Risk Mitigation

### Risk: Standalone mode breaks dynamic imports
**Mitigation:** Test all features thoroughly. Add explicit imports if needed.

### Risk: asar breaks Picovoice
**Mitigation:** Use asarUnpack for Picovoice directory.

### Risk: Missing files in build
**Mitigation:** Test on clean machine (no source code, only built app).

---

## Estimated Effort

| Role | Time |
|------|------|
| Senior | 2 hours (decisions, review) |
| Middle | 4-6 hours (implementation, testing) |
| Junior | 2-3 hours (audit, scripts, documentation) |
| **Total** | **~8-11 hours** |
