$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function Test-PathState {
    param(
        [string] $Label,
        [string] $PathToCheck
    )

    if (Test-Path $PathToCheck) {
        Write-Host "[OK] ${Label}: $PathToCheck"
        return $true
    }

    Write-Host "[MISS] ${Label}: $PathToCheck" -ForegroundColor Yellow
    return $false
}

function Resolve-PythonCommand {
    $candidates = @(
        @{ Exe = "py"; Prefix = @("-3") },
        @{ Exe = "python"; Prefix = @() },
        @{ Exe = "python3"; Prefix = @() }
    )

    foreach ($candidate in $candidates) {
        if (Get-Command $candidate.Exe -ErrorAction SilentlyContinue) {
            $result = & $candidate.Exe @($candidate.Prefix) -c "import sys; print(sys.version)" 2>$null
            if ($LASTEXITCODE -eq 0) {
                return @{ Runner = $candidate; Version = $result }
            }
        }
    }

    return $null
}

Write-Host "=== WorldClockWidget Check ==="

$pythonInfo = Resolve-PythonCommand
if ($null -eq $pythonInfo) {
    Write-Host "[MISS] Python 3.9+ не найден" -ForegroundColor Red
}
else {
    Write-Host "[OK] Python: $($pythonInfo.Runner.Exe) $($pythonInfo.Runner.Prefix -join ' ')"
    Write-Host "     Version: $($pythonInfo.Version | Select-Object -First 1)"
}

$distExe = Join-Path $PSScriptRoot "dist\WorldClockWidget.exe"
$installDir = Join-Path $env:LOCALAPPDATA "WorldClockWidget"
$installedExe = Join-Path $installDir "WorldClockWidget.exe"
$startupLink = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\WorldClockWidget.lnk"

$okDist = Test-PathState -Label "Собранный EXE" -PathToCheck $distExe
$okInstalled = Test-PathState -Label "Установленный EXE" -PathToCheck $installedExe
$okStartup = Test-PathState -Label "Ярлык автозапуска" -PathToCheck $startupLink

$running = Get-Process -Name "WorldClockWidget" -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "[OK] Процесс запущен: WorldClockWidget"
}
else {
    Write-Host "[INFO] Процесс не запущен"
}

Write-Host "=== Summary ==="
if ($okDist -and $okInstalled -and $okStartup) {
    Write-Host "Проверка прошла: сборка/установка/автозапуск на месте." -ForegroundColor Green
    exit 0
}

Write-Host "Есть недостающие элементы. Запустите install.bat и повторите check_setup.bat" -ForegroundColor Yellow
exit 1
