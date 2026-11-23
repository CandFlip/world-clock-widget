#pragma once

#include <appmodel.h>
#include <asyncinfo.h>
#include <roapi.h>
#include <winstring.h>

namespace storeStartup {
// ABI declarations for the Windows Runtime interfaces absent from mingw-w64.
inline constexpr wchar_t taskId[] = L"WorldClockConnectStartup";
inline constexpr INT32 startupActivationKind = 1020;

struct ActivatedEventArgs : IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Kind(INT32*) = 0;
};

struct AppInstanceStatics : IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_RecommendedInstance(IInspectable**) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetActivatedEventArgs(ActivatedEventArgs**) = 0;
};

struct StartupTask : IInspectable {
    virtual HRESULT STDMETHODCALLTYPE RequestEnableAsync(IInspectable**) = 0;
    virtual HRESULT STDMETHODCALLTYPE Disable() = 0;
    virtual HRESULT STDMETHODCALLTYPE get_State(INT32*) = 0;
};

struct StartupTaskStatics : IInspectable {
    virtual HRESULT STDMETHODCALLTYPE GetForCurrentPackageAsync(IInspectable**) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetAsync(HSTRING, IInspectable**) = 0;
};

template<class Result>
struct AsyncOperation : IInspectable {
    virtual HRESULT STDMETHODCALLTYPE put_Completed(IUnknown*) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Completed(IUnknown**) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetResults(Result*) = 0;
};

template<class Result>
HRESULT waitForResult(IInspectable* operation, Result* result) {
    ComPtr<IAsyncInfo> info;
    HRESULT hr = operation->QueryInterface(IID_PPV_ARGS(&info));
    if (FAILED(hr)) return hr;
    const auto deadline = GetTickCount64() + 3000;
    for (;;) {
        AsyncStatus status;
        hr = info->get_Status(&status);
        if (FAILED(hr)) return hr;
        if (status == AsyncStatus::Completed)
            return static_cast<AsyncOperation<Result>*>(operation)->GetResults(result);
        if (status != AsyncStatus::Started) return E_FAIL;
        if (GetTickCount64() >= deadline) return HRESULT_FROM_WIN32(ERROR_TIMEOUT);
        Sleep(10);
    }
}

template<class Interface, size_t Length>
HRESULT getFactory(const wchar_t (&name)[Length], const GUID& id, ComPtr<Interface>& result) {
    HSTRING_HEADER header{};
    HSTRING className{};
    HRESULT hr = WindowsCreateStringReference(name, Length - 1, &header, &className);
    if (FAILED(hr)) return hr;
    return RoGetActivationFactory(className, id, reinterpret_cast<void**>(result.GetAddressOf()));
}

inline bool isStartupActivation() {
    constexpr GUID id{0x9d11e77f,0x9ea6,0x47af,{0xa6,0xec,0x46,0x78,0x4c,0x5b,0xa2,0x54}};
    ComPtr<AppInstanceStatics> factory;
    if (FAILED(getFactory(L"Windows.ApplicationModel.AppInstance", id, factory))) return false;
    ComPtr<ActivatedEventArgs> args;
    INT32 kind{};
    return SUCCEEDED(factory->GetActivatedEventArgs(&args)) && args &&
        SUCCEEDED(args->get_Kind(&kind)) && kind == startupActivationKind;
}

enum State : INT32 { Unavailable = -1, Disabled = 0, DisabledByUser = 1,
                     Enabled = 2, DisabledByPolicy = 3, EnabledByPolicy = 4 };

inline INT32 queryOrChangeState(int requested) {
    constexpr GUID id{0xee5b60bd,0xa148,0x41a7,{0xb2,0x6e,0xe8,0xb8,0x8a,0x1e,0x62,0xf8}};
    ComPtr<StartupTaskStatics> factory;
    if (FAILED(getFactory(L"Windows.ApplicationModel.StartupTask", id, factory))) return Unavailable;
    HSTRING_HEADER header{};
    HSTRING taskName{};
    if (FAILED(WindowsCreateStringReference(taskId, ARRAYSIZE(taskId) - 1, &header, &taskName)))
        return Unavailable;
    ComPtr<IInspectable> operation;
    if (FAILED(factory->GetAsync(taskName, &operation)) || !operation) return Unavailable;
    ComPtr<StartupTask> task;
    if (FAILED(waitForResult(operation.Get(), task.GetAddressOf())) || !task) return Unavailable;
    INT32 state{};
    if (FAILED(task->get_State(&state))) return Unavailable;
    if (requested == 0 && state == Enabled) task->Disable();
    if (requested == 1 && state == Disabled) {
        ComPtr<IInspectable> enable;
        if (SUCCEEDED(task->RequestEnableAsync(&enable)) && enable)
            waitForResult(enable.Get(), &state);
    }
    return SUCCEEDED(task->get_State(&state)) ? state : Unavailable;
}
}
