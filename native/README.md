# World Clock Widget Native

Native Win32/C++ implementation released as v1.1.48. It replaces the Python
runtime while preserving the existing configuration and reminder files.

Architecture:

- Win32 windowing and ownership (no bundled UI runtime)
- Microsoft WebView2 for the responsive Figma-derived interface
- `Shell_NotifyIcon` for the tray
- IANA time zones through the system WebView2 Intl implementation
- UTF-16 throughout
- existing per-user JSON settings and reminders remain compatible

Build with `build_webview.ps1`. The portable compiler and WebView2 SDK are kept outside the
repository under `%LOCALAPPDATA%\WorldClockWidgetBuildTools`.
