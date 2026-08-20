param(
    [ValidateSet("All", "Build", "Install", "Start", "Stop")]
    [string]$Mode = "All"
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$releaseExe = Join-Path $root "src-tauri\target\release\kittypet.exe"
$bundleDir = Join-Path $root "src-tauri\target\release\bundle\nsis"
$installedExe = Join-Path $env:LOCALAPPDATA "KittyPet\kittypet.exe"
$cargoDir = Join-Path $env:USERPROFILE ".cargo\bin"

if (Test-Path -LiteralPath $cargoDir) {
    $env:Path = "$cargoDir;$env:Path"
} else {
    throw "Cargo was not found: $cargoDir"
}

function Get-NodePath {
    $command = Get-Command node.exe -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $fallback = Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe"
    if (Test-Path -LiteralPath $fallback) { return $fallback }
    throw "Node.js 20+ was not found."
}

function Invoke-Node {
    param([string[]]$Arguments)
    & $script:node @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Node command failed with exit code ${LASTEXITCODE}: $($Arguments -join ' ')"
    }
}

function Stop-KittyPet {
    $processes = Get-CimInstance Win32_Process -Filter "Name = 'kittypet.exe'" -ErrorAction SilentlyContinue
    foreach ($process in $processes) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 800
}

function Build-KittyPet {
    Write-Host "[1/4] Sync assets and build the Tauri release..."
    Push-Location $root
    try {
        Invoke-Node @("node_modules\@tauri-apps\cli\tauri.js", "build")
    } finally {
        Pop-Location
    }
    if (-not (Test-Path -LiteralPath $releaseExe)) {
        throw "Build finished but the release executable was not found: $releaseExe"
    }
}

function Install-KittyPet {
    $installer = Get-ChildItem -LiteralPath $bundleDir -Filter "*-setup.exe" -File |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $installer) { throw "NSIS installer was not found: $bundleDir" }

    Write-Host "[2/4] Install the latest build: $($installer.Name)"
    $result = Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait -PassThru
    if ($result.ExitCode -ne 0) { throw "Installer failed with exit code $($result.ExitCode)" }
    if (-not (Test-Path -LiteralPath $installedExe)) {
        throw "Installed executable was not found: $installedExe"
    }
    $releaseHash = (Get-FileHash -LiteralPath $releaseExe -Algorithm SHA256).Hash
    $installedHash = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash
    if ($releaseHash -ne $installedHash) {
        Write-Host "Installer left an older executable; replacing it with the verified release binary."
        Copy-Item -LiteralPath $releaseExe -Destination $installedExe -Force
        $installedHash = (Get-FileHash -LiteralPath $installedExe -Algorithm SHA256).Hash
    }
    if ($releaseHash -ne $installedHash) {
        throw "Installed executable still does not match this build; startup was aborted."
    }
}

function Start-KittyPet {
    Write-Host "[3/4] Start KittyPet: $installedExe"
    Start-Process -FilePath $installedExe | Out-Null
    Start-Sleep -Seconds 2
    $running = Get-CimInstance Win32_Process -Filter "Name = 'kittypet.exe'" -ErrorAction SilentlyContinue
    if (-not $running) { throw "kittypet.exe was not detected after startup." }
    Write-Host "[4/4] KittyPet is running. PID: $($running.ProcessId -join ', ')"
}

$script:node = Get-NodePath

switch ($Mode) {
        "Stop" { Stop-KittyPet; Write-Host "KittyPet stopped." }
    "Build" { Stop-KittyPet; Build-KittyPet }
    "Install" { Stop-KittyPet; Install-KittyPet }
    "Start" { Start-KittyPet }
    "All" {
        Stop-KittyPet
        Build-KittyPet
        Install-KittyPet
        Start-KittyPet
    }
}
