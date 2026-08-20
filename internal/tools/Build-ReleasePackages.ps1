param(
    # Game directory. Leave blank to auto-detect common Steam paths.
    [string]$GameDir = "",
    [ValidateSet("Release")]
    [string]$Configuration = "Release",
    # Leave blank to use the version declared in the Host MelonInfo.
    [string]$Version = "",
    # Leave blank to output under <repo>/artifacts/release-v<Version>.
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

# RepoRoot = internal/ ; ProjectRoot = IronNestFCT repository root.
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ProjectRoot = Split-Path -Parent $RepoRoot

. (Join-Path $PSScriptRoot "Version.ps1")
$DeclaredVersion = Get-IronNestFcsVersion -RepoRoot $RepoRoot

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = $DeclaredVersion
}
elseif ($Version -ne $DeclaredVersion) {
    throw "Package version v$Version does not match Host version v$DeclaredVersion. Update the Host version first (see FcsHostMod.cs MelonInfo)."
}

function Resolve-GameDir {
    param([string]$Explicit)

    # The build resolves MelonLoader assemblies under $(GameDir)\MelonLoader\net6.
    $Marker = "MelonLoader\net6\MelonLoader.dll"

    if (-not [string]::IsNullOrWhiteSpace($Explicit)) {
        $resolved = Resolve-Path -Path $Explicit -ErrorAction SilentlyContinue
        if ($null -eq $resolved) { throw "Game directory does not exist: $Explicit" }
        if (-not (Test-Path (Join-Path $resolved.Path $Marker))) {
            throw "Invalid game directory (missing $Marker): $resolved"
        }
        return $resolved.Path
    }

    $roots = @(
        "D:\SteamLibrary",
        "D:\Steam",
        "C:\Program Files (x86)\Steam",
        "C:\Steam",
        "E:\SteamLibrary",
        "E:\Steam",
        "F:\SteamLibrary",
        "F:\Steam"
    )
    foreach ($root in $roots) {
        if (-not (Test-Path $root)) { continue }
        $candidate = Join-Path $root "steamapps\common\Iron Nest Heavy Turret Simulator"
        if (Test-Path (Join-Path $candidate $Marker)) { return $candidate }
    }

    throw "Could not auto-detect the game directory. Pass -GameDir with a path containing $Marker"
}

$GameDir = Resolve-GameDir -Explicit $GameDir

# Build only the three fire-control projects. The unrelated CustomRecords record-player
# mod has been removed from this fork and is not part of the internal mod release.
$AbstractionsProject = Join-Path $RepoRoot "IronNestFCS.Abstractions\IronNestFCS.Abstractions.csproj"
$HostProject = Join-Path $RepoRoot "IronNestFCS\IronNestFCS.csproj"
$LogicProject = Join-Path $RepoRoot "IronNestFCS.Logic\IronNestFCS.Logic.csproj"

$HostDll = Join-Path $RepoRoot "IronNestFCS\bin\$Configuration\IronNestFCS.dll"
$AbstractionsDll = Join-Path $RepoRoot "IronNestFCS.Abstractions\bin\$Configuration\IronNestFCS.Abstractions.dll"
# IronNestFCS.Logic.csproj outputs directly to the game's UserData\IronNestFCS directory.
$LogicDll = Join-Path $GameDir "UserData\IronNestFCS\IronNestFCS.Logic.dll"

Write-Host "Building internal mod v$Version against: $GameDir"
foreach ($project in @($AbstractionsProject, $HostProject, $LogicProject)) {
    Write-Host "  dotnet build $(Split-Path -Leaf $project)"
    & dotnet build $project -c $Configuration "-p:GameDir=$GameDir"
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet build failed for $project with exit code $LASTEXITCODE"
    }
}

foreach ($path in @($HostDll, $AbstractionsDll, $LogicDll)) {
    if (-not (Test-Path $path)) {
        throw "Expected release input was not produced: $path"
    }
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $ProjectRoot "artifacts\release-v$Version"
}
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$FileName = "IronNestFCT_internal_v${Version}.zip"
$Stage = Join-Path $OutputDir "_stage"
$Zip = Join-Path $OutputDir $FileName

if (Test-Path $Stage) { Remove-Item -Recurse -Force $Stage }
if (Test-Path $Zip) { Remove-Item -Force $Zip }

# Three-folder layout, matching the MelonLoader install convention:
#   Mods/                             -> Host mod
#   UserLibs/                         -> shared ABI contract
#   UserData/IronNestFCS/             -> reloadable fire-control logic
$ModsDir = Join-Path $Stage "Mods"
$UserLibsDir = Join-Path $Stage "UserLibs"
$LogicDir = Join-Path $Stage "UserData\IronNestFCS"
New-Item -ItemType Directory -Force -Path $ModsDir, $UserLibsDir, $LogicDir | Out-Null

Copy-Item -Force $HostDll (Join-Path $ModsDir "IronNestFCS.dll")
Copy-Item -Force $AbstractionsDll (Join-Path $UserLibsDir "IronNestFCS.Abstractions.dll")
Copy-Item -Force $LogicDll (Join-Path $LogicDir "IronNestFCS.Logic.dll")

# Licensing + install notes.
$RootLicense = Join-Path $ProjectRoot "LICENSE"
$RootNotice = Join-Path $ProjectRoot "NOTICE.md"
$SmartLicense = Join-Path $RepoRoot "LICENSE"
$InstallTxt = Join-Path $RepoRoot "INSTALL.txt"

if (Test-Path $RootLicense) { Copy-Item -Force $RootLicense (Join-Path $Stage "LICENSE.txt") }
if (Test-Path $RootNotice) { Copy-Item -Force $RootNotice (Join-Path $Stage "NOTICE.txt") }
if (Test-Path $SmartLicense) { Copy-Item -Force $SmartLicense (Join-Path $Stage "LICENSE-Smart.txt") }
if (Test-Path $InstallTxt) { Copy-Item -Force $InstallTxt (Join-Path $Stage "INSTALL.txt") }

Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $Zip -CompressionLevel Optimal
Remove-Item -Recurse -Force $Stage

$Hash = Get-FileHash -Algorithm SHA256 $Zip
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$HashLine = "$($Hash.Hash.ToLowerInvariant())  $([System.IO.Path]::GetFileName($Hash.Path))"
[System.IO.File]::WriteAllText((Join-Path $OutputDir "SHA256SUMS.txt"), $HashLine + [Environment]::NewLine, $Utf8NoBom)

Write-Host ""
Write-Host "Release package ready: $Zip"
Write-Host "  SHA256 $($Hash.Hash)"
Write-Host ""
Write-Host "Deploy: extract the ZIP, then merge its Mods / UserData / UserLibs folders"
Write-Host "        into the game root directory (no recompilation required)."
