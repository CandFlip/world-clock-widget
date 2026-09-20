import AppKit
import Carbon
import Darwin
import Security
import ServiceManagement
import WebKit

private let appVersion = "v1.1.108"
private let showNotification = Notification.Name("com.candflip.worldclockwidget.show")

final class WidgetPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class WidgetController: NSObject, NSApplicationDelegate, WKScriptMessageHandler, NSWindowDelegate {
    private var panel: WidgetPanel!
    private var webView: WKWebView!
    private var statusItem: NSStatusItem!
    private var hotKeyRef: EventHotKeyRef?
    private var hotKeyHandler: EventHandlerRef?
    private var currentModifiers: UInt32 = 5
    private var currentKey: UInt32 = 84
    private var outsideMonitor: Any?
    private var localResizeMonitor: Any?
    private var globalResizeMonitor: Any?
    private var tickTimer: Timer?
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
        if selfTestMode {
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in self?.runSelfTest() }
        }
        panel.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let hotKeyHandler { RemoveEventHandler(hotKeyHandler) }
        if let outsideMonitor { NSEvent.removeMonitor(outsideMonitor) }
        if let localResizeMonitor { NSEvent.removeMonitor(localResizeMonitor) }
        if let globalResizeMonitor { NSEvent.removeMonitor(globalResizeMonitor) }
        tickTimer?.invalidate()
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
        configuration.userContentController = controller
        configuration.websiteDataStore = .default()
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
        menu.addItem(NSMenuItem(title: "Открыть", action: #selector(toggleWidget), keyEquivalent: ""))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Выход", action: #selector(quit), keyEquivalent: "q"))
        menu.items.forEach { $0.target = self }
        statusItem.menu = menu
    }

    private func startTickTimer() {
        let timer = Timer(timeInterval: 1, target: self, selector: #selector(tick), userInfo: nil, repeats: true)
        tickTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    @objc private func tick() {
        webView?.evaluateJavaScript("window.nativeTick && window.nativeTick()")
    }

    private func runSelfTest() {
        let script = "typeof window.nativeTick === 'function' && window.__nativeTickCount >= 2 && window.__worldClockPlatform === 'macos'"
        let nativeHotKeyMapping = currentModifiers == 5 && virtualKeyCode(for: 84) == UInt32(kVK_ANSI_T)
        webView.evaluateJavaScript(script) { result, error in
            let passed = nativeHotKeyMapping && error == nil && (result as? Bool == true || (result as? NSNumber)?.boolValue == true)
            fputs(passed ? "macOS runtime tick test passed\n" : "macOS runtime tick test failed\n", stderr)
            exit(passed ? 0 : 3)
        }
    }

    private func configureMonitors() {
        outsideMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            guard let self, self.panel.isVisible else { return }
            if !self.panel.frame.contains(NSEvent.mouseLocation) { self.panel.orderOut(nil) }
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
        panel.isVisible ? panel.orderOut(nil) : showWidget()
    }

    @objc private func quit() { NSApp.terminate(nil) }

    private func showWidget() {
        panel.makeKeyAndOrderFront(nil)
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
            panel.orderOut(nil)
        } else if message == "show" {
            showWidget()
        } else if message == "quit" {
            NSApp.terminate(nil)
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
        } else if message.hasPrefix("saveSyncCredential\n") {
            writeSyncCredential(payload(message, prefix: "saveSyncCredential\n"))
        } else if message == "deleteSyncCredential" {
            deleteSyncCredential()
        } else if message.hasPrefix("openExternal\n") {
            let value = payload(message, prefix: "openExternal\n")
            if let url = URL(string: value), url.scheme == "https" { NSWorkspace.shared.open(url) }
        } else if message.hasPrefix("setStartup\n") {
            setStartupEnabled(payload(message, prefix: "setStartup\n") == "1")
        } else if message == "beep" {
            NSSound.beep()
        }
    }

    private func payload(_ message: String, prefix: String) -> String {
        String(message.dropFirst(prefix.count))
    }

    private var dataDirectory: URL {
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
        let payload: [String: Any] = [
            "type": "init",
            "platform": "macos",
            "version": appVersion + " macOS Beta",
            "configText": readDataFile(name: "widget_config.json", fallback: "{}"),
            "remindersText": readDataFile(name: "reminders.json", fallback: "{\"lead\":15,\"entries\":[]}"),
            "syncCredential": readSyncCredential(),
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
        currentModifiers = modifiers.uint32Value
        currentKey = key.uint32Value
    }

    private func registerHotKey(modifiers: UInt32, key: UInt32) -> Bool {
        guard let virtualKey = virtualKeyCode(for: key) else { return false }
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
        guard status == noErr else { return false }
        hotKeyRef = reference
        currentModifiers = modifiers
        currentKey = key
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
            107: UInt32(kVK_ANSI_KeypadPlus), 109: UInt32(kVK_ANSI_KeypadMinus),
            110: UInt32(kVK_ANSI_KeypadDecimal), 111: UInt32(kVK_ANSI_KeypadDivide),
            112: UInt32(kVK_F1), 113: UInt32(kVK_F2), 114: UInt32(kVK_F3), 115: UInt32(kVK_F4),
            116: UInt32(kVK_F5), 117: UInt32(kVK_F6), 118: UInt32(kVK_F7), 119: UInt32(kVK_F8),
            120: UInt32(kVK_F9), 121: UInt32(kVK_F10), 122: UInt32(kVK_F11)
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
