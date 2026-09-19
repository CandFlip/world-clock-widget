#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${APP_VERSION:-1.1.107}"
BUILD="$ROOT/macos/build"
APP="$BUILD/World Clock Widget.app"
CONTENTS="$APP/Contents"
RELEASE="$ROOT/release"
SDK="$(xcrun --sdk macosx --show-sdk-path)"

rm -rf "$BUILD"
mkdir -p "$CONTENTS/MacOS" "$CONTENTS/Resources/ui" "$RELEASE"

for ARCH in x86_64 arm64; do
  mkdir -p "$BUILD/$ARCH"
  xcrun swiftc -swift-version 5 -O \
    -target "$ARCH-apple-macos13.0" -sdk "$SDK" \
    -framework AppKit -framework WebKit -framework Carbon \
    -framework Security -framework ServiceManagement \
    "$ROOT/macos/WorldClockWidget.swift" \
    -o "$BUILD/$ARCH/WorldClockWidget"
done

lipo -create "$BUILD/x86_64/WorldClockWidget" "$BUILD/arm64/WorldClockWidget" \
  -output "$CONTENTS/MacOS/WorldClockWidget"
cp "$ROOT/macos/Info.plist" "$CONTENTS/Info.plist"
cp -R "$ROOT/native/ui/." "$CONTENTS/Resources/ui/"
cp "$ROOT/assets/fonts/Inter-Variable.ttf" "$CONTENTS/Resources/ui/Inter-Variable.ttf"

ICONSET="$BUILD/AppIcon.iconset"
mkdir -p "$ICONSET"
SOURCE_ICON="$ROOT/assets/icons/world-clock-app.png"
for SIZE in 16 32 128 256 512; do
  sips -z "$SIZE" "$SIZE" "$SOURCE_ICON" --out "$ICONSET/icon_${SIZE}x${SIZE}.png" >/dev/null
  DOUBLE=$((SIZE * 2))
  sips -z "$DOUBLE" "$DOUBLE" "$SOURCE_ICON" --out "$ICONSET/icon_${SIZE}x${SIZE}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o "$CONTENTS/Resources/AppIcon.icns"

codesign --force --deep --options runtime --timestamp=none --sign - "$APP"
codesign --verify --deep --strict --verbose=2 "$APP"
plutil -lint "$CONTENTS/Info.plist"
lipo -info "$CONTENTS/MacOS/WorldClockWidget"

STAGING="$BUILD/dmg"
mkdir -p "$STAGING"
cp -R "$APP" "$STAGING/"
ln -s /Applications "$STAGING/Applications"
DMG="$RELEASE/WorldClockWidget-macOS-v${VERSION}.dmg"
rm -f "$DMG"
hdiutil create -volname "World Clock Widget" -srcfolder "$STAGING" -ov -format UDZO "$DMG"
shasum -a 256 "$DMG"
