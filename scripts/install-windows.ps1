# MaxIDE APEX — Windows Per-User Desktop Installer
# Installs standalone MaxIDE APEX to %LOCALAPPDATA%\Programs\MaxIDE
# Creates Desktop Shortcut, Start Menu Shortcut, and registers CLI in User PATH.

$ErrorActionPreference = 'Stop'

$SourceRoot = Split-Path -Parent $PSScriptRoot
$InstallDir = Join-Path $env:LOCALAPPDATA "Programs\MaxIDE"

Write-Host "Installing MaxIDE APEX from $SourceRoot to $InstallDir..."

if (-not (Test-Path (Join-Path $SourceRoot "dist\server\index.js"))) {
  throw "Build output dist\server\index.js not found. Run 'npm run package' first."
}
if (-not (Test-Path (Join-Path $SourceRoot "MaxIDE.exe"))) {
  throw "Packaged executable MaxIDE.exe not found. Run 'npm run package' first."
}

# Stop any running MaxIDE.exe from previous install
Get-Process -Name "MaxIDE" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Prepare installation directory
if (-not (Test-Path $InstallDir)) {
  New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# Copy executable, package manifest, compiled dist, bin, and runtime node_modules
Copy-Item -Path (Join-Path $SourceRoot "MaxIDE.exe") -Destination (Join-Path $InstallDir "MaxIDE.exe") -Force
Copy-Item -Path (Join-Path $SourceRoot "package.json") -Destination (Join-Path $InstallDir "package.json") -Force

$DistDest = Join-Path $InstallDir "dist"
if (Test-Path $DistDest) { Remove-Item -Path $DistDest -Recurse -Force }
Copy-Item -Path (Join-Path $SourceRoot "dist") -Destination $DistDest -Recurse -Force

$BinDest = Join-Path $InstallDir "bin"
if (Test-Path $BinDest) { Remove-Item -Path $BinDest -Recurse -Force }
if (Test-Path (Join-Path $SourceRoot "bin")) {
  Copy-Item -Path (Join-Path $SourceRoot "bin") -Destination $BinDest -Recurse -Force
}

# Mirror node_modules using robocopy (fast, idempotent, handles long Windows paths)
$NodeModulesSrc = Join-Path $SourceRoot "node_modules"
$NodeModulesDest = Join-Path $InstallDir "node_modules"
$rc = Start-Process -FilePath "robocopy" -ArgumentList "`"$NodeModulesSrc`" `"$NodeModulesDest`" /MIR /NFL /NDL /NJH /NJS /NC /NS /NP" -Wait -PassThru -NoNewWindow
if ($rc.ExitCode -ge 8) {
  throw "robocopy failed copying node_modules with exit code $($rc.ExitCode)"
}

# Create Desktop & Start Menu shortcuts
$WshShell = New-Object -ComObject WScript.Shell
$DesktopDir = [Environment]::GetFolderPath('Desktop')
$StartMenuDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"

foreach ($TargetDir in @($DesktopDir, $StartMenuDir)) {
  if (Test-Path $TargetDir) {
    $LnkPath = Join-Path $TargetDir "MaxIDE APEX.lnk"
    $Shortcut = $WshShell.CreateShortcut($LnkPath)
    $Shortcut.TargetPath = Join-Path $InstallDir "MaxIDE.exe"
    $Shortcut.WorkingDirectory = $InstallDir
    $Shortcut.Description = "MaxIDE APEX — Autonomous AI Software Engineering Studio"
    $Shortcut.Save()
    Write-Host "Created shortcut: $LnkPath"
  }
}

# Add install directory & bin to User PATH if missing
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
$PathsToAdd = @($InstallDir, $BinDest)
$CurrentEntries = ($UserPath -split ';') | Where-Object { $_ -ne '' }
$Updated = $false
foreach ($p in $PathsToAdd) {
  if ($CurrentEntries -notcontains $p) {
    $CurrentEntries += $p
    $Updated = $true
  }
}
if ($Updated) {
  [Environment]::SetEnvironmentVariable("Path", ($CurrentEntries -join ';'), "User")
  Write-Host "Registered MaxIDE in User PATH."
}

Write-Host ""
Write-Host "=============================================================="
Write-Host "  MaxIDE APEX installed successfully on your Windows device!"
Write-Host "  Install Dir:   $InstallDir"
Write-Host "  Desktop Icon:  $DesktopDir\MaxIDE APEX.lnk"
Write-Host "  Start Menu:    Search 'MaxIDE APEX'"
Write-Host "  CLI Command:   maxide"
Write-Host "=============================================================="
