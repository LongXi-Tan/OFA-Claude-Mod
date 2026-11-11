# Shared helpers for the game-studio scripts. Dot-source it: . (Join-Path $PSScriptRoot 'studio-common.ps1')
# Windows PowerShell 5.1 compatible: no ternary, no ??, no &&.

# Lane names: lowercase letters, digits and hyphens, as the work orders name them (code, vfx, models, lead, models-2).
$script:LanePattern = '^[a-z0-9][a-z0-9-]*$'

# Extensions Unity serializes itself, or that reshape the compile (.asmdef, .asmref). They change only through Editor
# APIs during an Editor turn, never as drafts: Unity YAML is not edited by hand.
$script:EditorOnlyExtensions = @(
    '.asmdef', '.asmref',
    '.meta', '.unity', '.prefab', '.asset', '.mat', '.controller', '.overridecontroller', '.anim', '.mask',
    '.physicmaterial', '.physicsmaterial2d', '.lighting', '.rendertexture', '.cubemap', '.flare', '.guiskin',
    '.fontsettings', '.mixer', '.playable', '.signal', '.preset', '.spriteatlas', '.spriteatlasv2', '.terrainlayer',
    '.brush', '.shadergraph', '.shadersubgraph', '.vfx', '.vfxoperator', '.vfxblock', '.inputactions'
)

function Test-UnityProjectRoot([string] $Path) {
    return (Test-Path (Join-Path $Path 'Assets')) -and (Test-Path (Join-Path $Path 'ProjectSettings'))
}

# The Unity project root (the folder with Assets\ and ProjectSettings\). The scripts live in a plugin, outside the
# game, so the project is where the caller stands: the current folder, else the git repository's top folder.
function Get-StudioRepo {
    $here = ((Get-Location).Path -replace '/', '\').TrimEnd('\')
    if (Test-UnityProjectRoot $here) { return $here }
    $top = $null
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $top = (& git rev-parse --show-toplevel 2>$null) } catch { $top = $null }
    $ErrorActionPreference = $previous
    if ($top) {
        $top = ([string]$top -replace '/', '\').TrimEnd('\')
        if (Test-UnityProjectRoot $top) { return $top }
    }
    throw "Not a Unity project root: $here. Run the studio scripts from the Unity project's root, the folder with Assets\ and ProjectSettings\."
}

# Keeps .studio\ out of git status without touching the repository's tracked .gitignore: adds it to the local
# .git\info\exclude. Quietly does nothing outside a git repository.
function Register-StudioIgnore([string] $Repo) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $gitDir = (& git -C $Repo rev-parse --git-common-dir 2>$null)
        $top = (& git -C $Repo rev-parse --show-toplevel 2>$null)
    }
    catch { $gitDir = $null; $top = $null }
    $ErrorActionPreference = $previous
    if (-not $gitDir -or -not $top) { return }
    $gitDir = [string]$gitDir -replace '/', '\'
    if (-not [System.IO.Path]::IsPathRooted($gitDir)) { $gitDir = Join-Path $Repo $gitDir }
    $top = ([string]$top -replace '/', '\').TrimEnd('\')

    # The pattern is relative to the repository's top, which may sit above the Unity project.
    $prefix = ''
    if ($Repo.Length -gt $top.Length -and $Repo.StartsWith($top + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        $prefix = ($Repo.Substring($top.Length + 1) -replace '\\', '/') + '/'
    }
    $pattern = "/$prefix.studio/"
    $exclude = Join-Path $gitDir 'info\exclude'
    if (Test-Path $exclude) {
        foreach ($line in (Get-Content -Path $exclude)) { if ($line.Trim() -eq $pattern) { return } }
    }
    else { New-Item -ItemType Directory -Force -Path (Split-Path $exclude) | Out-Null }
    Add-Content -Path $exclude -Value $pattern -Encoding ASCII
}

function Assert-LaneName([string] $Name) {
    if (-not $Name -or $Name -notmatch $script:LanePattern) {
        throw "Lane '$Name' is not a lane name: use lowercase letters, digits and hyphens (code, vfx, models, lead)."
    }
}

function Get-StudioDir([string] $Repo, [string] $Child) {
    $dir = Join-Path $Repo '.studio'
    if ($Child) { $dir = Join-Path $dir $Child }
    return $dir
}

function Get-StudioLanes([string] $Repo) {
    $draftsRoot = Get-StudioDir $Repo 'drafts'
    if (-not (Test-Path $draftsRoot)) { return @() }
    return @(Get-ChildItem -Path $draftsRoot -Directory | Where-Object { $_.Name -match $script:LanePattern } |
        ForEach-Object { $_.Name })
}

# Repo-relative path, backslashes, no leading .\ or slash.
function ConvertTo-RepoRelative([string] $Repo, [string] $Path) {
    $p = $Path -replace '/', '\'
    if ([System.IO.Path]::IsPathRooted($p)) {
        $full = [System.IO.Path]::GetFullPath($p)
        if (-not $full.StartsWith($Repo + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "$Path is outside the repository $Repo."
        }
        return $full.Substring($Repo.Length + 1)
    }
    while ($p.StartsWith('.\')) { $p = $p.Substring(2) }
    return $p.TrimStart('\')
}

# Unity skips hidden folders and files (a leading dot), names ending in ~, cvs folders and .tmp files.
function Test-UnityIgnored([string] $RelativePath) {
    $parts = $RelativePath -split '\\'
    foreach ($part in $parts) {
        if ($part.StartsWith('.') -or $part.EndsWith('~') -or $part -ieq 'cvs') { return $true }
    }
    return $RelativePath.EndsWith('.tmp', [System.StringComparison]::OrdinalIgnoreCase)
}

# Is the file inside a folder named Editor? Outside an asmdef, such a script compiles into an editor assembly.
function Test-EditorScript([string] $RelativePath) {
    $parts = $RelativePath -split '\\'
    for ($i = 0; $i -lt $parts.Length - 1; $i++) {
        if ($parts[$i] -ieq 'Editor') { return $true }
    }
    return $false
}

function Get-Sha256([string] $Path) {
    return (Get-FileHash -Path $Path -Algorithm SHA256).Hash
}

function Read-LaneBases([string] $Repo, [string] $Lane) {
    $file = Join-Path (Get-StudioDir $Repo 'bases') "$Lane.json"
    $bases = @{}
    if (Test-Path $file) {
        $raw = Get-Content -Raw -Path $file
        if ($raw.Trim()) {
            $obj = $raw | ConvertFrom-Json
            foreach ($prop in $obj.PSObject.Properties) { $bases[$prop.Name] = [string]$prop.Value }
        }
    }
    return $bases
}

function Write-LaneBases([string] $Repo, [string] $Lane, [hashtable] $Bases) {
    $dir = Get-StudioDir $Repo 'bases'
    $file = Join-Path $dir "$Lane.json"
    if ($Bases.Count -eq 0) {
        if (Test-Path $file) { Remove-Item -Force $file }
        return
    }
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $ordered = [ordered]@{}
    foreach ($key in ($Bases.Keys | Sort-Object)) { $ordered[$key] = $Bases[$key] }
    ($ordered | ConvertTo-Json) | Set-Content -Path $file -Encoding UTF8
}

# Every draft file of a lane: Rel (repo-relative), DraftPath, Base (hash when opened from an existing file, else $null).
function Get-LaneDrafts([string] $Repo, [string] $Lane) {
    $root = Join-Path (Get-StudioDir $Repo 'drafts') $Lane
    $bases = Read-LaneBases $Repo $Lane
    $drafts = @()
    if (Test-Path $root) {
        foreach ($file in (Get-ChildItem -Path $root -Recurse -File)) {
            $rel = $file.FullName.Substring($root.Length + 1)
            $base = $null
            if ($bases.ContainsKey($rel)) { $base = $bases[$rel] }
            $drafts += [pscustomobject]@{ Rel = $rel; DraftPath = $file.FullName; Base = $base; Lane = $Lane }
        }
    }
    return $drafts
}

function Test-DraftablePath([string] $RelativePath) {
    $isProjectPath = $RelativePath.StartsWith('Assets\', [System.StringComparison]::OrdinalIgnoreCase) -or
        $RelativePath.StartsWith('Packages\', [System.StringComparison]::OrdinalIgnoreCase)
    if (-not $isProjectPath) {
        return "only files under Assets\ or Packages\ are drafted; write other files (docs, Blender scripts, source art) in place"
    }
    $extension = [System.IO.Path]::GetExtension($RelativePath).ToLowerInvariant()
    if ($script:EditorOnlyExtensions -contains $extension) {
        return "$extension is Unity-serialized: change it through Editor APIs during your Editor turn"
    }
    return $null
}

# Runs a Unity CLI command against this project and returns its parsed JSON result, or $null when the Editor is
# unreachable. Retries while a domain reload drops the connection.
function Invoke-UnityJson([string] $Repo, [string[]] $Arguments, [int] $Attempts = 3) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
            $output = & unity command @Arguments --project-path $Repo --result-only --caller plugin --skill game-studio 2>$null
            if ($LASTEXITCODE -eq 0 -and $output) {
                try { return (($output | Out-String) | ConvertFrom-Json) } catch { return $null }
            }
            if ($attempt -lt $Attempts) { Start-Sleep -Seconds 3 }
        }
        return $null
    }
    finally { $ErrorActionPreference = $previous }
}
