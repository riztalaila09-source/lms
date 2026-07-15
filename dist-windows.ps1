# Build a Windows distribution of the LMS (single self-contained lms.exe + config,
# zipped) — the native-PowerShell equivalent of `make dist-windows`, so it works
# in plain PowerShell/cmd without `make` or Unix tools.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\dist-windows.ps1
#   .\dist-windows.ps1 -Version 1.0.0
param([string]$Version = "0.1.0")

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "==> Building frontend (npm run build)..." -ForegroundColor Cyan
Push-Location "$root\frontend"
npm run build
Pop-Location
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }

Write-Host "==> Building Windows binary (dist\lms.exe)..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "$root\dist" | Out-Null
$env:GOOS = "windows"; $env:GOARCH = "amd64"
Push-Location "$root\backend"
go build -ldflags "-s -w -X main.version=$Version" -o "$root\dist\lms.exe" ./cmd/server
Pop-Location
Remove-Item Env:GOOS -ErrorAction SilentlyContinue
Remove-Item Env:GOARCH -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0) { throw "Backend build failed." }

Write-Host "==> Packaging archive..." -ForegroundColor Cyan
Copy-Item "$root\config.yaml" "$root\dist\config.yaml" -Force

# Launcher ramah-pengguna: set folder kerja ke lokasi file ini, jalankan server,
# dan tahan jendela agar pesan (termasuk error) tetap terlihat.
$launcher = @"
@echo off
cd /d "%~dp0"
echo Menjalankan LMS... buka http://localhost:8080 di browser.
lms.exe --config config.yaml
echo.
echo Server berhenti. Tekan tombol apa saja untuk menutup.
pause >nul
"@
Set-Content -Path "$root\dist\Jalankan-LMS.bat" -Value $launcher -Encoding ASCII

$zip = "$root\dist\lms-$Version-windows.zip"
Compress-Archive -Path "$root\dist\lms.exe", "$root\dist\config.yaml", "$root\dist\Jalankan-LMS.bat" -DestinationPath $zip -Force

Write-Host ("Done -> " + $zip) -ForegroundColor Green
