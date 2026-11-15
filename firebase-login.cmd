@echo off
rem Signs this computer in to Firebase. Needed once before publish.cmd.
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
call npx firebase login
