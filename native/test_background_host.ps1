$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent $PSScriptRoot
$toolchain = Join-Path $env:LOCALAPPDATA 'WorldClockWidgetBuildTools\llvm-mingw-20260826-ucrt-x86_64'
$sdk = Join-Path $env:LOCALAPPDATA 'WorldClockWidgetBuildTools\WebView2SDK-1.0.4191.47'
$compiler = Join-Path $toolchain 'bin\clang++.exe'
$include = Join-Path $sdk 'build\native\include'
$loader = Join-Path $sdk 'build\native\x64\WebView2Loader.dll.lib'
$loaderDll = Join-Path $sdk 'build\native\x64\WebView2Loader.dll'
$qaRoot = Join-Path $env:TEMP ('WorldClockWidgetQA-' + [guid]::NewGuid().ToString('N'))
$qaData = Join-Path $qaRoot 'data'
$qaUi = Join-Path $qaRoot 'ui'
$qaExe = Join-Path $qaRoot 'WorldClockWidgetQA.exe'
$userData = Join-Path $env:LOCALAPPDATA 'WorldClockWidget'
$protected = @('widget_config.json', 'reminders.json')
$before = @{}
foreach ($name in $protected) {
    $path = Join-Path $userData $name
    $before[$name] = if (Test-Path -LiteralPath $path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash } else { '<absent>' }
}
$run = Get-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$runBefore = @{}
foreach ($name in $run.GetValueNames()) { $runBefore[$name] = $run.GetValue($name) }

New-Item -ItemType Directory -Path $qaData, $qaUi | Out-Null
$alarmAt = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() + 12
$fixture = @{
    lead = 15
    entries = @(@{
        id = 'isolated-background-qa'; alarm = $alarmAt; target = $alarmAt
        state = 'pending'; lead = 0; direction = 'after'; zone = 'Etc/UTC'
        city_key = 'Etc/UTC'; city = 'QA'; source_type = 'city'
        started_at = $alarmAt - 12; repeat = 'none'; title = 'QA'
    })
}
$utf8 = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText((Join-Path $qaData 'reminders.json'), ($fixture | ConvertTo-Json -Depth 8), $utf8)
[System.IO.File]::WriteAllText((Join-Path $qaData 'widget_config.json'), '{"settings":{"autostart":true},"sync":{"enabled":false}}', $utf8)
Copy-Item -Path (Join-Path $PSScriptRoot 'ui\*') -Destination $qaUi -Recurse -Force
Copy-Item -LiteralPath (Join-Path $repository 'assets\fonts\Inter-Variable.ttf') -Destination $qaUi
Copy-Item -LiteralPath $loaderDll -Destination $qaRoot

& $compiler -std=c++20 -Os -s -static -municode -mwindows `
    -DUNICODE -D_UNICODE -DWIN32_LEAN_AND_MEAN -D_WIN32_WINNT=0x0A00 -DWORLD_CLOCK_QA `
    "-I$include" (Join-Path $PSScriptRoot 'webview_host.cpp') $loader -o $qaExe `
    -lole32 -lshell32 -luuid -luser32 -lgdi32 -ladvapi32 -ldwmapi -lurlmon -lbcrypt
if ($LASTEXITCODE -ne 0) { throw 'QA host build failed' }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WorldClockQATestWin32 {
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr OpenEvent(uint access, bool inherit, string name);
    [DllImport("kernel32.dll")] public static extern bool SetEvent(IntPtr handle);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@

$qaProcess = $null
$previousData = [Environment]::GetEnvironmentVariable('WORLD_CLOCK_QA_DATA_DIR', 'Process')
try {
    $env:WORLD_CLOCK_QA_DATA_DIR = $qaData
    $qaProcess = Start-Process -FilePath $qaExe -ArgumentList '--startup' -WindowStyle Hidden -PassThru
    [Environment]::SetEnvironmentVariable('WORLD_CLOCK_QA_DATA_DIR', $previousData, 'Process')
    $readyDeadline = (Get-Date).AddSeconds(9)
    do {
        Start-Sleep -Milliseconds 150
        if ($qaProcess.HasExited) { throw "QA host exited early: $($qaProcess.ExitCode)" }
        $log = Join-Path $qaData 'startup.log'
        $ready = (Test-Path -LiteralPath $log) -and ((Get-Content -LiteralPath $log -Raw) -like '*UI ready*')
    } while (-not $ready -and (Get-Date) -lt $readyDeadline)
    if (-not $ready) { throw 'QA UI was not ready within 9 seconds' }
    $window = (Get-Process -Id $qaProcess.Id).MainWindowHandle
    if ($window -ne [IntPtr]::Zero -and [WorldClockQATestWin32]::IsWindowVisible($window)) {
        throw 'QA window became visible before reminder'
    }

    $ringDeadline = [DateTimeOffset]::FromUnixTimeSeconds($alarmAt).LocalDateTime.AddSeconds(3)
    $rang = $false
    do {
        Start-Sleep -Milliseconds 100
        if ($qaProcess.HasExited) { throw "QA host exited before reminder: $($qaProcess.ExitCode)" }
        $window = (Get-Process -Id $qaProcess.Id).MainWindowHandle
        $rang = $window -ne [IntPtr]::Zero -and [WorldClockQATestWin32]::IsWindowVisible($window)
    } while (-not $rang -and (Get-Date) -lt $ringDeadline)
    if (-not $rang) { throw 'Hidden reminder failed to show the QA window' }
    $state = Get-Content -LiteralPath (Join-Path $qaData 'reminders.json') -Raw | ConvertFrom-Json
    if ($state.entries[0].state -ne 'ringing') { throw 'Reminder did not enter ringing state' }
    Write-Output "QA PASS: hidden reminder rang, window opened, state persisted in $qaData"
} finally {
    [Environment]::SetEnvironmentVariable('WORLD_CLOCK_QA_DATA_DIR', $previousData, 'Process')
    if ($qaProcess -and -not $qaProcess.HasExited) {
        $handle = [WorldClockQATestWin32]::OpenEvent(2, $false, 'Local\WorldClockWidgetQAShutdown')
        if ($handle -ne [IntPtr]::Zero) {
            [void][WorldClockQATestWin32]::SetEvent($handle)
            [void][WorldClockQATestWin32]::CloseHandle($handle)
            [void]$qaProcess.WaitForExit(3000)
        }
        if (-not $qaProcess.HasExited) { Stop-Process -Id $qaProcess.Id -Force }
    }
    foreach ($name in $protected) {
        $path = Join-Path $userData $name
        $after = if (Test-Path -LiteralPath $path) { (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash } else { '<absent>' }
        if ($before[$name] -ne $after) { throw "Real user file changed during QA: $name" }
    }
    $runAfter = Get-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
    if ($runAfter.GetValueNames().Count -ne $runBefore.Count) { throw 'Run value count changed during QA' }
    foreach ($name in $runBefore.Keys) {
        if ($runAfter.GetValue($name) -ne $runBefore[$name]) { throw "Run value changed during QA: $name" }
    }
}
