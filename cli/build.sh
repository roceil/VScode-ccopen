# 只編譯 + 打包                                                      
#./cli/build.sh

# 編譯 + 打包 + 自動安裝到                                                              
# ./cli/build.sh --install  

#!/usr/bin/env bash
set -euo pipefail

# 切換到專案根目錄
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# ── 顏色輸出 ────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}[build]${NC} $*"; }
warn()    { echo -e "${YELLOW}[build]${NC} $*"; }
error()   { echo -e "${RED}[build]${NC} $*" >&2; }

# ── 參數解析 ────────────────────────────────────────────────────────────────
INSTALL=false
for arg in "$@"; do
  case "$arg" in
    --install|-i) INSTALL=true ;;
    --help|-h)
      echo "用法: ./cli/build.sh [選項]"
      echo ""
      echo "選項："
      echo "  --install, -i   打包後自動安裝至 VS Code"
      echo "  --help,    -h   顯示此說明"
      exit 0
      ;;
    *) error "未知參數：$arg"; exit 1 ;;
  esac
done

# ── 步驟 1：清除舊編譯結果 ──────────────────────────────────────────────────
info "清除 out/ ..."
rm -rf out/

# ── 步驟 2：TypeScript 編譯 ─────────────────────────────────────────────────
info "編譯 TypeScript ..."
npx tsc -p ./

# ── 步驟 3：打包 .vsix ──────────────────────────────────────────────────────
info "打包 .vsix ..."
npx @vscode/vsce package --no-dependencies

# 找到剛產生的 .vsix 檔
VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -1)
if [[ -z "$VSIX_FILE" ]]; then
  error "找不到 .vsix 檔案，打包可能失敗。"
  exit 1
fi
info "打包完成：${VSIX_FILE}"

# ── 步驟 4（選用）：安裝至 VS Code ──────────────────────────────────────────
if [[ "$INSTALL" == true ]]; then
  info "安裝 ${VSIX_FILE} 至 VS Code ..."
  if command -v code &>/dev/null; then
    code --install-extension "$VSIX_FILE" --force
    info "安裝完成，請重新載入 VS Code 視窗（Cmd+Shift+P → Reload Window）。"
  else
    warn "找不到 'code' 指令，請手動安裝：Extensions → ⋯ → Install from VSIX"
  fi
fi
