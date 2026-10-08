import AppKit
import Carbon
import Darwin
import Security
import ServiceManagement
import WebKit

private let appVersion = "v1.1.136"
private let showNotification = Notification.Name("com.candflip.worldclockwidget.show")

final class WidgetPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class WidgetController: NSObject, NSApplicationDelegate, WKScriptMessageHandler, NSWindowDelegate {
    private var panel: WidgetPanel!
    private var webView: WKWebView!
    private var statusItem: NSStatusItem!
    private var openMenuItem: NSMenuItem!
    private var hotKeyRef: EventHotKeyRef?
    private var hotKeyHandler: EventHandlerRef?
    private var currentModifiers: UInt32 = 1
    private var currentKey: UInt32 = 32
    private var capturingHotKey = false
    private var globalShortcutMouseMonitor: Any?
    private var localShortcutMouseMonitor: Any?
    private var outsideMonitor: Any?
    private var localResizeMonitor: Any?
    private var globalResizeMonitor: Any?
    private var tickTimer: Timer?
    private var selfTestAlarmAt: Int?
    private var resizeEdge: String?
    private var resizeStartFrame = NSRect.zero
    private var resizeStartPoint = NSPoint.zero
    private let selfTestMode = ProcessInfo.processInfo.environment["WORLD_CLOCK_SELF_TEST"] == "1"

    func applicationDidFinishLaunching(_ notification: Notification) {
        if let bundleID = Bundle.main.bundleIdentifier {
            let others = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
                .filter { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }
            if let existing = others.first {
                DistributedNotificationCenter.default().postNotificationName(showNotification, object: nil)
                existing.activate(options: [.activateIgnoringOtherApps])
                NSApp.terminate(nil)
                return
            }
        }

        NSApp.setActivationPolicy(.accessory)
        configureWindow()
        configureStatusItem()
        configureMonitors()
        DistributedNotificationCenter.default().addObserver(
            self,
            selector: #selector(showFromNotification),
            name: showNotification,
            object: nil
        )
        loadHotKeyFromConfig()
        _ = registerHotKey(modifiers: currentModifiers, key: currentKey)
        startTickTimer()
        NotificationCenter.default.addObserver(self, selector: #selector(refreshAfterSystemTimeChange), name: .NSSystemClockDidChange, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(refreshAfterSystemTimeChange), name: .NSSystemTimeZoneDidChange, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(refreshAfterSystemTimeChange), name: NSWorkspace.didWakeNotification, object: nil)
        if selfTestMode {
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.runSelfTest() }
        }
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        showWidget()
        return false
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let hotKeyHandler { RemoveEventHandler(hotKeyHandler) }
        if let outsideMonitor { NSEvent.removeMonitor(outsideMonitor) }
        if let localResizeMonitor { NSEvent.removeMonitor(localResizeMonitor) }
        if let globalResizeMonitor { NSEvent.removeMonitor(globalResizeMonitor) }
        if let globalShortcutMouseMonitor { NSEvent.removeMonitor(globalShortcutMouseMonitor) }
        if let localShortcutMouseMonitor { NSEvent.removeMonitor(localShortcutMouseMonitor) }
        tickTimer?.invalidate()
        NotificationCenter.default.removeObserver(self)
        NSWorkspace.shared.notificationCenter.removeObserver(self)
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: "host")
    }

    private func configureWindow() {
        let savedFrame = UserDefaults.standard.string(forKey: "windowFrame").map(NSRectFromString)
        let frame = savedFrame ?? NSRect(x: 120, y: 180, width: 430, height: 720)
        panel = WidgetPanel(
            contentRect: frame,
            styleMask: [.borderless, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.delegate = self
        panel.title = "World Clock Widget"
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .floating
        panel.minSize = NSSize(width: 360, height: 320)
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]

        let controller = WKUserContentController()
        controller.add(self, name: "host")
        controller.addUserScript(WKUserScript(source: bridgeScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let configuration = WKWebViewConfiguration()
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController = controller
        configuration.websiteDataStore = selfTestMode ? .nonPersistent() : .default()
        webView = WKWebView(frame: panel.contentView!.bounds, configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.setValue(false, forKey: "drawsBackground")
        panel.contentView = webView

        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "ui") else {
            fatalError("Bundled UI is missing")
        }
        webView.loadFileURL(indexURL, allowingReadAccessTo: indexURL.deletingLastPathComponent())
    }

    private var bridgeScript: String {
        """
        (() => {
          const listeners = new Set();
          const webview = {
            postMessage(message) { window.webkit.messageHandlers.host.postMessage(String(message)); },
            addEventListener(type, listener) { if (type === 'message') listeners.add(listener); },
            removeEventListener(type, listener) { if (type === 'message') listeners.delete(listener); }
          };
          Object.defineProperty(window, 'chrome', { value: { webview }, configurable: false });
          window.__worldClockHostMessage = data => listeners.forEach(listener => listener({ data }));
        })();
        """
    }

    private func configureStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "clock.badge", accessibilityDescription: "World Clock Widget")
        statusItem.button?.image?.isTemplate = true
        let menu = NSMenu()
        openMenuItem = NSMenuItem(title: "Открыть", action: #selector(toggleWidget), keyEquivalent: "")
        menu.addItem(openMenuItem)
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Выход", action: #selector(quit), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
        statusItem.menu = menu
        refreshOpenMenuShortcut()
    }

    private func menuKeyEquivalent(for key: UInt32) -> String? {
        if key >= 65 && key <= 90 { return String(UnicodeScalar(Int(key))!).lowercased() }
        if key >= 48 && key <= 57 { return String(UnicodeScalar(Int(key))!) }
        if key >= 112 && key <= 131 && key != 123 {
            return String(UnicodeScalar(0xF704 + Int(key) - 112)!)
        }
        let keys: [UInt32: String] = [
            8: "\u{0008}", 9: "\t", 13: "\r", 27: "\u{001B}", 32: " ",
            37: "\u{F702}", 38: "\u{F700}", 39: "\u{F703}", 40: "\u{F701}",
            46: "\u{007F}", 186: ";", 187: "=", 188: ",", 189: "-",
            190: ".", 191: "/", 192: "`", 219: "[", 220: "\\",
            221: "]", 222: "'"
        ]
        return keys[key]
    }

    private func menuShortcutLabel() -> String {
        var label = ""
        if currentModifiers & 2 != 0 { label += "⌃" }
        if currentModifiers & 1 != 0 { label += "⌥" }
        if currentModifiers & 4 != 0 { label += "⇧" }
        if currentModifiers & 8 != 0 { label += "⌘" }
        let key = currentKey
        if key == 1001 { return label + "Mouse 4" }
        if key == 1002 { return label + "Mouse 5" }
        if key >= 65 && key <= 90 { return label + String(UnicodeScalar(Int(key))!) }
        if key >= 48 && key <= 57 { return label + String(UnicodeScalar(Int(key))!) }
        if key >= 112 && key <= 131 { return label + "F\(key - 111)" }
        if key >= 96 && key <= 105 { return label + "Keypad \(key - 96)" }
        let names: [UInt32: String] = [
            8: "Delete", 9: "Tab", 13: "Return", 27: "Escape", 32: "Space",
            33: "Page Up", 34: "Page Down", 35: "End", 36: "Home",
            37: "←", 38: "↑", 39: "→", 40: "↓", 46: "Forward Delete",
            106: "Keypad *", 107: "Keypad +", 108: "Keypad Enter",
            109: "Keypad −", 110: "Keypad .", 111: "Keypad /",
            186: ";", 187: "=", 188: ",", 189: "−", 190: ".",
            191: "/", 192: "`", 219: "[", 220: "\\", 221: "]", 222: "'"
        ]
        return label + (names[key] ?? "Key \(key)")
    }

    private func refreshOpenMenuShortcut() {
        guard let openMenuItem else { return }
        if let equivalent = menuKeyEquivalent(for: currentKey) {
            var modifiers: NSEvent.ModifierFlags = []
            if currentModifiers & 1 != 0 { modifiers.insert(.option) }
            if currentModifiers & 2 != 0 { modifiers.insert(.control) }
            if currentModifiers & 4 != 0 { modifiers.insert(.shift) }
            if currentModifiers & 8 != 0 { modifiers.insert(.command) }
            openMenuItem.title = "Открыть"
            openMenuItem.keyEquivalentModifierMask = modifiers
            openMenuItem.keyEquivalent = equivalent
        } else {
            openMenuItem.keyEquivalent = ""
            openMenuItem.keyEquivalentModifierMask = []
            openMenuItem.title = "Открыть    \(menuShortcutLabel())"
        }
    }

    private func startTickTimer() {
        resetTickTimer(milliseconds: 1000)
    }

    private func resetTickTimer(milliseconds: Int) {
        tickTimer?.invalidate()
        let interval = TimeInterval(max(1000, min(60000, milliseconds))) / 1000
        let timer = Timer(timeInterval: interval, target: self, selector: #selector(tick), userInfo: nil, repeats: false)
        tickTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    @objc private func tick() {
        let visible = panel.isVisible
        resetTickTimer(milliseconds: visible ? 1000 : 60000)
        webView?.evaluateJavaScript("window.nativeTick && window.nativeTick(\(visible))")
    }

    @objc private func refreshAfterSystemTimeChange() {
        tick()
    }

    private func hideWidget() {
        panel.orderOut(nil)
        resetTickTimer(milliseconds: 60000)
        webView?.evaluateJavaScript("window.nativeTick && window.nativeTick(false)")
    }

    private func runSelfTest(attempt: Int = 1) {
        let script = "(typeof window.nativeTick === 'function' && window.__nativeTickCount >= 2 && window.__worldClockPlatform === 'macos' && !!document.querySelector('#timeSlider') && document.querySelectorAll('[data-timeline-hour]').length === 4 && typeof window.syncRequest === 'function' && typeof window.openAlarmSound === 'function' && !!document.querySelector('#quickToggle') && typeof window.resetTimeline === 'function' && typeof window.findMeetingTimes === 'function') ? 'pass' : 'fail'"
        hideWidget()
        _ = applicationShouldHandleReopen(NSApp, hasVisibleWindows: false)
        let nativeHotKeyMapping = currentModifiers == 1 && virtualKeyCode(for: 32) == UInt32(kVK_Space)
            && openMenuItem.keyEquivalent == " " && openMenuItem.keyEquivalentModifierMask.contains(.option)
            && panel.isVisible
        webView.evaluateJavaScript(script) { result, error in
            let passed = nativeHotKeyMapping && error == nil && result as? String == "pass"
            if passed {
                self.hideWidget()
                self.runHiddenAlarmSelfTest()
                return
            }
            if attempt < 6 {
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in self?.runSelfTest(attempt: attempt + 1) }
            } else {
                let diagnostic = "JSON.stringify({tick:typeof window.nativeTick==='function',count:window.__nativeTickCount,platform:window.__worldClockPlatform,slider:!!document.querySelector('#timeSlider'),hours:document.querySelectorAll('[data-timeline-hour]').length,sync:typeof window.syncRequest,sound:typeof window.openAlarmSound,quick:!!document.querySelector('#quickToggle'),reset:typeof window.resetTimeline,meeting:typeof window.findMeetingTimes})"
                self.webView.evaluateJavaScript(diagnostic) { details, diagnosticError in
                    fputs("macOS runtime tick test failed: hotkey=\(nativeHotKeyMapping), result=\(String(describing: result)), error=\(String(describing: error)), details=\(String(describing: details)), detailError=\(String(describing: diagnosticError))\n", stderr)
                    self.finishSelfTest(code: 3)
                }
            }
        }
    }

    private func runHiddenAlarmSelfTest() {
        guard let alarmAt = selfTestAlarmAt else {
            fputs("macOS hidden alarm fixture missing\n", stderr)
            finishSelfTest(code: 3)
        }
        let deadline = Date(timeIntervalSince1970: TimeInterval(alarmAt + 5))
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            guard let self else { return }
            let wait = self.tickTimer?.fireDate.timeIntervalSinceNow ?? 0
            guard !self.panel.isVisible && wait > 1.5 else {
                fputs("macOS hidden tick did not slow down\n", stderr)
                self.finishSelfTest(code: 3)
            }
            self.waitForHiddenAlarm(deadline: deadline)
        }
    }

    private func waitForHiddenAlarm(deadline: Date) {
        let state = readDataFile(name: "reminders.json", fallback: "")
        if panel.isVisible && state.contains("\"ringing\"") {
            fputs("macOS hidden alarm and warm-open test passed\n", stderr)
            finishSelfTest(code: 0)
        }
        if Date() > deadline {
            fputs("macOS hidden alarm test timed out\n", stderr)
            finishSelfTest(code: 3)
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in self?.waitForHiddenAlarm(deadline: deadline) }
    }

    private func finishSelfTest(code: Int32) -> Never {
        try? FileManager.default.removeItem(at: dataDirectory)
        exit(code)
    }

    private func configureMonitors() {
        globalShortcutMouseMonitor = NSEvent.addGlobalMonitorForEvents(matching: .otherMouseDown) { [weak self] event in
            DispatchQueue.main.async { self?.handleShortcutMouse(event) }
        }
        localShortcutMouseMonitor = NSEvent.addLocalMonitorForEvents(matching: .otherMouseDown) { [weak self] event in
            self?.handleShortcutMouse(event)
            return event
        }
        outsideMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            guard let self, self.panel.isVisible else { return }
            if !self.panel.frame.contains(NSEvent.mouseLocation) { self.hideWidget() }
        }
        localResizeMonitor = NSEvent.addLocalMonitorForEvents(matching: [.leftMouseDragged, .leftMouseUp]) { [weak self] event in
            self?.handleResizeEvent(event)
            return event
        }
        globalResizeMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDragged, .leftMouseUp]) { [weak self] event in
            self?.handleResizeEvent(event)
        }
    }

    @objc private func showFromNotification() { showWidget() }

    @objc private func toggleWidget() {
        panel.isVisible ? hideWidget() : showWidget()
    }

    @objc private func quit() { NSApp.terminate(nil) }

    private func showWidget() {
        if NSApp.isHidden { NSApp.unhide(nil) }
        panel.makeKeyAndOrderFront(nil)
        resetTickTimer(milliseconds: 1000)
        webView?.evaluateJavaScript("window.nativeTick && window.nativeTick()")
        NSApp.activate(ignoringOtherApps: true)
    }

    func windowDidMove(_ notification: Notification) { persistWindowFrame() }
    func windowDidResize(_ notification: Notification) { persistWindowFrame() }

    private func persistWindowFrame() {
        UserDefaults.standard.set(NSStringFromRect(panel.frame), forKey: "windowFrame")
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "host", let text = message.body as? String else { return }
        handleHostMessage(text)
    }

    private func handleHostMessage(_ message: String) {
        if message == "ready" {
            postInitialState()
        } else if message == "drag", let event = NSApp.currentEvent {
            panel.performDrag(with: event)
        } else if message == "resize" {
            beginResize(edge: "se")
        } else if message.hasPrefix("resize:") {
            beginResize(edge: String(message.dropFirst(7)))
        } else if message == "hide" {
            hideWidget()
        } else if message == "show" {
            showWidget()
        } else if message.hasPrefix("scheduleTick\n"), !panel.isVisible {
            let value = payload(message, prefix: "scheduleTick\n")
            if !value.isEmpty, value.allSatisfy({ $0.isNumber }), let milliseconds = Int(value) {
                resetTickTimer(milliseconds: milliseconds)
            }
        } else if message == "quit" {
            NSApp.terminate(nil)
        } else if message == "beginHotkeyCapture" {
            capturingHotKey = true
        } else if message == "endHotkeyCapture" {
            capturingHotKey = false
        } else if message.hasPrefix("setHotkey\n") {
            let values = payload(message, prefix: "setHotkey\n").split(separator: ",")
            let modifiers = values.count == 2 ? UInt32(values[0]) : nil
            let key = values.count == 2 ? UInt32(values[1]) : nil
            let success = modifiers.flatMap { m in key.map { registerHotKey(modifiers: m, key: $0) } } ?? false
            postHotKeyResult(success: success)
        } else if message.hasPrefix("saveConfig\n") {
            writeDataFile(name: "widget_config.json", value: payload(message, prefix: "saveConfig\n"))
        } else if message.hasPrefix("saveReminders\n") {
            writeDataFile(name: "reminders.json", value: payload(message, prefix: "saveReminders\n"))
        } else if message.hasPrefix("copyText\n") {
            let pasteboard = NSPasteboard.general
            pasteboard.clearContents()
            let success = pasteboard.setString(payload(message, prefix: "copyText\n"), forType: .string)
            webView.evaluateJavaScript("window.dispatchEvent(new CustomEvent('widgetCopyResult', {detail: \(success ? "true" : "false")}))", completionHandler: nil)
        } else if message.hasPrefix("saveSyncCredential\n") {
            writeSyncCredential(payload(message, prefix: "saveSyncCredential\n"))
        } else if message == "deleteSyncCredential" {
            deleteSyncCredential()
        } else if message.hasPrefix("openExternal\n") {
            let value = payload(message, prefix: "openExternal\n")
            if let url = URL(string: value), url.scheme == "https" { NSWorkspace.shared.open(url) }
        } else if message.hasPrefix("setStartup\n") {
            if !selfTestMode { setStartupEnabled(payload(message, prefix: "setStartup\n") == "1") }
        } else if message == "systemBeep" || message == "beep" {
            NSSound.beep()
        }
    }

    private func payload(_ message: String, prefix: String) -> String {
        String(message.dropFirst(prefix.count))
    }

    private var dataDirectory: URL {
        if selfTestMode {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("WorldClockWidgetSelfTest-\(ProcessInfo.processInfo.processIdentifier)", isDirectory: true)
            try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            return directory
        }
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = base.appendingPathComponent("WorldClockWidget", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory
    }

    private func readDataFile(name: String, fallback: String) -> String {
        (try? String(contentsOf: dataDirectory.appendingPathComponent(name), encoding: .utf8)) ?? fallback
    }

    private func writeDataFile(name: String, value: String) {
        try? value.data(using: .utf8)?.write(to: dataDirectory.appendingPathComponent(name), options: .atomic)
    }

    private func postInitialState() {
        let remindersText: String
        if selfTestMode {
            let alarm = Int(Date().timeIntervalSince1970) + 18
            selfTestAlarmAt = alarm
            remindersText = "{\"lead\":15,\"entries\":[{\"id\":\"mac-hidden-qa\",\"alarm\":\(alarm),\"target\":\(alarm),\"state\":\"pending\",\"lead\":0,\"direction\":\"after\",\"zone\":\"Etc/UTC\",\"city_key\":\"Etc/UTC\",\"city\":\"QA\",\"source_type\":\"city\",\"started_at\":\(alarm - 18),\"repeat\":\"none\",\"title\":\"QA\"}]}"
        } else {
            remindersText = readDataFile(name: "reminders.json", fallback: "{\"lead\":15,\"entries\":[]}")
        }
        let payload: [String: Any] = [
            "type": "init",
            "platform": "macos",
            "version": appVersion + " macOS Beta",
            "configText": readDataFile(name: "widget_config.json", fallback: "{}"),
            "remindersText": remindersText,
            "syncCredential": selfTestMode ? "" : readSyncCredential(),
            "hotkeyModifiers": currentModifiers,
            "hotkeyKey": currentKey
        ]
        postToWeb(payload)
    }

    private func postHotKeyResult(success: Bool) {
        postToWeb(["type": "hotkeyResult", "success": success, "modifiers": currentModifiers, "key": currentKey])
    }

    private func postToWeb(_ payload: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.__worldClockHostMessage(\(json));")
    }

    private func loadHotKeyFromConfig() {
        guard let data = readDataFile(name: "widget_config.json", fallback: "{}").data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let settings = json["settings"] as? [String: Any],
              let hotkey = settings["hotkey"] as? [String: Any],
              let modifiers = hotkey["modifiers"] as? NSNumber,
              let key = hotkey["key"] as? NSNumber else { return }
        if modifiers.uint32Value == 5 && key.uint32Value == 84 { return }
        currentModifiers = modifiers.uint32Value
        currentKey = key.uint32Value
    }

    private func handleShortcutMouse(_ event: NSEvent) {
        guard event.buttonNumber == 3 || event.buttonNumber == 4 else { return }
        let key: UInt32 = event.buttonNumber == 3 ? 1001 : 1002
        let flags = event.modifierFlags
        let modifiers: UInt32 = (flags.contains(.option) ? 1 : 0) |
            (flags.contains(.control) ? 2 : 0) | (flags.contains(.shift) ? 4 : 0) |
            (flags.contains(.command) ? 8 : 0)
        if capturingHotKey {
            postToWeb(["type": "hotkeyCaptured", "modifiers": modifiers, "key": key])
        } else if currentKey == key && currentModifiers == modifiers {
            toggleWidget()
        }
    }

    private func registerHotKey(modifiers: UInt32, key: UInt32) -> Bool {
        guard modifiers & ~UInt32(15) == 0 else { return false }
        if key == 1001 || key == 1002 {
            if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
            hotKeyRef = nil
            currentModifiers = modifiers
            currentKey = key
            refreshOpenMenuShortcut()
            return true
        }
        guard let virtualKey = virtualKeyCode(for: key) else { return false }
        if modifiers == 0 && [8,9,13,27,32,33,34,35,36,37,38,39,40,46].contains(key) { return false }
        let previousModifiers = currentModifiers
        let previousKey = currentKey
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        hotKeyRef = nil
        if hotKeyHandler == nil {
            var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
            let callback: EventHandlerUPP = { _, _, userData in
                guard let userData else { return OSStatus(eventNotHandledErr) }
                let controller = Unmanaged<WidgetController>.fromOpaque(userData).takeUnretainedValue()
                controller.toggleWidget()
                return noErr
            }
            InstallEventHandler(GetApplicationEventTarget(), callback, 1, &eventType, Unmanaged.passUnretained(self).toOpaque(), &hotKeyHandler)
        }
        var carbonModifiers: UInt32 = 0
        if modifiers & 1 != 0 { carbonModifiers |= UInt32(optionKey) }
        if modifiers & 2 != 0 { carbonModifiers |= UInt32(controlKey) }
        if modifiers & 4 != 0 { carbonModifiers |= UInt32(shiftKey) }
        if modifiers & 8 != 0 { carbonModifiers |= UInt32(cmdKey) }
        var reference: EventHotKeyRef?
        let identifier = EventHotKeyID(signature: OSType(0x57434C4B), id: 1)
        let status = RegisterEventHotKey(virtualKey, carbonModifiers, identifier, GetApplicationEventTarget(), 0, &reference)
        guard status == noErr else {
            if previousKey != key || previousModifiers != modifiers {
                _ = registerHotKey(modifiers: previousModifiers, key: previousKey)
            }
            return false
        }
        hotKeyRef = reference
        currentModifiers = modifiers
        currentKey = key
        refreshOpenMenuShortcut()
        return true
    }

    private func virtualKeyCode(for key: UInt32) -> UInt32? {
        let keys: [UInt32: UInt32] = [
            65: UInt32(kVK_ANSI_A), 66: UInt32(kVK_ANSI_B), 67: UInt32(kVK_ANSI_C), 68: UInt32(kVK_ANSI_D),
            69: UInt32(kVK_ANSI_E), 70: UInt32(kVK_ANSI_F), 71: UInt32(kVK_ANSI_G), 72: UInt32(kVK_ANSI_H),
            73: UInt32(kVK_ANSI_I), 74: UInt32(kVK_ANSI_J), 75: UInt32(kVK_ANSI_K), 76: UInt32(kVK_ANSI_L),
            77: UInt32(kVK_ANSI_M), 78: UInt32(kVK_ANSI_N), 79: UInt32(kVK_ANSI_O), 80: UInt32(kVK_ANSI_P),
            81: UInt32(kVK_ANSI_Q), 82: UInt32(kVK_ANSI_R), 83: UInt32(kVK_ANSI_S), 84: UInt32(kVK_ANSI_T),
            85: UInt32(kVK_ANSI_U), 86: UInt32(kVK_ANSI_V), 87: UInt32(kVK_ANSI_W), 88: UInt32(kVK_ANSI_X),
            89: UInt32(kVK_ANSI_Y), 90: UInt32(kVK_ANSI_Z),
            48: UInt32(kVK_ANSI_0), 49: UInt32(kVK_ANSI_1), 50: UInt32(kVK_ANSI_2), 51: UInt32(kVK_ANSI_3),
            52: UInt32(kVK_ANSI_4), 53: UInt32(kVK_ANSI_5), 54: UInt32(kVK_ANSI_6), 55: UInt32(kVK_ANSI_7),
            56: UInt32(kVK_ANSI_8), 57: UInt32(kVK_ANSI_9),
            8: UInt32(kVK_Delete), 9: UInt32(kVK_Tab), 13: UInt32(kVK_Return), 27: UInt32(kVK_Escape),
            32: UInt32(kVK_Space), 33: UInt32(kVK_PageUp), 34: UInt32(kVK_PageDown),
            35: UInt32(kVK_End), 36: UInt32(kVK_Home), 37: UInt32(kVK_LeftArrow),
            38: UInt32(kVK_UpArrow), 39: UInt32(kVK_RightArrow), 40: UInt32(kVK_DownArrow),
            46: UInt32(kVK_ForwardDelete),
            96: UInt32(kVK_ANSI_Keypad0), 97: UInt32(kVK_ANSI_Keypad1), 98: UInt32(kVK_ANSI_Keypad2),
            99: UInt32(kVK_ANSI_Keypad3), 100: UInt32(kVK_ANSI_Keypad4), 101: UInt32(kVK_ANSI_Keypad5),
            102: UInt32(kVK_ANSI_Keypad6), 103: UInt32(kVK_ANSI_Keypad7), 104: UInt32(kVK_ANSI_Keypad8),
            105: UInt32(kVK_ANSI_Keypad9), 106: UInt32(kVK_ANSI_KeypadMultiply),
            107: UInt32(kVK_ANSI_KeypadPlus), 108: UInt32(kVK_ANSI_KeypadEnter), 109: UInt32(kVK_ANSI_KeypadMinus),
            110: UInt32(kVK_ANSI_KeypadDecimal), 111: UInt32(kVK_ANSI_KeypadDivide),
            112: UInt32(kVK_F1), 113: UInt32(kVK_F2), 114: UInt32(kVK_F3), 115: UInt32(kVK_F4),
            116: UInt32(kVK_F5), 117: UInt32(kVK_F6), 118: UInt32(kVK_F7), 119: UInt32(kVK_F8),
            120: UInt32(kVK_F9), 121: UInt32(kVK_F10), 122: UInt32(kVK_F11),
            124: UInt32(kVK_F13), 125: UInt32(kVK_F14), 126: UInt32(kVK_F15),
            127: UInt32(kVK_F16), 128: UInt32(kVK_F17), 129: UInt32(kVK_F18),
            130: UInt32(kVK_F19), 131: UInt32(kVK_F20),
            186: UInt32(kVK_ANSI_Semicolon), 187: UInt32(kVK_ANSI_Equal),
            188: UInt32(kVK_ANSI_Comma), 189: UInt32(kVK_ANSI_Minus),
            190: UInt32(kVK_ANSI_Period), 191: UInt32(kVK_ANSI_Slash),
            192: UInt32(kVK_ANSI_Grave), 219: UInt32(kVK_ANSI_LeftBracket),
            220: UInt32(kVK_ANSI_Backslash), 221: UInt32(kVK_ANSI_RightBracket),
            222: UInt32(kVK_ANSI_Quote)
        ]
        return keys[key]
    }

    private func setStartupEnabled(_ enabled: Bool) {
        if selfTestMode { return }
        guard #available(macOS 13.0, *) else { return }
        do {
            if enabled {
                if SMAppService.mainApp.status != .enabled { try SMAppService.mainApp.register() }
            } else if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            }
        } catch {
            NSLog("Could not update launch-at-login: %@", error.localizedDescription)
        }
    }

    private func beginResize(edge: String) {
        resizeEdge = edge
        resizeStartFrame = panel.frame
        resizeStartPoint = NSEvent.mouseLocation
    }

    private func handleResizeEvent(_ event: NSEvent) {
        guard let edge = resizeEdge else { return }
        if event.type == .leftMouseUp { resizeEdge = nil; return }
        let point = NSEvent.mouseLocation
        let dx = point.x - resizeStartPoint.x
        let dy = point.y - resizeStartPoint.y
        var frame = resizeStartFrame
        if edge.contains("e") { frame.size.width = max(panel.minSize.width, resizeStartFrame.width + dx) }
        if edge.contains("w") {
            let width = max(panel.minSize.width, resizeStartFrame.width - dx)
            frame.origin.x = resizeStartFrame.maxX - width
            frame.size.width = width
        }
        if edge.contains("n") { frame.size.height = max(panel.minSize.height, resizeStartFrame.height + dy) }
        if edge.contains("s") {
            let height = max(panel.minSize.height, resizeStartFrame.height - dy)
            frame.origin.y = resizeStartFrame.maxY - height
            frame.size.height = height
        }
        panel.setFrame(frame, display: true)
    }

    private let keychainService = "com.candflip.worldclockwidget.phone-sync"

    private func readSyncCredential() -> String {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return "" }
        return String(data: data, encoding: .utf8) ?? ""
    }

    private func writeSyncCredential(_ value: String) {
        deleteSyncCredential()
        let item: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: "WorldClockWidget",
            kSecValueData as String: Data(value.utf8)
        ]
        SecItemAdd(item as CFDictionary, nil)
    }

    private func deleteSyncCredential() {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: keychainService]
        SecItemDelete(query as CFDictionary)
    }
}

let application = NSApplication.shared
let delegate = WidgetController()
application.delegate = delegate
application.run()
