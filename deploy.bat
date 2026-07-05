@echo off
setlocal
REM ============================================================
REM  hyperspace deploy script
REM
REM  Usage:
REM    deploy              deploy everything (landing+docs+web+backend)
REM    deploy landing      Next.js landing  -> hypersp.tech
REM    deploy docs         VitePress docs   -> docs.hypersp.tech
REM    deploy web          React SPA        -> dash.hypersp.tech
REM    deploy backend      Express API      -> restarts hyperspace-backend
REM ============================================================

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"
set "KEY=C:\Users\Soumya\Desktop\CogneeHackathon_key.pem"
set "SERVER=azureuser@74.224.89.11"
set "SSH=ssh -i "%KEY%" -o BatchMode=yes -o ConnectTimeout=15 %SERVER%"
set "SCP=scp -i "%KEY%" -o BatchMode=yes"

set DO_LANDING=0
set DO_DOCS=0
set DO_WEB=0
set DO_BACKEND=0

if /i "%~1"==""        set DO_LANDING=1& set DO_DOCS=1& set DO_WEB=1& set DO_BACKEND=1
if /i "%~1"=="all"     set DO_LANDING=1& set DO_DOCS=1& set DO_WEB=1& set DO_BACKEND=1
if /i "%~1"=="landing" set DO_LANDING=1
if /i "%~1"=="docs"    set DO_DOCS=1
if /i "%~1"=="web"     set DO_WEB=1
if /i "%~1"=="backend" set DO_BACKEND=1

set /a ANY=%DO_LANDING%+%DO_DOCS%+%DO_WEB%+%DO_BACKEND%
if %ANY%==0 (
    echo Unknown target "%~1". Use: landing ^| docs ^| web ^| backend ^| all
    exit /b 1
)

if %DO_LANDING%==1 call :deploy_landing || goto :fail
if %DO_DOCS%==1    call :deploy_docs    || goto :fail
if %DO_WEB%==1     call :deploy_web     || goto :fail
if %DO_BACKEND%==1 call :deploy_backend || goto :fail

echo.
echo === Verifying live site ===
curl -s -o NUL -w "  %%{http_code}  https://hypersp.tech/\n"                 https://hypersp.tech/
curl -s -o NUL -w "  %%{http_code}  https://dash.hypersp.tech/app\n"         https://dash.hypersp.tech/app
curl -s -o NUL -w "  %%{http_code}  https://docs.hypersp.tech/\n"            https://docs.hypersp.tech/
curl -s -o NUL -w "  %%{http_code}  https://dash.hypersp.tech/api/stats\n"   https://dash.hypersp.tech/api/stats
echo.
echo DONE.
exit /b 0

:fail
echo.
echo DEPLOY FAILED - fix the error above and rerun.
exit /b 1


REM ------------------------------------------------------------
:deploy_landing
echo.
echo === [landing] building (Next.js static export) ===
pushd "%ROOT%\landing"
REM Shell env beats .env.local, so the localhost dev URLs never leak in.
set "NEXT_PUBLIC_APP_URL=https://dash.hypersp.tech"
set "NEXT_PUBLIC_LOGIN_URL=https://login.hypersp.tech"
set "NEXT_PUBLIC_DOCS_URL=https://docs.hypersp.tech"
call npm run build
if errorlevel 1 ( popd & exit /b 1 )
popd
echo === [landing] uploading ===
tar -czf "%TEMP%\hs-landing.tgz" -C "%ROOT%\landing\out" .
if errorlevel 1 exit /b 1
%SCP% "%TEMP%\hs-landing.tgz" %SERVER%:/tmp/
if errorlevel 1 exit /b 1
%SSH% "sudo find /var/www/hyperspace/landing -mindepth 1 -delete && sudo tar xzf /tmp/hs-landing.tgz -C /var/www/hyperspace/landing && rm -f /tmp/hs-landing.tgz"
if errorlevel 1 exit /b 1
echo === [landing] done ===
exit /b 0

REM ------------------------------------------------------------
:deploy_docs
echo.
echo === [docs] building (VitePress) ===
pushd "%ROOT%\docs"
call npm run docs:build
if errorlevel 1 ( popd & exit /b 1 )
popd
echo === [docs] uploading ===
tar -czf "%TEMP%\hs-docs.tgz" -C "%ROOT%\docs\.vitepress\dist" .
if errorlevel 1 exit /b 1
%SCP% "%TEMP%\hs-docs.tgz" %SERVER%:/tmp/
if errorlevel 1 exit /b 1
%SSH% "sudo find /var/www/hyperspace/docs -mindepth 1 -delete && sudo tar xzf /tmp/hs-docs.tgz -C /var/www/hyperspace/docs && rm -f /tmp/hs-docs.tgz"
if errorlevel 1 exit /b 1
echo === [docs] done ===
exit /b 0

REM ------------------------------------------------------------
:deploy_web
echo.
echo === [web] building (Vite React SPA) ===
pushd "%ROOT%\web"
call npm run build
if errorlevel 1 ( popd & exit /b 1 )
popd
echo === [web] uploading ===
tar -czf "%TEMP%\hs-web.tgz" -C "%ROOT%\web\dist" .
if errorlevel 1 exit /b 1
%SCP% "%TEMP%\hs-web.tgz" %SERVER%:/tmp/
if errorlevel 1 exit /b 1
%SSH% "sudo find /var/www/hyperspace/web -mindepth 1 -delete && sudo tar xzf /tmp/hs-web.tgz -C /var/www/hyperspace/web && rm -f /tmp/hs-web.tgz"
if errorlevel 1 exit /b 1
echo === [web] done ===
exit /b 0

REM ------------------------------------------------------------
:deploy_backend
echo.
echo === [backend] uploading source (server runs tsx directly) ===
REM .env is excluded on purpose: the VM keeps its own production .env
REM (APP_BASE_URL etc.) -- never overwrite it with local dev config.
tar -czf "%TEMP%\hs-backend.tgz" --exclude node_modules --exclude dist --exclude .env --exclude .env.local --exclude .git -C "%ROOT%\web" .
if errorlevel 1 exit /b 1
%SCP% "%TEMP%\hs-backend.tgz" %SERVER%:/tmp/
if errorlevel 1 exit /b 1
%SSH% "tar xzf /tmp/hs-backend.tgz -C /home/azureuser/hyperspace/web && rm -f /tmp/hs-backend.tgz && cd /home/azureuser/hyperspace/web && npm install --no-audit --no-fund --loglevel=error && sudo systemctl restart hyperspace-backend && sleep 3 && systemctl is-active hyperspace-backend"
if errorlevel 1 exit /b 1
echo === [backend] done (service restarted) ===
exit /b 0
