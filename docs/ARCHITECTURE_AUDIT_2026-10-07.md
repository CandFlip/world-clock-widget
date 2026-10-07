# Architecture and system-impact audit — 2026-10-07

Scope: Windows source and local installation through v1.1.133, plus macOS and Android source review. This is a source and local Windows audit, not a certification of untested hardware or store acceptance.

## Product invariants

- Existing shortcut choices, including plain keys and Mouse 4/5, must continue to work.
- An already running widget must open promptly from its shortcut or tray icon.
- Quick reminders, exact reminders, sound, repeat, snooze, city-specific time zones, meeting search, sync, and settings must retain their behavior.
- The app must not change unrelated startup entries, services, shell settings, or user data during installation.

## Findings

| Priority | Finding and evidence | Decision |
| --- | --- | --- |
| High | Windows and macOS initially ran a one-second UI tick while the panel was hidden. Windows: `native/webview_host.cpp` `kTickTimer`; macOS: `startTickTimer`; shared JS: `nativeTick`. | v1.1.132 skipped hidden visual DOM updates. v1.1.133 additionally schedules the next Windows hidden check for the nearest pending reminder, capped at 60 seconds, and checks immediately on resume, clock change and show. A live hidden-alarm test passed. macOS retains its existing one-second tick until a Mac build and device test are available. |
| High | Windows saved configuration by deleting the old destination if the first rename failed. `writeUtf8Atomic` could lose settings on a second failure. | Replace using `MoveFileExW` without deleting the destination. Implemented in v1.1.132. |
| Medium | UI initialization sends `setStartup` every time. The host previously rewrote its Run value and removed its old shortcut even if the setting was already correct. | Read the exact current value and skip all writes when it already matches. Implemented in v1.1.132. |
| Medium | Windows still creates WebView2 at login and retains its helper processes while hidden, because reminders are checked by shared JS and the UI is kept warm for immediate opening. | Do not unload the web engine until a native reminder coordinator and measured warm-open target are proven. A lazy WebView change alone would regress reminders or opening time. The WebView2 low-memory hint was tried locally and removed from v1.1.133 after an unfavorable single measurement; its effect was not isolated conclusively. |
| Medium | The Windows installer is elevated and uses hidden PowerShell plus `schtasks` during installation/uninstallation. Inno warns that per-user areas are used in administrative mode. | Separate machine installation from per-user startup setup in a later installer refactor; test elevated and standard-user accounts. This is not evidence that CMD windows at login originate from the widget. |
| Medium | Global low-level keyboard and mouse hooks are installed in the Windows host; the mouse hook is also used for outside-click handling while visible. | Preserve all custom shortcuts. Prototype conditional hook registration only with a complete shortcut and capture test matrix. |
| Medium | Android companion holds a WebSocket in a foreground service when paired. The manifest requests exact-alarm, full-screen-intent, wake-lock and foreground-service permissions. | Audit each permission against actual behavior and current Play policies before a Play release. Reduce persistent connectivity only after measuring sync latency and alarm parity. |
| Medium | Windows EXE/installer are unsigned; macOS distribution uses ad-hoc signing. | Signing, notarization and store packaging are separate distribution tasks. Do not describe the current packages as store ready. |
| Low | `version_info.txt` fixed-file tuples were 1.1.130 while text strings and current app were 1.1.131. | Correct all fields together at the next patch version. Implemented in v1.1.132. |

## Measurements and gates

One five-second idle sample of the installed Windows v1.1.131: one widget process, six WebView2 helper processes, about 3.1 MiB widget private memory plus 256.5 MiB helper private memory, and 0.000 widget CPU seconds in the sample. In matched 60-second hidden-window samples on this computer, v1.1.132 used 159.7 MiB WebView2 private memory and 0.188 CPU seconds, with Ctrl+/ opening in 129 ms; v1.1.133 without the WebView2 memory hint used 158.6 MiB and 0.234 CPU seconds, opening in 136 ms. Both had six helper processes. These are single samples, not evidence of a sustained CPU or memory improvement. An earlier v1.1.133 sample with the WebView2 low-memory hint used 316.2 MiB, so that hint was removed. The v1.1.133 isolated integration test confirmed a hidden alarm raised the window and persisted ringing state; test cleanup left no QA process and did not alter user settings or Run values. The local v1.1.132 installer was successfully used for a rollback between measurements.

Before further architectural changes, record warm shortcut-to-visible latency, login impact, idle CPU/wakeups, WebView2 memory, network activity, and reminder delivery in these states: visible, hidden, sleep/wake, reboot, clock change, DST change, network loss, failed update and denied notification permission. Verify repeat/snooze, all shortcut types and both theme/language choices. Proposed engineering targets require agreement and measured baselines; there is no platform-wide “zero resource” standard.

## Next architectural work

1. Extract deterministic time-zone and reminder calculations from DOM code, with a versioned persistent model and tests for DST gaps/overlaps and duplicate delivery.
2. Prove a native/system reminder coordinator on Windows and macOS, including missed events after wake/restart, custom sound, repeat, acknowledgement and snooze. Windows scheduled notifications may be dropped after their five-minute delivery window when the PC is off, so reconciliation is required.
3. Only then evaluate lazy WebView creation or release while hidden. The native process may remain for immediate hotkeys; opening latency is a hard compatibility gate.
4. Audit Android sync-service lifetime and permissions; design an iOS app and WidgetKit experience to platform lifecycle rules rather than assuming desktop parity.
5. Automate scenario tests, package/sign per platform, review privacy and accessibility, then validate on real Windows, macOS and Android devices before any store submission.

Platform references: [WebView2 process model](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model), [Windows background activity](https://learn.microsoft.com/en-us/windows/apps/develop/performance/optimize-background-activity), [Windows scheduled notification window](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/app-notifications/app-notifications-scheduled), [Windows file replacement](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw), [Apple local notifications](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app), [Android alarm scheduling](https://developer.android.com/develop/background-work/services/alarms), [Android foreground-service types](https://developer.android.com/about/versions/14/changes/fgs-types-required), [Apple WidgetKit timelines](https://developer.apple.com/documentation/widgetkit/keeping-a-widget-up-to-date).
