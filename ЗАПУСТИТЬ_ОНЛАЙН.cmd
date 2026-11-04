@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "GAME_NODE=node"
where node >nul 2>nul
if errorlevel 1 (
  if exist "%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" (
    set "GAME_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  ) else (
    echo Не найден Node.js. Установи Node.js 24 LTS с https://nodejs.org/
    pause
    exit /b 1
  )
)
"%GAME_NODE%" -e "if(Number(process.versions.node.split('.')[0])!==24)process.exit(1)"
if errorlevel 1 (
  echo Для этой сборки нужен Node.js 24 LTS: https://nodejs.org/
  pause
  exit /b 1
)
echo Открой в браузере http://localhost:3000
echo Не закрывай это окно, пока играете. Для остановки нажми Ctrl+C.
"%GAME_NODE%" server/main.cjs
pause
