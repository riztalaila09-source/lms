@echo off
REM Wrapper so cmd.exe users can build the Windows distribution by just running
REM   dist-windows.bat            (or)   dist-windows.bat -Version 1.0.0
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0dist-windows.ps1" %*
