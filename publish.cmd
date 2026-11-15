@echo off
rem Builds the game and publishes it, with its security rules, to Firebase.
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
call npm run deploy
