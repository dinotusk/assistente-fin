@ECHO OFF
setlocal

set BASE_DIR=%~dp0
set WRAPPER_PROPERTIES=%BASE_DIR%.mvn\wrapper\maven-wrapper.properties
set WRAPPER_JAR=%BASE_DIR%.mvn\wrapper\maven-wrapper.jar

if not exist "%WRAPPER_PROPERTIES%" (
  echo Missing %WRAPPER_PROPERTIES%
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in ("%WRAPPER_PROPERTIES%") do (
  if "%%A"=="wrapperUrl" set WRAPPER_URL=%%B
)

if not exist "%WRAPPER_JAR%" (
  echo Downloading Maven Wrapper from %WRAPPER_URL%...
  powershell -NoProfile -Command "Invoke-WebRequest -Uri '%WRAPPER_URL%' -OutFile '%WRAPPER_JAR%'"
)

if not defined JAVA_HOME (
  set JAVA_CMD=java
) else (
  set JAVA_CMD=%JAVA_HOME%\bin\java
)

"%JAVA_CMD%" -classpath "%WRAPPER_JAR%" "-Dmaven.multiModuleProjectDirectory=%BASE_DIR%" org.apache.maven.wrapper.MavenWrapperMain %*
