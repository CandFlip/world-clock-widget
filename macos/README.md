# World Clock Widget for macOS

The macOS MVP uses the same web interface as the Windows application inside a native AppKit/WKWebView host. The build produces one universal DMG for Apple Silicon and Intel Macs running macOS 13 or later.

## MVP installation

This beta is ad-hoc signed because the project does not yet have an Apple Developer Program membership. After copying the app from the DMG to Applications, macOS may block the first launch. Try opening the app once, then go to **System Settings → Privacy & Security → Open Anyway**. This is Apple's documented override for an app from an unidentified developer: https://support.apple.com/102445

Do not disable Gatekeeper and do not run terminal commands to remove quarantine attributes.

## Build

Run `macos/build.sh` on macOS with Xcode command-line tools. GitHub Actions performs the release build on a macOS runner.

When Developer ID credentials become available, replace the ad-hoc signing step with Developer ID signing, notarize the DMG with `notarytool`, and staple the ticket before publication.
