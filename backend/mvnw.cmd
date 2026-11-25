@echo off
setlocal
set "MVN_CMD="
for /f "delims=" %%F in ('powershell -NoProfile -Command "$m = Get-Command mvn -ErrorAction SilentlyContinue; if ($m) { $m.Source } else { Get-ChildItem \"$env:USERPROFILE\.m2\wrapper\dists\" -Recurse -Filter mvn.cmd -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName }"') do set "MVN_CMD=%%F"

if not defined MVN_CMD (
    echo Descargando Apache Maven 3.9.9 en cache local de usuario...
    powershell -NoProfile -Command "$dest = \"$env:USERPROFILE\.m2\wrapper\dists\apache-maven-3.9.9-auto\"; if (-not (Test-Path \"$dest\apache-maven-3.9.9\bin\mvn.cmd\")) { New-Item -ItemType Directory -Force -Path $dest | Out-Null; Invoke-WebRequest -Uri 'https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip' -OutFile \"$dest\mvn.zip\"; Expand-Archive -Path \"$dest\mvn.zip\" -DestinationPath $dest -Force }; Write-Output \"$dest\apache-maven-3.9.9\bin\mvn.cmd\"" > "%TEMP%\mvn_path.txt"
    set /p MVN_CMD=<"%TEMP%\mvn_path.txt"
)

call "%MVN_CMD%" %*
