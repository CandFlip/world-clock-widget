#include <windows.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <shellapi.h>
#include <urlmon.h>
#include <bcrypt.h>
#include <wincred.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <wrl.h>
#include <algorithm>
#include <filesystem>
#include <functional>
#include <fstream>
#include <sstream>
#include <string>
#include <cstring>
#include <regex>
#include <thread>
#include <atomic>
#include <vector>
#include <memory>
#include "WebView2.h"

using Microsoft::WRL::ComPtr;

namespace {
#ifdef WORLD_CLOCK_QA
constexpr wchar_t kClassName[] = L"WorldClockWidgetNativeQA";
constexpr wchar_t kMutexName[] = L"Local\\WorldClockWidgetQASingleInstance";
constexpr wchar_t kShowEventName[] = L"Local\\WorldClockWidgetQAShow";
constexpr wchar_t kShutdownEventName[] = L"Local\\WorldClockWidgetQAShutdown";
#else
constexpr wchar_t kClassName[] = L"WorldClockWidgetNative";
constexpr wchar_t kMutexName[] = L"Local\\WorldClockWidgetSingleInstance";
constexpr wchar_t kShowEventName[] = L"Local\\WorldClockWidgetShow";
constexpr wchar_t kShutdownEventName[] = L"Local\\WorldClockWidgetShutdown";
#endif
constexpr UINT kTrayMessage = WM_APP + 1;
constexpr UINT kShowMessage = WM_APP + 2;
constexpr UINT kShutdownMessage = WM_APP + 3;
constexpr UINT kOutsideClick = WM_APP + 4;
constexpr UINT kUpdateDownloaded = WM_APP + 5;
constexpr UINT kHotkey = 1;
constexpr UINT_PTR kTickTimer = 1;
constexpr UINT_PTR kUiReadyTimer = 2;
constexpr UINT_PTR kTrayRetryTimer = 3;
constexpr wchar_t kVersion[] = L"v1.1.136";
constexpr wchar_t kSyncCredentialTarget[] = L"WorldClockWidget/PhoneSync";
constexpr wchar_t kStartupValueName[] = L"World Clock Widget";
std::atomic_bool g_updateDownloading{false};

HWND g_window{};
ComPtr<ICoreWebView2Controller> g_controller;
ComPtr<ICoreWebView2> g_webview;
NOTIFYICONDATAW g_tray{};
HANDLE g_showEvent{}, g_shutdownEvent{}, g_watchThread{};
bool g_visible = true;
bool g_animating = false;
RECT g_target{};
HHOOK g_mouseHook{};
bool g_trayMenuOpen=false;
bool g_uiReady=false;
int g_uiLoadAttempts=0;
bool g_startedByWindows=false;
bool g_trayAdded=false;
bool g_webViewInitializationStarted=false;
bool g_showWhenReady=false;
UINT g_taskbarCreatedMessage=0;
UINT g_hotkeyModifiers=MOD_ALT;
UINT g_hotkeyKey=VK_SPACE;
bool g_hotkeyRegistered=false;
HHOOK g_shortcutKeyboardHook{}, g_shortcutMouseHook{};
bool g_capturingHotkey=false;
bool g_shortcutKeyDown=false;
bool g_swallowShortcutRelease=false;
UINT g_swallowMouseRelease=0;

LRESULT CALLBACK outsideMouse(int code, WPARAM message, LPARAM data);
void initializeWebView();

template<class Interface> const IID& interfaceId();
template<> const IID& interfaceId<ICoreWebView2WebMessageReceivedEventHandler>() { return IID_ICoreWebView2WebMessageReceivedEventHandler; }
template<> const IID& interfaceId<ICoreWebView2PermissionRequestedEventHandler>() { return IID_ICoreWebView2PermissionRequestedEventHandler; }
template<> const IID& interfaceId<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>() { return IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler; }
template<> const IID& interfaceId<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>() { return IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler; }
template<class Interface> class ComHandlerBase : public Interface {
    volatile LONG refs_{1};
public:
    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID id, void** object) override {
        if (!object) return E_POINTER;
        if (id == IID_IUnknown || id == interfaceId<Interface>()) { *object=static_cast<Interface*>(this); AddRef(); return S_OK; }
        *object=nullptr; return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&refs_); }
    ULONG STDMETHODCALLTYPE Release() override { ULONG value=InterlockedDecrement(&refs_); if(!value) delete this; return value; }
    virtual ~ComHandlerBase() = default;
};
class EnvironmentHandler final : public ComHandlerBase<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler> {
    std::function<HRESULT(HRESULT,ICoreWebView2Environment*)> fn_;
public: explicit EnvironmentHandler(decltype(fn_) fn):fn_(std::move(fn)){} HRESULT STDMETHODCALLTYPE Invoke(HRESULT h,ICoreWebView2Environment* e) override{return fn_(h,e);}
};
class ControllerHandler final : public ComHandlerBase<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler> {
    std::function<HRESULT(HRESULT,ICoreWebView2Controller*)> fn_;
public: explicit ControllerHandler(decltype(fn_) fn):fn_(std::move(fn)){} HRESULT STDMETHODCALLTYPE Invoke(HRESULT h,ICoreWebView2Controller* c) override{return fn_(h,c);}
};
class MessageHandler final : public ComHandlerBase<ICoreWebView2WebMessageReceivedEventHandler> {
    std::function<HRESULT(ICoreWebView2*,ICoreWebView2WebMessageReceivedEventArgs*)> fn_;
public: explicit MessageHandler(decltype(fn_) fn):fn_(std::move(fn)){} HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2* w,ICoreWebView2WebMessageReceivedEventArgs* a) override{return fn_(w,a);}
};
class AudioPermissionHandler final : public ComHandlerBase<ICoreWebView2PermissionRequestedEventHandler> {
public:
    HRESULT STDMETHODCALLTYPE Invoke(ICoreWebView2*, ICoreWebView2PermissionRequestedEventArgs* args) override {
        COREWEBVIEW2_PERMISSION_KIND kind{};
        if (SUCCEEDED(args->get_PermissionKind(&kind)) && kind == COREWEBVIEW2_PERMISSION_KIND_AUTOPLAY)
            return args->put_State(COREWEBVIEW2_PERMISSION_STATE_ALLOW);
        return S_OK;
    }
};

std::filesystem::path exeDir() {
    wchar_t path[MAX_PATH]{};
    GetModuleFileNameW(nullptr, path, MAX_PATH);
    return std::filesystem::path(path).parent_path();
}

std::wstring executablePath() {
    wchar_t path[MAX_PATH]{};
    GetModuleFileNameW(nullptr, path, MAX_PATH);
    return path;
}

std::filesystem::path startupShortcutPath() {
    PWSTR raw{};
    SHGetKnownFolderPath(FOLDERID_Startup, KF_FLAG_CREATE, nullptr, &raw);
    std::filesystem::path result(raw ? raw : L".");
    CoTaskMemFree(raw);
    return result / L"WorldClockWidget.lnk";
}

bool setRegistryStartup(bool enabled) {
    HKEY key{};
    if (RegCreateKeyExW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Run", 0, nullptr, 0,
        KEY_SET_VALUE, nullptr, &key, nullptr) != ERROR_SUCCESS) return false;
    LONG result=ERROR_SUCCESS;
    if(enabled) {
        const std::wstring command=L"\"" + executablePath() + L"\" --startup";
        result=RegSetValueExW(key,kStartupValueName,0,REG_SZ,reinterpret_cast<const BYTE*>(command.c_str()),
            static_cast<DWORD>((command.size()+1)*sizeof(wchar_t)));
        RegDeleteValueW(key,L"WorldClockWidget");
    } else {
        const LONG current=RegDeleteValueW(key,kStartupValueName);
        const LONG legacy=RegDeleteValueW(key,L"WorldClockWidget");
        result=(current==ERROR_SUCCESS || current==ERROR_FILE_NOT_FOUND) &&
            (legacy==ERROR_SUCCESS || legacy==ERROR_FILE_NOT_FOUND) ? ERROR_SUCCESS : ERROR_ACCESS_DENIED;
    }
    RegCloseKey(key);
    return result==ERROR_SUCCESS;
}

void clearStartupDisabledState() {
    HKEY key{};
    if (RegOpenKeyExW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder", 0, KEY_SET_VALUE, &key) == ERROR_SUCCESS) {
        RegDeleteValueW(key, L"WorldClockWidget.lnk");
        RegCloseKey(key);
    }
}

bool setStartupEnabled(bool enabled) {
#ifdef WORLD_CLOCK_QA
    (void)enabled;
    return true;
#else
    const auto shortcut = startupShortcutPath();
    HKEY key{};
    bool matches = false;
    if (RegOpenKeyExW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Run", 0,
        KEY_QUERY_VALUE, &key) == ERROR_SUCCESS) {
        DWORD type = 0;
        DWORD size = 0;
        const LONG current = RegQueryValueExW(key, kStartupValueName, nullptr, &type, nullptr, &size);
        const bool legacyAbsent = RegQueryValueExW(key, L"WorldClockWidget", nullptr, nullptr, nullptr, nullptr) == ERROR_FILE_NOT_FOUND;
        if (!enabled) matches = current == ERROR_FILE_NOT_FOUND && legacyAbsent;
        else if (current == ERROR_SUCCESS && type == REG_SZ && legacyAbsent && size >= sizeof(wchar_t)) {
            std::wstring value(size / sizeof(wchar_t), L'\0');
            if (RegQueryValueExW(key, kStartupValueName, nullptr, &type,
                reinterpret_cast<BYTE*>(value.data()), &size) == ERROR_SUCCESS) {
                value.resize(wcsnlen_s(value.c_str(), value.size()));
                matches = value == L"\"" + executablePath() + L"\" --startup";
            }
        }
        RegCloseKey(key);
    }
    if (matches && !std::filesystem::exists(shortcut)) return true;
    std::error_code error;
    std::filesystem::remove(shortcut,error);
    clearStartupDisabledState();
    return setRegistryStartup(enabled);
#endif
}

std::filesystem::path dataDir() {
#ifdef WORLD_CLOCK_QA
    wchar_t isolated[MAX_PATH]{};
    const DWORD length=GetEnvironmentVariableW(L"WORLD_CLOCK_QA_DATA_DIR",isolated,MAX_PATH);
    if(length == 0 || length >= MAX_PATH) std::terminate();
    std::filesystem::path result(isolated);
#else
    PWSTR raw{};
    SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &raw);
    std::filesystem::path result(raw ? raw : L".");
    CoTaskMemFree(raw);
    result /= L"WorldClockWidget";
#endif
    std::filesystem::create_directories(result);
    return result;
}

void logStartup(const std::wstring& message) {
    SYSTEMTIME now{}; GetLocalTime(&now);
    wchar_t stamp[64]{};
    swprintf_s(stamp, L"%04u-%02u-%02u %02u:%02u:%02u ", now.wYear, now.wMonth, now.wDay, now.wHour, now.wMinute, now.wSecond);
    std::wofstream output(dataDir() / L"startup.log", std::ios::app);
    output << stamp << message << L"\n";
}

std::wstring readUtf8(const std::filesystem::path& path, std::wstring fallback) {
    std::ifstream input(path, std::ios::binary);
    if (!input) return fallback;
    std::string bytes((std::istreambuf_iterator<char>(input)), {});
    if (bytes.empty()) return fallback;
    int count = MultiByteToWideChar(CP_UTF8, 0, bytes.data(), (int)bytes.size(), nullptr, 0);
    std::wstring result(count, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, bytes.data(), (int)bytes.size(), result.data(), count);
    return result;
}

bool writeUtf8Atomic(const std::filesystem::path& path, const std::wstring& value) {
    int count = WideCharToMultiByte(CP_UTF8, 0, value.data(), (int)value.size(), nullptr, 0, nullptr, nullptr);
    std::string bytes(count, '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.data(), (int)value.size(), bytes.data(), count, nullptr, nullptr);
    auto temporary = path; temporary += L".tmp";
    std::ofstream output(temporary, std::ios::binary | std::ios::trunc);
    if (!output.write(bytes.data(), bytes.size())) return false;
    output.close();
    if (!output) return false;
    if (MoveFileExW(temporary.c_str(), path.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) return true;
    std::error_code error;
    std::filesystem::remove(temporary, error);
    return false;
}

std::wstring jsonQuote(const std::wstring& value) {
    std::wstring out = L"\"";
    for (wchar_t ch : value) {
        if (ch == L'\\' || ch == L'\"') { out += L'\\'; out += ch; }
        else if (ch == L'\n') out += L"\\n";
        else if (ch != L'\r') out += ch;
    }
    return out + L"\"";
}

bool autostartAllowed() {
    const std::wstring config=readUtf8(dataDir()/L"widget_config.json",L"{}");
    const std::wregex pattern(L"\\\"autostart\\\"\\s*:\\s*(true|false)",std::regex_constants::icase);
    std::wsmatch match;
    return !std::regex_search(config,match,pattern) || match[1].str()!=L"false";
}

bool supportedHotkey(UINT modifiers, UINT key) {
    if (modifiers & ~(MOD_ALT|MOD_CONTROL|MOD_SHIFT)) return false;
    if (key == 1001 || key == 1002) return true;
    if (!modifiers && (key == VK_BACK || key == VK_TAB || key == VK_RETURN || key == VK_ESCAPE ||
        key == VK_SPACE || (key >= VK_PRIOR && key <= VK_DOWN) || key == VK_INSERT || key == VK_DELETE)) return false;
    return (key >= '0' && key <= '9') || (key >= 'A' && key <= 'Z') ||
        (key >= VK_F1 && key <= VK_F11) || (key >= VK_F13 && key <= VK_F20) ||
        (key >= VK_NUMPAD0 && key <= VK_DIVIDE) ||
        (key >= VK_OEM_1 && key <= VK_OEM_3) || (key >= VK_OEM_4 && key <= VK_OEM_7) ||
        key == VK_BACK || key == VK_TAB || key == VK_RETURN || key == VK_ESCAPE ||
        key == VK_SPACE || (key >= VK_PRIOR && key <= VK_DOWN) ||
        key == VK_INSERT || key == VK_DELETE;
}

UINT shortcutModifiers(bool altDown=false) {
    return (altDown || (GetAsyncKeyState(VK_MENU)&0x8000) ? MOD_ALT : 0) |
        (GetAsyncKeyState(VK_CONTROL)&0x8000 ? MOD_CONTROL : 0) |
        (GetAsyncKeyState(VK_SHIFT)&0x8000 ? MOD_SHIFT : 0);
}

LRESULT CALLBACK shortcutKeyboard(int code, WPARAM message, LPARAM data) {
    if (code == HC_ACTION) {
        const auto* event=reinterpret_cast<const KBDLLHOOKSTRUCT*>(data);
        const UINT key=event->vkCode;
        if (key == g_hotkeyKey && (message==WM_KEYUP || message==WM_SYSKEYUP)) {
            g_shortcutKeyDown=false;
            if(g_swallowShortcutRelease) {g_swallowShortcutRelease=false;return 1;}
        }
        if (!g_capturingHotkey && g_hotkeyRegistered && key==g_hotkeyKey &&
            (message==WM_KEYDOWN || message==WM_SYSKEYDOWN) &&
            shortcutModifiers((event->flags&LLKHF_ALTDOWN)!=0)==g_hotkeyModifiers) {
            if (!g_shortcutKeyDown) {g_shortcutKeyDown=true;PostMessageW(g_window,WM_HOTKEY,kHotkey,0);}
            // A plain letter or digit remains usable for typing when selected alone.
            const bool swallow=g_hotkeyModifiers!=0 || (key>=VK_F1 && key<=VK_F20);
            g_swallowShortcutRelease=swallow;
            if(swallow) return 1;
        }
    }
    return CallNextHookEx(g_shortcutKeyboardHook,code,message,data);
}

LRESULT CALLBACK shortcutMouse(int code, WPARAM message, LPARAM data) {
    if (code==HC_ACTION && message==WM_XBUTTONDOWN) {
        const auto* event=reinterpret_cast<const MSLLHOOKSTRUCT*>(data);
        const UINT key=HIWORD(event->mouseData)==XBUTTON1 ? 1001 : 1002;
        const UINT modifiers=shortcutModifiers();
        if (g_capturingHotkey && g_webview) {
            const std::wstring result=L"{\"type\":\"hotkeyCaptured\",\"modifiers\":"+
                std::to_wstring(modifiers)+L",\"key\":"+std::to_wstring(key)+L"}";
            g_webview->PostWebMessageAsJson(result.c_str());
            g_swallowMouseRelease=key;
            return 1;
        }
        if (g_hotkeyRegistered && key==g_hotkeyKey && modifiers==g_hotkeyModifiers) {
            PostMessageW(g_window,WM_HOTKEY,kHotkey,0);
            g_swallowMouseRelease=key;
            return 1;
        }
    }
    if (code==HC_ACTION && message==WM_XBUTTONUP && g_swallowMouseRelease) {
        const auto* event=reinterpret_cast<const MSLLHOOKSTRUCT*>(data);
        const UINT key=HIWORD(event->mouseData)==XBUTTON1 ? 1001 : 1002;
        if (key==g_swallowMouseRelease) {g_swallowMouseRelease=0;return 1;}
    }
    return CallNextHookEx(g_shortcutMouseHook,code,message,data);
}

void loadHotkey() {
    const auto config=readUtf8(dataDir()/L"widget_config.json",L"{}");
    const std::wregex pattern(LR"hotkey("hotkey"\s*:\s*\{\s*"modifiers"\s*:\s*(\d+)\s*,\s*"key"\s*:\s*(\d+))hotkey");
    std::wsmatch match;
    if (std::regex_search(config,match,pattern)) {
        try {
            const auto modifiers=std::stoul(match[1].str()), key=std::stoul(match[2].str());
            if(supportedHotkey(modifiers,key)) {
                if(modifiers==(MOD_ALT|MOD_SHIFT) && key=='T') return;
                g_hotkeyModifiers=modifiers;g_hotkeyKey=key;
            }
        } catch (...) {}
    }
}

bool registerHotkey(UINT modifiers, UINT key) {
    if(!supportedHotkey(modifiers,key)) return false;
    if(g_hotkeyRegistered && modifiers==g_hotkeyModifiers && key==g_hotkeyKey) return true;
    if ((key==1001 || key==1002) ? !g_shortcutMouseHook : !g_shortcutKeyboardHook) return false;
    g_hotkeyModifiers=modifiers;g_hotkeyKey=key;g_hotkeyRegistered=true;
    g_shortcutKeyDown=false;g_swallowShortcutRelease=false;
    return true;
}

void postHotkeyResult(bool success) {
    if(!g_webview) return;
    const std::wstring result=L"{\"type\":\"hotkeyResult\",\"success\":" +
        std::wstring(success?L"true":L"false") + L",\"modifiers\":" + std::to_wstring(g_hotkeyModifiers) +
        L",\"key\":" + std::to_wstring(g_hotkeyKey) + L"}";
    g_webview->PostWebMessageAsJson(result.c_str());
}

std::wstring readSyncCredential() {
#ifdef WORLD_CLOCK_QA
    return L"";
#else
    PCREDENTIALW credential{};
    if (!CredReadW(kSyncCredentialTarget, CRED_TYPE_GENERIC, 0, &credential) || !credential) return L"";
    const auto* bytes = reinterpret_cast<const char*>(credential->CredentialBlob);
    const int size = static_cast<int>(credential->CredentialBlobSize);
    int count = size ? MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes, size, nullptr, 0) : 0;
    std::wstring result(count, L'\0');
    if (count) MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, bytes, size, result.data(), count);
    CredFree(credential);
    return result;
#endif
}

bool writeSyncCredential(const std::wstring& value) {
#ifdef WORLD_CLOCK_QA
    (void)value;
    return true;
#else
    int count = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    std::string bytes(count, '\0');
    if (count) WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), bytes.data(), count, nullptr, nullptr);
    CREDENTIALW credential{};
    credential.Type = CRED_TYPE_GENERIC;
    credential.TargetName = const_cast<LPWSTR>(kSyncCredentialTarget);
    credential.CredentialBlobSize = static_cast<DWORD>(bytes.size());
    credential.CredentialBlob = reinterpret_cast<LPBYTE>(bytes.data());
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
    credential.UserName = const_cast<LPWSTR>(L"WorldClockWidget");
    return CredWriteW(&credential, 0) == TRUE;
#endif
}

void postInitialState() {
    if (!g_webview) return;
    auto config = readUtf8(dataDir() / L"widget_config.json", L"{}");
    auto reminders = readUtf8(dataDir() / L"reminders.json", L"{\"lead\":15,\"entries\":[]}");
    std::wstring payload = L"{\"type\":\"init\",\"version\":" + jsonQuote(kVersion) +
        L",\"configText\":" + jsonQuote(config) + L",\"remindersText\":" + jsonQuote(reminders) +
        L",\"syncCredential\":" + jsonQuote(readSyncCredential()) +
        L",\"hotkeyModifiers\":" + std::to_wstring(g_hotkeyModifiers) +
        L",\"hotkeyKey\":" + std::to_wstring(g_hotkeyKey) + L"}";
    g_webview->PostWebMessageAsJson(payload.c_str());
}

void setBounds() {
    if (!g_window) return;
    RECT rect{}; GetClientRect(g_window, &rect);
    const int diameter = MulDiv(24, static_cast<int>(GetDpiForWindow(g_window)), 96);
    HRGN region = CreateRoundRectRgn(0, 0, rect.right + 1, rect.bottom + 1, diameter, diameter);
    if (region && !SetWindowRgn(g_window, region, TRUE)) DeleteObject(region);
    if (g_controller) g_controller->put_Bounds(rect);
}

bool addTrayIcon() {
    if(!g_trayAdded) {
        if(!Shell_NotifyIconW(NIM_ADD,&g_tray)) return false;
        g_trayAdded=true;
        g_tray.uVersion=NOTIFYICON_VERSION_4;
        Shell_NotifyIconW(NIM_SETVERSION,&g_tray);
        KillTimer(g_window,kTrayRetryTimer);
        logStartup(L"Tray icon ready");
    }
    if(!g_webViewInitializationStarted) {
        g_webViewInitializationStarted=true;
        initializeWebView();
    }
    return true;
}

void retryTrayIcon() {
    if(!addTrayIcon()) SetTimer(g_window,kTrayRetryTimer,500,nullptr);
}

void saveWindow() {
    RECT r=g_target; if (!r.right && !GetWindowRect(g_window, &r)) return;
    auto path = dataDir() / L"native_window.ini";
    WritePrivateProfileStringW(L"Window", L"X", std::to_wstring(r.left).c_str(), path.c_str());
    WritePrivateProfileStringW(L"Window", L"Y", std::to_wstring(r.top).c_str(), path.c_str());
    WritePrivateProfileStringW(L"Window", L"Width", std::to_wstring(r.right-r.left).c_str(), path.c_str());
    WritePrivateProfileStringW(L"Window", L"Height", std::to_wstring(r.bottom-r.top).c_str(), path.c_str());
}

RECT loadWindow() {
    RECT work{}; SystemParametersInfoW(SPI_GETWORKAREA, 0, &work, 0);
    auto path = dataDir() / L"native_window.ini";
    int width=417,height=750,x=work.right-width-10,y=work.top+10;
    if (!std::filesystem::exists(path)) {
        std::wstring json=readUtf8(dataDir()/L"widget_config.json",L"{}");
        size_t start=json.find(L"\"window\"");
        if(start!=std::wstring::npos){
            std::wstring block=json.substr(start,std::min<size_t>(500,json.size()-start));
            auto value=[&](const wchar_t* key,int fallback){std::wregex pattern(std::wstring(L"\\\"")+key+L"\\\"\\s*:\\s*(-?\\d+)");std::wsmatch match;return std::regex_search(block,match,pattern)?std::stoi(match[1].str()):fallback;};
            width=value(L"width",width);height=value(L"height",height);x=value(L"x",work.right-width-10);y=value(L"y",work.top+10);
        }
    } else {
        width=(int)GetPrivateProfileIntW(L"Window",L"Width",width,path.c_str());
        height=(int)GetPrivateProfileIntW(L"Window",L"Height",height,path.c_str());
        x=(int)GetPrivateProfileIntW(L"Window",L"X",x,path.c_str());
        y=(int)GetPrivateProfileIntW(L"Window",L"Y",y,path.c_str());
    }
    width=std::max(400,width);height=std::max(320,height);
    return {x,y,x+width,y+height};
}

void showWidget(bool show) {
    if(show && !g_uiReady) { g_showWhenReady=true; return; }
    if(!show) g_showWhenReady=false;
    if (g_animating || show==g_visible) return;
    g_animating=true;
    if(show) {
        if(g_controller) g_controller->put_IsVisible(TRUE);
    }
    if(!show && g_webview) g_webview->ExecuteScript(L"typeof closeNamePopover==='function'&&closeNamePopover()",nullptr);
    const int width=g_target.right-g_target.left;
    const int height=g_target.bottom-g_target.top;
    MONITORINFO monitor{sizeof(MONITORINFO)};
    GetMonitorInfoW(MonitorFromRect(&g_target, MONITOR_DEFAULTTONEAREST), &monitor);
    std::wstring settings=readUtf8(dataDir()/L"widget_config.json", L"{}");
    std::wsmatch match;
    const std::wregex pattern(LR"direction("overlay_direction"\s*:\s*"(left|right|top|bottom)")direction");
    const std::wstring direction=std::regex_search(settings,match,pattern)?match[1].str():L"right";
    int hiddenX=g_target.left,hiddenY=g_target.top;
    if(direction==L"left") hiddenX=monitor.rcMonitor.left-width;
    else if(direction==L"top") hiddenY=monitor.rcMonitor.top-height;
    else if(direction==L"bottom") hiddenY=monitor.rcMonitor.bottom;
    else hiddenX=monitor.rcMonitor.right;
    constexpr int frames=10;
    if(show) SetWindowPos(g_window,HWND_TOPMOST,hiddenX,hiddenY,width,height,SWP_NOACTIVATE|SWP_SHOWWINDOW);
    for(int i=1;i<=frames;i++) {
        double p=(double)i/frames; p=show?1-(1-p)*(1-p)*(1-p):p*p*p;
        const int fromX=show?hiddenX:g_target.left, fromY=show?hiddenY:g_target.top;
        const int toX=show?g_target.left:hiddenX, toY=show?g_target.top:hiddenY;
        SetWindowPos(g_window,HWND_TOPMOST,(int)(fromX+(toX-fromX)*p),(int)(fromY+(toY-fromY)*p),0,0,SWP_NOSIZE|SWP_NOACTIVATE);
        Sleep(12);
    }
    if(!show) {
        ShowWindow(g_window,SW_HIDE);
        if(g_controller) g_controller->put_IsVisible(FALSE);
        SetWindowPos(g_window,nullptr,g_target.left,g_target.top,width,height,SWP_NOZORDER|SWP_NOACTIVATE);
    }
    if(g_controller) g_controller->NotifyParentWindowPositionChanged();
    g_visible = show;
    SetTimer(g_window,kTickTimer,show?1000:60000,nullptr);
    if(g_webview) g_webview->ExecuteScript(show
        ? L"window.nativeTick&&window.nativeTick()"
        : L"window.nativeTick&&window.nativeTick(false)", nullptr);
    if(show && !g_mouseHook) {
        g_mouseHook=SetWindowsHookExW(WH_MOUSE_LL,outsideMouse,GetModuleHandleW(nullptr),0);
        if(!g_mouseHook) logStartup(L"Outside-click listener unavailable");
    } else if(!show && g_mouseHook) {
        UnhookWindowsHookEx(g_mouseHook);
        g_mouseHook=nullptr;
    }
    g_animating=false;
}

LRESULT CALLBACK outsideMouse(int code, WPARAM message, LPARAM data) {
    if(code==HC_ACTION && g_visible && !g_animating && !g_trayMenuOpen &&
       (message==WM_LBUTTONDOWN || message==WM_RBUTTONDOWN || message==WM_MBUTTONDOWN)) {
        const POINT point=reinterpret_cast<MSLLHOOKSTRUCT*>(data)->pt;
        PostMessageW(g_window,kOutsideClick,0,MAKELPARAM(point.x,point.y));
    }
    return CallNextHookEx(g_mouseHook,code,message,data);
}

void copyTextToClipboard(const std::wstring& value) {
    bool success=false;
    if(OpenClipboard(g_window)) {
        if(EmptyClipboard()) {
            const SIZE_T bytes=(value.size()+1)*sizeof(wchar_t);
            HGLOBAL block=GlobalAlloc(GMEM_MOVEABLE,bytes);
            if(block) {
                void* data=GlobalLock(block);
                if(data) {
                    memcpy(data,value.c_str(),bytes);
                    GlobalUnlock(block);
                    if(SetClipboardData(CF_UNICODETEXT,block)) success=true;
                }
                if(!success) GlobalFree(block);
            }
        }
        CloseClipboard();
    }
    if(g_webview) g_webview->PostWebMessageAsJson(success?L"{\"type\":\"copyResult\",\"success\":true}":L"{\"type\":\"copyResult\",\"success\":false}");
}

std::wstring shortcutKeyName(UINT key) {
    if ((key >= '0' && key <= '9') || (key >= 'A' && key <= 'Z'))
        return std::wstring(1,static_cast<wchar_t>(key));
    if (key >= VK_NUMPAD0 && key <= VK_NUMPAD9) return L"Num " + std::to_wstring(key-VK_NUMPAD0);
    if (key >= VK_F1 && key <= VK_F20) return L"F" + std::to_wstring(key-VK_F1+1);
    switch (key) {
        case VK_BACK: return L"Backspace"; case VK_TAB: return L"Tab";
        case VK_RETURN: return L"Enter"; case VK_ESCAPE: return L"Escape";
        case VK_SPACE: return L"Space"; case VK_PRIOR: return L"Page Up";
        case VK_NEXT: return L"Page Down"; case VK_END: return L"End";
        case VK_HOME: return L"Home"; case VK_LEFT: return L"←";
        case VK_UP: return L"↑"; case VK_RIGHT: return L"→"; case VK_DOWN: return L"↓";
        case VK_INSERT: return L"Insert"; case VK_DELETE: return L"Delete";
        case VK_MULTIPLY: return L"Num *"; case VK_ADD: return L"Num +";
        case VK_SEPARATOR: return L"Num Enter"; case VK_SUBTRACT: return L"Num −";
        case VK_DECIMAL: return L"Num ."; case VK_DIVIDE: return L"Num /";
        case VK_OEM_1: return L";"; case VK_OEM_PLUS: return L"=";
        case VK_OEM_COMMA: return L","; case VK_OEM_MINUS: return L"−";
        case VK_OEM_PERIOD: return L"."; case VK_OEM_2: return L"/";
        case VK_OEM_3: return L"`"; case VK_OEM_4: return L"[";
        case VK_OEM_5: return L"\\"; case VK_OEM_6: return L"]";
        case VK_OEM_7: return L"'"; case 1001: return L"Mouse 4";
        case 1002: return L"Mouse 5";
        default: return L"Key " + std::to_wstring(key);
    }
}

std::wstring shortcutLabel() {
    std::wstring label;
    if (g_hotkeyModifiers&MOD_CONTROL) label += L"Ctrl+";
    if (g_hotkeyModifiers&MOD_ALT) label += L"Alt+";
    if (g_hotkeyModifiers&MOD_SHIFT) label += L"Shift+";
    return label + shortcutKeyName(g_hotkeyKey);
}

void trayMenu() {
    g_trayMenuOpen=true;
    POINT point{}; GetCursorPos(&point);
    HMENU menu = CreatePopupMenu();
    const std::wstring toggleCaption=std::wstring(g_visible ? L"Скрыть\t" : L"Открыть\t")+shortcutLabel();
    AppendMenuW(menu, MF_STRING, 1, toggleCaption.c_str());
    AppendMenuW(menu, MF_SEPARATOR, 0, nullptr);
    AppendMenuW(menu, MF_STRING, 2, L"Выход");
    SetForegroundWindow(g_window);
    UINT result = TrackPopupMenu(menu, TPM_RETURNCMD|TPM_RIGHTBUTTON, point.x, point.y, 0, g_window, nullptr);
    DestroyMenu(menu);
    g_trayMenuOpen=false;
    if (result == 1) showWidget(!g_visible);
    if (result == 2) PostMessageW(g_window, WM_CLOSE, 0, 0);
}

struct UpdateDownloadResult { std::filesystem::path path; bool success=false; };

bool matchesSha256(const std::filesystem::path& path, const std::wstring& expected) {
    std::ifstream input(path, std::ios::binary | std::ios::ate);
    if (!input) return false;
    const auto size=input.tellg();
    if (size <= 0 || size > 100 * 1024 * 1024) return false;
    std::vector<unsigned char> bytes(static_cast<size_t>(size));
    input.seekg(0);
    if (!input.read(reinterpret_cast<char*>(bytes.data()), size)) return false;
    BCRYPT_ALG_HANDLE algorithm{};
    if (BCryptOpenAlgorithmProvider(&algorithm, BCRYPT_SHA256_ALGORITHM, nullptr, 0) < 0) return false;
    unsigned char hash[32]{};
    const auto status=BCryptHash(algorithm, nullptr, 0, bytes.data(), static_cast<ULONG>(bytes.size()), hash, sizeof(hash));
    BCryptCloseAlgorithmProvider(algorithm, 0);
    if (status < 0) return false;
    const wchar_t digits[]=L"0123456789abcdef";
    std::wstring actual=L"sha256:";
    for (const auto byte:hash) {actual+=digits[byte >> 4]; actual+=digits[byte & 15];}
    return _wcsicmp(actual.c_str(), expected.c_str()) == 0;
}

void downloadUpdate(const std::wstring& tag, const std::wstring& digest) {
    if (!std::regex_match(tag, std::wregex(LR"(^v\d+\.\d+\.\d+$)")) ||
        !std::regex_match(digest, std::wregex(LR"(^sha256:[0-9a-fA-F]{64}$)")) ||
        g_updateDownloading.exchange(true)) return;
    std::thread([tag,digest] {
        auto* result=new UpdateDownloadResult();
        const auto fileName=L"WorldClockWidget-Setup-"+tag+L".exe";
        const auto url=L"https://github.com/CandFlip/world-clock-widget/releases/download/"+tag+L"/"+fileName;
        const HRESULT initialized=CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
        try {
            auto directory=dataDir()/L"updates";
            std::filesystem::create_directories(directory);
            result->path=directory/fileName;
            result->success=SUCCEEDED(URLDownloadToFileW(nullptr,url.c_str(),result->path.c_str(),0,nullptr)) &&
                matchesSha256(result->path,digest);
            if (!result->success) std::filesystem::remove(result->path);
        } catch (...) { result->success=false; }
        if (SUCCEEDED(initialized)) CoUninitialize();
        g_updateDownloading=false;
        if (!PostMessageW(g_window,kUpdateDownloaded,0,reinterpret_cast<LPARAM>(result))) delete result;
    }).detach();
}

void handleMessage(const std::wstring& message) {
    auto payload = [&](const wchar_t* prefix) -> std::wstring {
        size_t n = wcslen(prefix); return message.size() > n ? message.substr(n) : L"";
    };
    if (message == L"ready") {
        postInitialState();
    }
    else if(message == L"rendered") {
        g_uiReady=true;
        g_uiLoadAttempts=0;
        KillTimer(g_window,kUiReadyTimer);
        logStartup(L"UI ready");
        if(g_showWhenReady) { g_showWhenReady=false; showWidget(true); }
        else if(!g_visible && g_webview) {
            g_webview->ExecuteScript(L"window.nativeTick&&window.nativeTick(false)", nullptr);
        }
    }
    else if (message == L"drag") { ReleaseCapture(); SendMessageW(g_window, WM_NCLBUTTONDOWN, HTCAPTION, 0); }
    else if (message == L"resize") { ReleaseCapture(); SendMessageW(g_window, WM_NCLBUTTONDOWN, HTBOTTOMRIGHT, 0); }
    else if (message.rfind(L"resize:", 0) == 0) {
        const auto edge = message.substr(7);
        int hit = 0;
        if (edge == L"n") hit = HTTOP;
        else if (edge == L"s") hit = HTBOTTOM;
        else if (edge == L"w") hit = HTLEFT;
        else if (edge == L"e") hit = HTRIGHT;
        else if (edge == L"nw") hit = HTTOPLEFT;
        else if (edge == L"ne") hit = HTTOPRIGHT;
        else if (edge == L"sw") hit = HTBOTTOMLEFT;
        else if (edge == L"se") hit = HTBOTTOMRIGHT;
        if (hit) { ReleaseCapture(); SendMessageW(g_window, WM_NCLBUTTONDOWN, hit, GetMessagePos()); }
    }
    else if (message == L"hide") showWidget(false);
    else if (message == L"show") showWidget(true);
    else if (message.rfind(L"scheduleTick\n", 0) == 0 && !g_visible) {
        const std::wstring value=message.substr(wcslen(L"scheduleTick\n"));
        try {
            if(!value.empty() && value.find_first_not_of(L"0123456789")==std::wstring::npos)
                SetTimer(g_window,kTickTimer,std::clamp(std::stoul(value),1000UL,60000UL),nullptr);
        } catch (...) {}
    }
    else if (message == L"quit") PostMessageW(g_window, WM_CLOSE, 0, 0);
    else if (message == L"beginHotkeyCapture") g_capturingHotkey=true;
    else if (message == L"endHotkeyCapture") g_capturingHotkey=false;
    else if (message.rfind(L"setHotkey\n", 0) == 0) {
        const auto choice=payload(L"setHotkey\n");
        UINT modifiers=0,key=0;
        bool valid=false;
        const std::wregex pattern(LR"(^(\d+),(\d+)$)");
        std::wsmatch match;
        if(std::regex_match(choice,match,pattern)) {
            try {modifiers=std::stoul(match[1].str()); key=std::stoul(match[2].str()); valid=true;} catch (...) {}
        }
        postHotkeyResult(valid && registerHotkey(modifiers,key));
    }
    else if (message.rfind(L"saveConfig\n", 0) == 0) writeUtf8Atomic(dataDir()/L"widget_config.json", payload(L"saveConfig\n"));
    else if (message.rfind(L"saveReminders\n", 0) == 0) writeUtf8Atomic(dataDir()/L"reminders.json", payload(L"saveReminders\n"));
    else if (message.rfind(L"copyText\n", 0) == 0) copyTextToClipboard(payload(L"copyText\n"));
    else if (message.rfind(L"saveSyncCredential\n", 0) == 0 && !writeSyncCredential(payload(L"saveSyncCredential\n"))) logStartup(L"Failed to store sync credential");
    else if (message == L"deleteSyncCredential") {
#ifndef WORLD_CLOCK_QA
        CredDeleteW(kSyncCredentialTarget, CRED_TYPE_GENERIC, 0);
#endif
    }
    else if (message.rfind(L"openExternal\n", 0) == 0) {
        const auto url = payload(L"openExternal\n");
        if (url.rfind(L"https://", 0) == 0) ShellExecuteW(g_window, L"open", url.c_str(), nullptr, nullptr, SW_SHOWNORMAL);
    }
    else if (message.rfind(L"downloadUpdate\n", 0) == 0) {
        const auto argument=payload(L"downloadUpdate\n");
        const auto separator=argument.find(L'\n');
        if (separator != std::wstring::npos) downloadUpdate(argument.substr(0,separator),argument.substr(separator+1));
    }
    else if (message.rfind(L"setStartup\n", 0) == 0 && !setStartupEnabled(payload(L"setStartup\n") == L"1")) logStartup(L"Failed to update Windows startup setting");
    else if (message == L"systemBeep" || message == L"beep") {
#ifndef WORLD_CLOCK_QA
        MessageBeep(MB_ICONEXCLAMATION);
#endif
    }
}

void initializeWebView() {
    auto userData = (dataDir()/L"WebView2").wstring();
    auto* environmentHandler = new EnvironmentHandler(
        [](HRESULT result, ICoreWebView2Environment* environment)->HRESULT {
            if (FAILED(result) || !environment) { logStartup(L"WebView2 environment failed: " + std::to_wstring(result)); return result; }
            auto* controllerHandler = new ControllerHandler(
                [](HRESULT result, ICoreWebView2Controller* controller)->HRESULT {
                    if (FAILED(result) || !controller) { logStartup(L"WebView2 controller failed: " + std::to_wstring(result)); return result; }
                    g_controller = controller; controller->put_IsVisible(g_visible?TRUE:FALSE); controller->get_CoreWebView2(&g_webview);
                    ComPtr<ICoreWebView2Controller2> controller2;
                    if (SUCCEEDED(controller->QueryInterface(IID_ICoreWebView2Controller2, reinterpret_cast<void**>(controller2.GetAddressOf())))) {
                        COREWEBVIEW2_COLOR background{255, 11, 14, 20};
                        controller2->put_DefaultBackgroundColor(background);
                    }
                    setBounds();
                    ComPtr<ICoreWebView2Settings> settings; g_webview->get_Settings(&settings);
                    settings->put_AreDefaultContextMenusEnabled(FALSE);
                    settings->put_AreDevToolsEnabled(FALSE);
                    settings->put_IsStatusBarEnabled(FALSE);
                    auto* messageHandler = new MessageHandler(
                        [](ICoreWebView2*, ICoreWebView2WebMessageReceivedEventArgs* args)->HRESULT {
                            LPWSTR raw{}; if (SUCCEEDED(args->TryGetWebMessageAsString(&raw)) && raw) { handleMessage(raw); CoTaskMemFree(raw); }
                            return S_OK;
                        });
                    EventRegistrationToken token{}; g_webview->add_WebMessageReceived(messageHandler, &token); messageHandler->Release();
                    auto* audioPermissionHandler = new AudioPermissionHandler();
                    EventRegistrationToken audioToken{};
                    g_webview->add_PermissionRequested(audioPermissionHandler, &audioToken);
                    audioPermissionHandler->Release();
                    auto page = (exeDir()/L"ui"/L"index.html").wstring();
                    std::wstring uri = L"file:///";
                    for (wchar_t ch : page) uri += ch == L'\\' ? L'/' : ch;
                    g_uiReady=false;
                    g_uiLoadAttempts=0;
                    g_webview->Navigate(uri.c_str());
                    SetTimer(g_window,kUiReadyTimer,5000,nullptr);
                    logStartup(L"UI navigation started");
                    return S_OK;
                });
            HRESULT created=environment->CreateCoreWebView2Controller(g_window,controllerHandler); controllerHandler->Release(); return created;
        });
    HRESULT created=CreateCoreWebView2EnvironmentWithOptions(nullptr,userData.c_str(),nullptr,environmentHandler);
    environmentHandler->Release();
}

DWORD WINAPI eventWatcher(void*) {
    HANDLE events[]{g_showEvent, g_shutdownEvent};
    while (true) {
        DWORD value = WaitForMultipleObjects(2, events, FALSE, INFINITE);
        if (value == WAIT_OBJECT_0) PostMessageW(g_window, kShowMessage, 0, 0);
        else { PostMessageW(g_window, kShutdownMessage, 0, 0); break; }
    }
    return 0;
}

LRESULT CALLBACK windowProc(HWND window, UINT message, WPARAM wParam, LPARAM lParam) {
    if(g_taskbarCreatedMessage && message==g_taskbarCreatedMessage) {
        g_trayAdded=false;
        retryTrayIcon();
        return 0;
    }
    switch (message) {
        case WM_NCCALCSIZE: if (wParam) return 0; break;
        case WM_NCHITTEST: {
            POINT pointer{GET_X_LPARAM(lParam), GET_Y_LPARAM(lParam)};
            RECT bounds{}; GetWindowRect(window, &bounds);
            const int border = MulDiv(7, static_cast<int>(GetDpiForWindow(window)), 96);
            const bool left = pointer.x < bounds.left + border;
            const bool right = pointer.x >= bounds.right - border;
            const bool top = pointer.y < bounds.top + border;
            const bool bottom = pointer.y >= bounds.bottom - border;
            if (top && left) return HTTOPLEFT;
            if (top && right) return HTTOPRIGHT;
            if (bottom && left) return HTBOTTOMLEFT;
            if (bottom && right) return HTBOTTOMRIGHT;
            if (left) return HTLEFT;
            if (right) return HTRIGHT;
            if (top) return HTTOP;
            if (bottom) return HTBOTTOM;
            return HTCLIENT;
        }
        case WM_SIZE: setBounds(); return 0;
        case WM_EXITSIZEMOVE: if(!g_animating&&g_visible){GetWindowRect(window,&g_target);saveWindow();} return 0;
        case WM_GETMINMAXINFO: { auto* info=(MINMAXINFO*)lParam; info->ptMinTrackSize={400,320}; return 0; }
        case WM_HOTKEY: if (wParam==kHotkey) showWidget(!g_visible); return 0;
        case kShowMessage: showWidget(true); return 0;
        case WM_TIMECHANGE:
            if(!g_visible) SetTimer(window,kTickTimer,60000,nullptr);
            if(g_webview) g_webview->ExecuteScript(g_visible
                ? L"window.nativeTick&&window.nativeTick()"
                : L"window.nativeTick&&window.nativeTick(false)",nullptr);
            return 0;
        case WM_POWERBROADCAST:
            if(wParam==PBT_APMRESUMEAUTOMATIC || wParam==PBT_APMRESUMESUSPEND) {
                if(!g_visible) SetTimer(window,kTickTimer,60000,nullptr);
                if(g_webview) g_webview->ExecuteScript(g_visible
                    ? L"window.nativeTick&&window.nativeTick()"
                    : L"window.nativeTick&&window.nativeTick(false)",nullptr);
                return TRUE;
            }
            break;
        case kOutsideClick: {
            if(!g_visible || g_animating || g_trayMenuOpen) return 0;
            POINT point{GET_X_LPARAM(lParam),GET_Y_LPARAM(lParam)};
            RECT bounds{}; GetWindowRect(window,&bounds);
            if(PtInRect(&bounds,point)) return 0;
            NOTIFYICONIDENTIFIER icon{sizeof(NOTIFYICONIDENTIFIER)};
            icon.hWnd=window; icon.uID=1;
            RECT trayBounds{};
            if(SUCCEEDED(Shell_NotifyIconGetRect(&icon,&trayBounds)) && PtInRect(&trayBounds,point)) return 0;
            HWND clicked=GetAncestor(WindowFromPoint(point),GA_ROOT);
            if(clicked==window || GetWindow(clicked,GW_OWNER)==window) return 0;
            showWidget(false); return 0;
        }
        case kShutdownMessage: PostMessageW(window, WM_CLOSE, 0, 0); return 0;
        case kUpdateDownloaded: {
            std::unique_ptr<UpdateDownloadResult> result(reinterpret_cast<UpdateDownloadResult*>(lParam));
            const bool launched=result && result->success &&
                reinterpret_cast<INT_PTR>(ShellExecuteW(window,L"runas",result->path.c_str(),nullptr,nullptr,SW_SHOWNORMAL)) > 32;
            if (g_webview) g_webview->PostWebMessageAsJson(launched
                ? L"{\"type\":\"updateResult\",\"success\":true}"
                : L"{\"type\":\"updateResult\",\"success\":false}");
            if (launched) PostMessageW(window,WM_CLOSE,0,0);
            return 0;
        }
        case kTrayMessage:
            if (LOWORD(lParam)==WM_LBUTTONUP) showWidget(!g_visible);
            if (LOWORD(lParam)==WM_RBUTTONUP || LOWORD(lParam)==WM_CONTEXTMENU) trayMenu();
            return 0;
        case WM_TIMER:
            if (wParam==kUiReadyTimer) {
                if (g_uiReady) KillTimer(window,kUiReadyTimer);
                else if (g_webview && g_uiLoadAttempts < 3) {
                    ++g_uiLoadAttempts;
                    logStartup(L"UI ready timeout; reload attempt " + std::to_wstring(g_uiLoadAttempts));
                    g_webview->Reload();
                } else {
                    KillTimer(window,kUiReadyTimer);
                    logStartup(L"UI failed to become ready after retries");
                }
            } else if (wParam==kTickTimer && g_webview) {
                if(!g_visible) SetTimer(window,kTickTimer,60000,nullptr);
                g_webview->ExecuteScript(g_visible
                    ? L"window.nativeTick&&window.nativeTick()"
                    : L"window.nativeTick&&window.nativeTick(false)", nullptr);
            } else if(wParam==kTrayRetryTimer) {
                retryTrayIcon();
            }
            return 0;
        case WM_CLOSE:
            if(g_mouseHook){UnhookWindowsHookEx(g_mouseHook);g_mouseHook=nullptr;}
            if(g_shortcutKeyboardHook){UnhookWindowsHookEx(g_shortcutKeyboardHook);g_shortcutKeyboardHook=nullptr;}
            if(g_shortcutMouseHook){UnhookWindowsHookEx(g_shortcutMouseHook);g_shortcutMouseHook=nullptr;}
            saveWindow(); if(g_shutdownEvent)SetEvent(g_shutdownEvent); KillTimer(window,kTickTimer); KillTimer(window,kUiReadyTimer); KillTimer(window,kTrayRetryTimer);
            if(g_trayAdded)Shell_NotifyIconW(NIM_DELETE,&g_tray); DestroyWindow(window); return 0;
        case WM_DESTROY: PostQuitMessage(0); return 0;
    }
    return DefWindowProcW(window,message,wParam,lParam);
}
}

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR commandLine, int) {
#ifdef WORLD_CLOCK_QA
    wchar_t qaData[MAX_PATH]{};
    const DWORD qaLength=GetEnvironmentVariableW(L"WORLD_CLOCK_QA_DATA_DIR",qaData,MAX_PATH);
    if(qaLength == 0 || qaLength >= MAX_PATH || !std::filesystem::path(qaData).is_absolute()) return 7;
#endif
    g_startedByWindows = commandLine && wcsstr(commandLine,L"--startup");
    if(g_startedByWindows && !autostartAllowed()) return 0;
    g_visible = false;
    g_showWhenReady = !g_startedByWindows;
    HANDLE mutex=CreateMutexW(nullptr,TRUE,kMutexName);
    if (mutex && GetLastError()==ERROR_ALREADY_EXISTS) {
        HANDLE show=OpenEventW(EVENT_MODIFY_STATE,FALSE,kShowEventName); if(show){SetEvent(show);CloseHandle(show);} return 0;
    }
    logStartup(L"Process started");
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    CoInitializeEx(nullptr,COINIT_APARTMENTTHREADED);
    HICON appIcon=static_cast<HICON>(LoadImageW(instance,MAKEINTRESOURCEW(101),IMAGE_ICON,32,32,LR_DEFAULTCOLOR));
    HICON appSmallIcon=static_cast<HICON>(LoadImageW(instance,MAKEINTRESOURCEW(101),IMAGE_ICON,16,16,LR_DEFAULTCOLOR));
    if(!appIcon) appIcon=LoadIconW(nullptr,IDI_APPLICATION);
    if(!appSmallIcon) appSmallIcon=appIcon;
    WNDCLASSEXW wc{sizeof(wc)}; wc.hInstance=instance; wc.lpfnWndProc=windowProc; wc.lpszClassName=kClassName;
    wc.hIcon=appIcon; wc.hIconSm=appSmallIcon;
    wc.hCursor=LoadCursorW(nullptr,IDC_ARROW); wc.hbrBackground=(HBRUSH)GetStockObject(BLACK_BRUSH); RegisterClassExW(&wc);
    RECT p=loadWindow(); g_target=p;
    g_window=CreateWindowExW(WS_EX_TOPMOST|WS_EX_TOOLWINDOW,kClassName,L"World Clock Widget Native",
        WS_POPUP|WS_THICKFRAME,p.left,p.top,p.right-p.left,p.bottom-p.top,nullptr,nullptr,instance,nullptr);
    if(!g_window) return 2;
    const int cornerPreference = 2; // DWMWCP_ROUND on Windows 11; older systems ignore the request.
    DwmSetWindowAttribute(g_window, static_cast<DWMWINDOWATTRIBUTE>(33), &cornerPreference, sizeof(cornerPreference));
    const DWORD borderColor = 0xFFFFFFFE;
    DwmSetWindowAttribute(g_window, static_cast<DWMWINDOWATTRIBUTE>(34), &borderColor, sizeof(borderColor));
    setBounds();
    g_showEvent=CreateEventW(nullptr,FALSE,FALSE,kShowEventName); g_shutdownEvent=CreateEventW(nullptr,TRUE,FALSE,kShutdownEventName);
    g_watchThread=CreateThread(nullptr,0,eventWatcher,nullptr,0,nullptr);
    g_taskbarCreatedMessage=RegisterWindowMessageW(L"TaskbarCreated");
#ifdef WORLD_CLOCK_QA
    g_webViewInitializationStarted=true;
    initializeWebView();
#else
    g_shortcutKeyboardHook=SetWindowsHookExW(WH_KEYBOARD_LL,shortcutKeyboard,GetModuleHandleW(nullptr),0);
    g_shortcutMouseHook=SetWindowsHookExW(WH_MOUSE_LL,shortcutMouse,GetModuleHandleW(nullptr),0);
    loadHotkey();
    const UINT configuredModifiers=g_hotkeyModifiers, configuredKey=g_hotkeyKey;
    if(!registerHotkey(configuredModifiers,configuredKey)) {
        registerHotkey(MOD_ALT,VK_SPACE);
        logStartup(L"Configured hotkey unavailable; using default");
    }
    g_tray.cbSize=sizeof(g_tray); g_tray.hWnd=g_window; g_tray.uID=1; g_tray.uFlags=NIF_MESSAGE|NIF_ICON|NIF_TIP;
    g_tray.uCallbackMessage=kTrayMessage; g_tray.hIcon=appSmallIcon; wcscpy_s(g_tray.szTip,L"World Clock Widget");
    if(g_startedByWindows) SetTimer(g_window,kTrayRetryTimer,500,nullptr);
    else retryTrayIcon();
#endif
    if(g_startedByWindows) {
        logStartup(L"Windows startup mode: background only");
    }
    SetTimer(g_window,kTickTimer,1000,nullptr);
    MSG msg{}; while(GetMessageW(&msg,nullptr,0,0)>0){TranslateMessage(&msg);DispatchMessageW(&msg);}
    if(g_showEvent)CloseHandle(g_showEvent); if(g_shutdownEvent)CloseHandle(g_shutdownEvent);
    if(g_watchThread){WaitForSingleObject(g_watchThread,1000);CloseHandle(g_watchThread);} if(mutex)CloseHandle(mutex);
    g_webview.Reset(); g_controller.Reset(); CoUninitialize(); return 0;
}
