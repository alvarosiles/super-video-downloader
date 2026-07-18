# install-windows.ps1 — Super Video Downloader (host nativo)
# ─────────────────────────────────────────────────────────────────────────
# Registra este host nativo para que Chrome/Edge puedan lanzarlo por
# Native Messaging. Native Messaging exige que "path" apunte a un
# ejecutable — por eso se genera un run-host.bat que invoca `node host.js`
# — y que el host esté registrado en el registro de Windows con la ruta
# absoluta a ese manifiesto JSON.
#
# Uso:
#   npm install                 (dentro de native-host/, baja ffmpeg-static)
#   powershell -File native-host\install-windows.ps1 -ExtensionId <id-de-chrome://extensions>

param(
    [Parameter(Mandatory = $true)]
    [string]$ExtensionId,

    [ValidateSet('chrome', 'edge', 'both')]
    [string]$Browser = 'both'
)

$ErrorActionPreference = 'Stop'

$HostDir = $PSScriptRoot
$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
    Write-Error "No se encontró 'node' en PATH. Instala Node.js antes de continuar."
}

if (-not (Test-Path (Join-Path $HostDir 'node_modules'))) {
    Write-Output "Aviso: no se encontró native-host\node_modules. Ejecuta 'npm install' en esta carpeta antes de usar el host (baja ffmpeg-static/ffprobe-static)."
}

# ── 1. Generar el .bat que lanza el host (Native Messaging necesita un ejecutable, no un .js) ──
$RunnerPath = Join-Path $HostDir 'run-host.bat'
@"
@echo off
"$($NodeCmd.Source)" "$(Join-Path $HostDir 'host.js')"
"@ | Set-Content -Path $RunnerPath -Encoding ASCII

# ── 2. Generar el manifiesto del host con la ruta absoluta y el ID de la extensión ──
$ManifestPath = Join-Path $HostDir 'com.superviddownloader.host.json'
$Template = Get-Content (Join-Path $HostDir 'manifest.template.json') -Raw -Encoding UTF8
$Manifest = $Template `
    -replace '__RUNNER_PATH__', ($RunnerPath -replace '\\', '\\') `
    -replace '__EXTENSION_ID__', $ExtensionId
[System.IO.File]::WriteAllText($ManifestPath, $Manifest, [System.Text.UTF8Encoding]::new($false))

# ── 3. Registrar en el registro de Windows (HKCU, no requiere admin) ──
$RegRoots = @()
if ($Browser -eq 'chrome' -or $Browser -eq 'both') { $RegRoots += 'HKCU:\Software\Google\Chrome\NativeMessagingHosts' }
if ($Browser -eq 'edge' -or $Browser -eq 'both') { $RegRoots += 'HKCU:\Software\Microsoft\Edge\NativeMessagingHosts' }

foreach ($root in $RegRoots) {
    $key = Join-Path $root 'com.superviddownloader.host'
    New-Item -Path $key -Force | Out-Null
    Set-ItemProperty -Path $key -Name '(default)' -Value $ManifestPath
    Write-Output "Registrado en: $key -> $ManifestPath"
}

Write-Output ""
Write-Output "Host nativo instalado. Recarga la extensión (chrome://extensions) y prueba a descargar un video HLS/DASH."
