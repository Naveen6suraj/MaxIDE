# MaxIDE - Production Windows Packaging & Distribution Script
$ErrorActionPreference = 'Stop'

$RepoRoot = (Get-Item $PSScriptRoot).Parent.FullName
Set-Location $RepoRoot

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "     MAXIDE WINDOWS PRODUCTION PACKAGING PIPELINE        " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Build TypeScript Backend
Write-Host "`n[1/6] Compiling TypeScript source..." -ForegroundColor Yellow
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw "TypeScript build failed" }

# 2. Compile Desktop Shell Launcher (MaxIDE.exe)
Write-Host "`n[2/6] Compiling native desktop launcher (MaxIDE.exe)..." -ForegroundColor Yellow
$cscPath = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
& $cscPath /target:winexe /out:dist\MaxIDE.exe /r:System.Windows.Forms.dll desktop\MaxIDE.cs
if ($LASTEXITCODE -ne 0) { throw "Launcher compilation failed" }
Copy-Item -Path "dist\MaxIDE.exe" -Destination "MaxIDE.exe" -Force

# 3. Create Clean Release Staging Root
$ReleaseRoot = Join-Path $RepoRoot "release"
if (Test-Path $ReleaseRoot) { Remove-Item -Path $ReleaseRoot -Recurse -Force }
New-Item -ItemType Directory -Force -Path $ReleaseRoot | Out-Null

$ReleaseDir = Join-Path $ReleaseRoot "MaxIDE"
New-Item -ItemType Directory -Force -Path $ReleaseDir | Out-Null

# 4. Compile Installer (MaxIDE-Setup.exe)
Write-Host "`n[3/6] Compiling native Windows installer (MaxIDE-Setup.exe)..." -ForegroundColor Yellow
$setupOut = Join-Path $ReleaseRoot "MaxIDE-Setup.exe"
& $cscPath /target:winexe "/out:$setupOut" /r:System.Windows.Forms.dll installer\MaxIDE-Setup.cs
if ($LASTEXITCODE -ne 0) { throw "Installer compilation failed" }

# 5. Assemble Standalone Package
Write-Host "`n[4/6] Assembling standalone package in: $ReleaseDir" -ForegroundColor Yellow

# MaxIDE.exe
Copy-Item -Path (Join-Path $RepoRoot "dist\MaxIDE.exe") -Destination (Join-Path $ReleaseDir "MaxIDE.exe")

# Bundled node.exe runtime
$SystemNode = (Get-Command node).Source
if (Test-Path $SystemNode) {
    Write-Host "   Bundling Node.js runtime from: $SystemNode" -ForegroundColor Green
    Copy-Item -Path $SystemNode -Destination (Join-Path $ReleaseDir "node.exe")
}

# Dist compiled files (agent, ai, config, projects, server, workspace)
New-Item -ItemType Directory -Force -Path (Join-Path $ReleaseDir "dist") | Out-Null
Get-ChildItem -Path (Join-Path $RepoRoot "dist") -Exclude "release" | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $ReleaseDir "dist") -Recurse
}

# UI Studio
New-Item -ItemType Directory -Force -Path (Join-Path $ReleaseDir "src\ui") | Out-Null
Copy-Item -Path (Join-Path $RepoRoot "src\ui\*") -Destination (Join-Path $ReleaseDir "src\ui") -Recurse

# CLI Wrappers (bin/maxide.js, bin/maxide.cmd)
Copy-Item -Path (Join-Path $RepoRoot "bin") -Destination (Join-Path $ReleaseDir "bin") -Recurse

# Data templates (clean providers & recent projects)
Copy-Item -Path (Join-Path $RepoRoot "data") -Destination (Join-Path $ReleaseDir "data") -Recurse

# Package manifest & docs
Copy-Item -Path (Join-Path $RepoRoot "package.json") -Destination (Join-Path $ReleaseDir "package.json")
if (Test-Path (Join-Path $RepoRoot "README.md")) {
    Copy-Item -Path (Join-Path $RepoRoot "README.md") -Destination (Join-Path $ReleaseDir "README.md")
}

# Production node_modules
Write-Host "   Copying node_modules runtime dependencies..." -ForegroundColor Green
Copy-Item -Path (Join-Path $RepoRoot "node_modules") -Destination (Join-Path $ReleaseDir "node_modules") -Recurse

# 6. Compress into Portable Zip Archive
$ZipPath = Join-Path $ReleaseRoot "MaxIDE-Windows-x64.zip"
Write-Host "`n[5/6] Creating portable ZIP archive: $ZipPath..." -ForegroundColor Yellow
Compress-Archive -Path "$ReleaseDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal

# 7. Mirror to dist/release for compatibility
New-Item -ItemType Directory -Force -Path (Join-Path $RepoRoot "dist\release") | Out-Null
Copy-Item -Path (Join-Path $ReleaseRoot "*") -Destination (Join-Path $RepoRoot "dist\release") -Recurse -Force

# 8. Report Distribution Artifacts
Write-Host "`n[6/6] Verifying packaged distribution artifacts..." -ForegroundColor Yellow
$Artifacts = @(
    (Get-Item $ZipPath),
    (Get-Item (Join-Path $ReleaseRoot "MaxIDE-Setup.exe")),
    (Get-Item (Join-Path $ReleaseDir "MaxIDE.exe")),
    (Get-Item (Join-Path $ReleaseDir "node.exe"))
)

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host "     MAXIDE PRODUCTION PACKAGING COMPLETE (100%)         " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
$Artifacts | Select-Object Name, @{Name="Size(MB)";Expression={[math]::Round($_.Length/1MB, 2)}}, LastWriteTime | Format-Table -AutoSize
