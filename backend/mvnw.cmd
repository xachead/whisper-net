@REM ----------------------------------------------------------------------------
@REM Apache Maven Wrapper Executable Batch Script
@REM ----------------------------------------------------------------------------

@IF "%DEBUG%" == "" @ECHO OFF
@SETLOCAL

where mvn >nul 2>nul
IF %ERRORLEVEL% EQU 0 (
  mvn %*
  EXIT /B %ERRORLEVEL%
)

ECHO Maven executable not found on PATH. Please install Maven or run via Docker.
EXIT /B 1
