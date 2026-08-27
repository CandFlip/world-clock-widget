$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$exeSource = Join-Path $PSScriptRoot "dist\WorldClockWidget.exe"
if (-not (Test-Path $exeSource)) {
    Write-Host "EXE не найден. Запускаю автоматическую сборку..."
    & (Join-Path $PSScriptRoot "build_exe.ps1")
    if (-not (Test-Path $exeSource)) {
        throw "Не удалось собрать dist\\WorldClockWidget.exe"
    }
}

$installDir = Join-Path $env:LOCALAPPDATA "WorldClockWidget"
$exeTarget = Join-Path $installDir "WorldClockWidget.exe"
$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$shortcutPath = Join-Path $startupDir "WorldClockWidget.lnk"

Write-Host "[1/4] Stopping previous instance..."
Get-Process -Name "WorldClockWidget" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 600

Write-Host "[2/4] Copying files to $installDir"
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -Path $exeSource -Destination $exeTarget -Force

Write-Host "[3/4] Creating autostart shortcut..."
New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $exeTarget
$shortcut.WorkingDirectory = $installDir
$shortcut.IconLocation = "$exeTarget,0"
$shortcut.Description = "World Clock Widget"
$shortcut.Save()

Write-Host "[4/4] Launching app..."
Start-Process -FilePath $exeTarget

Write-Host "Installed successfully. Autostart enabled."
Write-Host "Installed EXE: $exeTarget"
Write-Host "Startup shortcut: $shortcutPath"
