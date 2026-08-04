#!/bin/bash
set -e

APP_NAME="市场研究驾驶舱"
BUNDLE="$APP_NAME.app"
SRC="MarketCockpit"

echo "=== 构建 $APP_NAME ==="

# 清理
rm -rf "$BUNDLE"

# 编译 Swift
echo "→ 编译 Swift..."
swiftc \
  -target arm64-apple-macos10.15 \
  -O \
  -framework Cocoa \
  -framework WebKit \
  -o "$SRC/MarketCockpit" \
  "$SRC/main.swift"

# 创建 .app 结构
echo "→ 创建 .app bundle..."
mkdir -p "$BUNDLE/Contents/MacOS"
mkdir -p "$BUNDLE/Contents/Resources"

cp "$SRC/MarketCockpit" "$BUNDLE/Contents/MacOS/"
cp "$SRC/Info.plist" "$BUNDLE/Contents/"

# 图标: 从项目图标复制
if [ -f "../public/icons/icon-512.png" ]; then
  mkdir -p "$SRC/AppIcon.iconset"
  sips -z 16 16     ../public/icons/icon-512.png --out "$SRC/AppIcon.iconset/icon_16x16.png"
  sips -z 32 32     ../public/icons/icon-512.png --out "$SRC/AppIcon.iconset/icon_16x16@2x.png"
  sips -z 32 32     ../public/icons/icon-512.png --out "$SRC/AppIcon.iconset/icon_32x32.png"
  sips -z 64 64     ../public/icons/icon-512.png --out "$SRC/AppIcon.iconset/icon_32x32@2x.png"
  sips -z 128 128   ../public/icons/icon-512.png --out "$SRC/AppIcon.iconset/icon_128x128.png"
  sips -z 256 256   ../public/icons/icon-512.png --out "$SRC/AppIcon.iconset/icon_128x128@2x.png"
  sips -z 256 256   ../public/icons/icon-512.png --out "$SRC/AppIcon.iconset/icon_256x256.png"
  sips -z 512 512   ../public/icons/icon-512.png --out "$SRC/AppIcon.iconset/icon_256x256@2x.png"
  iconutil -c icns "$SRC/AppIcon.iconset" -o "$BUNDLE/Contents/Resources/AppIcon.icns"
  rm -rf "$SRC/AppIcon.iconset"
  echo "→ 图标已生成"
fi

# 签名 (开发用 ad-hoc)
codesign --force --deep -s - "$BUNDLE" 2>/dev/null || true

echo "→ 完成: $BUNDLE"
echo ""
echo "使用方式:"
echo "  1. 先启动服务: npm start"
echo "  2. 打开应用: open '$BUNDLE'"
