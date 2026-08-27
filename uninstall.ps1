$ErrorActionPreference = "Stop"

$installDir = Join-Path $env:LOCALAPPDATA "WorldClockWidget"
$exeTarget = Join-Path $installDir "WorldClockWidget.exe"
$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = Join-Path $startupDir "WorldClockWidget.lnk"

Write-Host "[1/3] Stopping app..."
Get-Process -Name "WorldClockWidget" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

Write-Host "[2/3] Removing autostart shortcut..."
if (Test-Path $shortcutPath) {
    Remove-Item -Path $shortcutPath -Force
}

Write-Host "[3/3] Removing installed files..."
if (Test-Path $installDir) {
    Remove-Item -Path $installDir -Recurse -Force
}

Write-Host "Uninstall completed."
Write-Host "Removed EXE: $exeTarget"
Write-Host "Removed shortcut: $shortcutPath"
