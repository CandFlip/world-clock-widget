$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
    $PSNativeCommandUseErrorActionPreference = $false
}

function Test-PythonCandidate {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Exe,
        [Parameter(Mandatory = $true)]
        [string[]] $Prefix
    )

    $checkArgs = @($Prefix) + @("-c", "import sys; print(sys.version)")
    $null = & $Exe @checkArgs 2>$null
    return ($LASTEXITCODE -eq 0)
}

function Get-PythonRunner {
    $candidates = @(
        @{ Exe = "py"; Prefix = @("-3") },
        @{ Exe = "python"; Prefix = @() },
        @{ Exe = "python3"; Prefix = @() }
    )

    foreach ($candidate in $candidates) {
        if (Get-Command $candidate.Exe -ErrorAction SilentlyContinue) {
            if (Test-PythonCandidate -Exe $candidate.Exe -Prefix $candidate.Prefix) {
                return $candidate
            }
        }
    }

    throw "Не найден рабочий Python 3.9+. Установите Python с https://www.python.org/downloads/windows/ и отключите App execution aliases для python/python3 в Windows Settings > Apps > Advanced app settings > App execution aliases."
}

function Invoke-Python {
    param(
        [Parameter(Mandatory = $true)]
        [string[]] $ArgsList
    )

    $runner = Get-PythonRunner
    $previousErrorAction = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $output = & $runner.Exe @($runner.Prefix) @ArgsList 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorAction
    }

    if ($output) {
        foreach ($line in $output) {
            if ($line -is [System.Management.Automation.ErrorRecord]) {
                Write-Host $line.ToString()
            }
            else {
                Write-Host $line
            }
        }
    }

    if ($exitCode -ne 0) {
        throw "Ошибка выполнения: $($runner.Exe) $($runner.Prefix -join ' ') $($ArgsList -join ' ') (exit code: $exitCode)"
    }
}

Write-Host "[1/3] Installing dependencies..."
try {
    Invoke-Python -ArgsList @("-m", "pip", "install", "--upgrade", "--no-warn-script-location", "pip")
}
catch {
    Write-Host "Предупреждение: не удалось обновить pip, продолжаю..." -ForegroundColor Yellow
}

Invoke-Python -ArgsList @("-m", "ensurepip", "--upgrade")
Invoke-Python -ArgsList @("-m", "pip", "install", "--no-warn-script-location", "-r", "requirements.txt")

Write-Host "[2/3] Building EXE with PyInstaller..."
Invoke-Python -ArgsList @(
    "-m", "PyInstaller",
    "--noconfirm",
    "--clean",
    "--onefile",
    "--windowed",
    "--name", "WorldClockWidget",
    "--collect-data", "tzdata",
    "--add-data", "assets;assets",
    "world_clock_widget.py"
)

Write-Host "[3/3] Done. EXE: $PSScriptRoot\\dist\\WorldClockWidget.exe"
