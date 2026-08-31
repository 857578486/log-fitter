@echo off
cd /d "%~dp0"
if exist "便携版\LogFitter.html" (
  start "" "便携版\LogFitter.html"
  exit /b 0
)
echo 还没有便携版，正在打包...
call npm run pack
if exist "便携版\LogFitter.html" (
  start "" "便携版\LogFitter.html"
) else (
  echo 打包失败，请先执行 npm install
  pause
)
