#!/bin/bash
echo "=== Build Size Analysis ==="
echo ""
echo "node_modules:"
du -sh node_modules/ 2>/dev/null
echo ""
echo "Top 20 largest packages:"
du -sh node_modules/*/ 2>/dev/null | sort -hr | head -20
echo ""
echo ".next folder:"
du -sh .next/ 2>/dev/null
echo ""
echo "dist folder:"
du -sh dist/ 2>/dev/null
ls -lh dist/*.AppImage dist/*.zip dist/*.dmg 2>/dev/null

