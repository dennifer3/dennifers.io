@echo off
setlocal
title Quick Git Push

REM Always work from the folder that contains this script.
cd /d "%~dp0"

echo ============================================================
echo                         QUICK GIT PUSH
echo ============================================================
echo Repository: %CD%
echo.

REM Make sure Git is installed and available from Command Prompt.
where git >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git was not found.
    echo Install Git for Windows, then try again.
    goto :failed
)

REM Make sure this script is inside a Git repository.
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
    echo ERROR: This folder is not a Git repository.
    echo Put gitPush.bat in your project's repository folder.
    goto :failed
)

echo Current changes:
echo ------------------------------------------------------------
git status --short
echo ------------------------------------------------------------
echo.

REM Stop early when there is nothing new to commit.
git status --porcelain | findstr . >nul
if errorlevel 1 (
    echo Nothing to commit. Your working tree is already clean.
    goto :success
)

echo NOTE: This will stage every changed, new, and deleted file.
set /p "COMMIT_MESSAGE=Enter a commit message: "

if not defined COMMIT_MESSAGE (
    echo.
    echo Cancelled: a commit message is required.
    goto :failed
)

echo.
echo [1/3] Staging all changes...
git add -A
if errorlevel 1 (
    echo ERROR: Git could not stage the changes.
    goto :failed
)

echo [2/3] Creating commit...
git commit -m "%COMMIT_MESSAGE%"
if errorlevel 1 (
    echo ERROR: Git could not create the commit.
    goto :failed
)

REM Read the current branch instead of assuming main or master.
for /f "delims=" %%B in ('git branch --show-current') do set "CURRENT_BRANCH=%%B"
if not defined CURRENT_BRANCH (
    echo ERROR: Could not detect the current branch.
    goto :failed
)

echo [3/3] Pushing branch "%CURRENT_BRANCH%"...

REM Use the existing upstream, or create one on the first push.
git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}" >nul 2>&1
if errorlevel 1 (
    git push --set-upstream origin "%CURRENT_BRANCH%"
) else (
    git push
)

if errorlevel 1 (
    echo ERROR: The push failed. Your commit is still saved locally.
    goto :failed
)

echo.
echo Successfully committed and pushed your changes!

:success
echo.
pause
exit /b 0

:failed
echo.
pause
exit /b 1
