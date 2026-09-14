#!/bin/bash
# art-studio WebUI 启动脚本
# Usage: ./webui.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/skills/art-studio/scripts"

cd "$APP_DIR"

echo "🎨 启动 Art Studio WebUI..."
echo "   地址: http://localhost:5100"
echo ""

python3 app.py
