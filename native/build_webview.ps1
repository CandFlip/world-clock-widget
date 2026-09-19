$ErrorActionPreference = "Stop"
$toolchain = Join-Path $env:LOCALAPPDATA "WorldClockWidgetBuildTools\llvm-mingw-20260826-ucrt-x86_64"
$sdk = Join-Path $env:LOCALAPPDATA "WorldClockWidgetBuildTools\WebView2SDK-1.0.4191.47"
$compiler = Join-Path $toolchain "bin\clang++.exe"
$windres = Join-Path $toolchain "bin\llvm-windres.exe"
$include = Join-Path $sdk "build\native\include"
$loader = Join-Path $sdk "build\native\x64\WebView2Loader.dll.lib"
$loaderDll = Join-Path $sdk "build\native\x64\WebView2Loader.dll"
$output = Join-Path $PSScriptRoot "dist-webview"

$syncUrl = if ($env:WORLD_CLOCK_SYNC_URL) { $env:WORLD_CLOCK_SYNC_URL.TrimEnd('/') } else { "https://world-clock-widget-sync.uuuraaaaa.workers.dev" }
$runtime = "window.WORLD_CLOCK_SYNC_BACKEND = " + (ConvertTo-Json -Compress $syncUrl) + ";`n"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot "ui\sync_runtime.js"), $runtime, $utf8NoBom)

& py -3 (Join-Path $PSScriptRoot "generate_city_data.py")
if ($LASTEXITCODE -ne 0) { throw "City data generation failed" }
New-Item -ItemType Directory -Path $output -Force | Out-Null
$resource = Join-Path $output "version.res"
& $windres (Join-Path $PSScriptRoot "version.rc") -O coff -o $resource
if ($LASTEXITCODE -ne 0) { throw "Version resource failed" }

& $compiler -std=c++20 -Os -s -static -municode -mwindows `
  -DUNICODE -D_UNICODE -DWIN32_LEAN_AND_MEAN -D_WIN32_WINNT=0x0A00 `
  "-I$include" (Join-Path $PSScriptRoot "webview_host.cpp") $resource $loader `
  -o (Join-Path $output "WorldClockWidget.exe") `
  -lole32 -lshell32 -luuid -luser32 -lgdi32 -ladvapi32 -ldwmapi
if ($LASTEXITCODE -ne 0) { throw "Native WebView build failed" }

Copy-Item -LiteralPath $loaderDll -Destination $output -Force
Remove-Item -LiteralPath $resource -Force
$uiOut = Join-Path $output "ui"
New-Item -ItemType Directory -Path $uiOut -Force | Out-Null
Copy-Item -Path (Join-Path $PSScriptRoot "ui\*") -Destination $uiOut -Recurse -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "..\assets\fonts\Inter-Variable.ttf") -Destination $uiOut -Force
$size = (Get-ChildItem $output -Recurse -File | Measure-Object Length -Sum).Sum
Write-Host "Native parity build: $output ($([math]::Round($size/1MB,2)) MB)"
