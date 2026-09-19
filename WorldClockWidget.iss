#define MyAppName "World Clock Widget"
#define MyAppVersion "1.1.107"
#define MyAppExeName "WorldClockWidget.exe"
#define MyAppPublisher "CandFlip"
#define MyAppURL "https://github.com/CandFlip/world-clock-widget"

[Setup]
AppId=WorldClockWidget
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases/latest
DefaultDirName={autopf}\WorldClockWidget
UsePreviousAppDir=no
DefaultGroupName={#MyAppName}
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
OutputDir=release
OutputBaseFilename=WorldClockWidget-Setup-v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
DisableWelcomePage=yes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
CloseApplications=force
RestartApplications=no
SetupLogging=yes
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName}
VersionInfoProductName={#MyAppName}
VersionInfoVersion=1.1.107.0
SetupIconFile=native\app-icon.ico

[InstallDelete]
Type: files; Name: "{userstartup}\WorldClockWidget.lnk"
Type: files; Name: "{commonstartup}\World Clock Widget.lnk"

[Files]
Source: "native\dist-webview\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "native\installer\MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"

[Run]
Filename: "{tmp}\MicrosoftEdgeWebview2Setup.exe"; Parameters: "/silent /install"; StatusMsg: "Установка компонента Microsoft WebView2..."; Flags: waituntilterminated; Check: not WebView2Installed
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""WorldClockWidget"" /F"; Flags: runhidden waituntilterminated
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -WindowStyle Hidden -Command ""$identity = [Security.Principal.WindowsIdentity]::GetCurrent(); $enabled = '1'; $configPath = Join-Path $env:LOCALAPPDATA 'WorldClockWidget\widget_config.json'; if (Test-Path -LiteralPath $configPath) {{ try {{ $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json; if ($config.settings.autostart -eq $false) {{ $enabled = '0' } } catch {{ } }; @($identity.User.Value, $identity.Name, $enabled) | Set-Content -LiteralPath '{tmp}\WorldClockWidget-install-user.txt' -Encoding Unicode"""; Flags: runhidden waituntilterminated runasoriginaluser
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -WindowStyle Hidden -Command ""$identity = Get-Content -LiteralPath '{tmp}\WorldClockWidget-install-user.txt'; $sid = $identity[0]; $run = 'Registry::HKEY_USERS\' + $sid + '\Software\Microsoft\Windows\CurrentVersion\Run'; if (-not (Test-Path -LiteralPath $run)) {{ New-Item -Path $run -ErrorAction Stop | Out-Null }; if ($identity[2] -eq '1') {{ $command = [char]34 + '{app}\{#MyAppExeName}' + [char]34 + ' --startup'; Set-ItemProperty -Path $run -Name 'World Clock Widget' -Type String -Value $command } else {{ Remove-ItemProperty -Path $run -Name 'World Clock Widget' -ErrorAction SilentlyContinue }; Remove-ItemProperty -Path $run -Name 'WorldClockWidget' -ErrorAction SilentlyContinue; $meta = 'HKLM:\Software\WorldClockWidget'; if (-not (Test-Path -LiteralPath $meta)) {{ New-Item -Path $meta -ErrorAction Stop | Out-Null }; Set-ItemProperty -Path $meta -Name 'InstallUserSid' -Type String -Value $sid"""; Flags: runhidden waituntilterminated
Filename: "{app}\{#MyAppExeName}"; Description: "Запустить {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /T /IM {#MyAppExeName}"; Flags: runhidden waituntilterminated; RunOnceId: "StopWorldClockWidget"
Filename: "{sys}\schtasks.exe"; Parameters: "/Delete /TN ""WorldClockWidget"" /F"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveWorldClockWidgetScheduledTask"
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -NonInteractive -WindowStyle Hidden -Command ""$meta = 'HKLM:\Software\WorldClockWidget'; $sid = (Get-ItemProperty -Path $meta -Name 'InstallUserSid' -ErrorAction SilentlyContinue).InstallUserSid; if ($sid) {{ $run = 'Registry::HKEY_USERS\' + $sid + '\Software\Microsoft\Windows\CurrentVersion\Run'; Remove-ItemProperty -Path $run -Name 'World Clock Widget' -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $run -Name 'WorldClockWidget' -ErrorAction SilentlyContinue }; exit 0"""; Flags: runhidden waituntilterminated; RunOnceId: "RemoveWorldClockWidgetAutostart"
Filename: "{sys}\reg.exe"; Parameters: "DELETE ""HKLM\Software\WorldClockWidget"" /f"; Flags: runhidden waituntilterminated; RunOnceId: "RemoveWorldClockWidgetMetadata"

[UninstallDelete]
Type: files; Name: "{commonstartup}\World Clock Widget.lnk"
Type: files; Name: "{userstartup}\WorldClockWidget.lnk"

[Code]
const
  EVENT_MODIFY_STATE = $0002;
  WebView2ClientId = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';

function OpenEvent(dwDesiredAccess: LongWord; bInheritHandle: Boolean;
  lpName: String): THandle;
  external 'OpenEventW@kernel32.dll stdcall';
function SetEvent(hEvent: THandle): Boolean;
  external 'SetEvent@kernel32.dll stdcall';
function CloseHandle(hObject: THandle): Boolean;
  external 'CloseHandle@kernel32.dll stdcall';

procedure StopRunningWidget;
var
  ShutdownEvent: THandle;
begin
  ShutdownEvent := OpenEvent(EVENT_MODIFY_STATE, False, 'Local\WorldClockWidgetShutdown');
  if ShutdownEvent <> 0 then
  begin
    SetEvent(ShutdownEvent);
    CloseHandle(ShutdownEvent);
    Sleep(1000);
  end;
end;

function WebView2Installed: Boolean;
var
  Version: String;
begin
  Result :=
    (RegQueryStringValue(HKLM64, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\' + WebView2ClientId, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0')) or
    (RegQueryStringValue(HKCU, 'Software\Microsoft\EdgeUpdate\Clients\' + WebView2ClientId, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
  if not Result then
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
end;

procedure RemovePreviousPerUserInstall(const UninstallerPath: String);
var
  ResultCode: Integer;
begin
  if FileExists(UninstallerPath) then
    Exec(UninstallerPath,
      '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /FORCECLOSEAPPLICATIONS',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopRunningWidget;
  RemovePreviousPerUserInstall(ExpandConstant('{localappdata}\Programs\WorldClockWidget\unins000.exe'));
  RemovePreviousPerUserInstall(ExpandConstant('{localappdata}\WorldClockWidget\unins000.exe'));
  Result := '';
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    StopRunningWidget;
end;
