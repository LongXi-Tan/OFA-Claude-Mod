<#
.SYNOPSIS
  A lane's drafts: project files a worker prepares while another agent holds the Unity Editor, landed into the project
  during the worker's own Editor turn.

.DESCRIPTION
  Drafts live in .studio\drafts\<lane>\ at their repository paths (.studio\drafts\code\Assets\Scripts\Player\X.cs lands
  as Assets\Scripts\Player\X.cs). A new file is written straight into the drafts tree. An existing file is opened first,
  which copies it there and remembers its content hash, so landing can tell whether anyone changed it meanwhile.
  Landing checks every draft before copying any: one conflict and nothing lands.

  Only text sources under Assets\ or Packages\ are drafted (C#, shaders, HLSL, ...). Unity-serialized files (scenes,
  prefabs, materials, .asset, .meta) change through Editor APIs during an Editor turn. Moves, renames and deletions of
  project files also happen in the turn, through AssetDatabase, so their GUIDs and .meta files stay right.

.PARAMETER Lane
  The lane (code, vfx, models, lead, ...). Required except for -Status, which lists every lane without it.

.PARAMETER Open
  Repository paths of existing files to draft.

.PARAMETER Status
  Lists drafts: new or edit, unchanged, and whether landing would conflict.

.PARAMETER Land
  Copies the lane's drafts into place and deletes them. Only during your Editor turn.

.PARAMETER Discard
  Deletes the lane's drafts without landing them.

.EXAMPLE
  powershell -NoProfile -File <skill dir>\scripts\studio-drafts.ps1 -Lane code -Open Assets\Scripts\Player\PlayerHealth.cs
#>
param(
    [string] $Lane,
    [string[]] $Open = @(),
    [switch] $Status,
    [switch] $Land,
    [switch] $Discard
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'studio-common.ps1')

$repo = Get-StudioRepo
$actionCount = 0
if ($Open.Count -gt 0) { $actionCount++ }
if ($Status) { $actionCount++ }
if ($Land) { $actionCount++ }
if ($Discard) { $actionCount++ }
if ($actionCount -ne 1) {
    Write-Output 'Give one action: -Open <paths>, -Status, -Land or -Discard (with -Lane <lane>).'
    exit 2
}
if (-not $Status) { Assert-LaneName $Lane; Register-StudioIgnore $repo }
elseif ($Lane) { Assert-LaneName $Lane }

$draftsRoot = Get-StudioDir $repo 'drafts'

# What landing would do with one draft: new, edit, unchanged, or a conflict with its reason.
function Get-DraftState($Draft) {
    $target = Join-Path $repo $Draft.Rel
    $problem = Test-DraftablePath $Draft.Rel
    if ($problem) { return [pscustomobject]@{ Kind = 'conflict'; Reason = $problem } }
    if ($Draft.Base) {
        if (-not (Test-Path $target)) { return [pscustomobject]@{ Kind = 'conflict'; Reason = 'deleted since it was opened' } }
        $now = Get-Sha256 $target
        if ($now -ne $Draft.Base) { return [pscustomobject]@{ Kind = 'conflict'; Reason = 'changed in the project since it was opened: compare, merge into the draft, open again' } }
        if ((Get-Sha256 $Draft.DraftPath) -eq $now) { return [pscustomobject]@{ Kind = 'unchanged'; Reason = $null } }
        return [pscustomobject]@{ Kind = 'edit'; Reason = $null }
    }
    if (Test-Path $target) { return [pscustomobject]@{ Kind = 'conflict'; Reason = 'already exists in the project: open it with -Open to edit it' } }
    return [pscustomobject]@{ Kind = 'new'; Reason = $null }
}

if ($Open.Count -gt 0) {
    $bases = Read-LaneBases $repo $Lane
    $otherLanes = @(Get-StudioLanes $repo | Where-Object { $_ -ne $Lane })
    $opened = 0
    foreach ($entry in $Open) {
        foreach ($path in ($entry -split ',')) {
            $path = $path.Trim()
            if (-not $path) { continue }
            $rel = ConvertTo-RepoRelative $repo $path
            $problem = Test-DraftablePath $rel
            if ($problem) { Write-Output "NOT OPENED $rel - $problem"; continue }
            $source = Join-Path $repo $rel
            if (-not (Test-Path $source -PathType Leaf)) { Write-Output "NOT OPENED $rel - no such file; write a new file straight into .studio\drafts\$Lane\$rel"; continue }
            $draftPath = Join-Path (Join-Path $draftsRoot $Lane) $rel
            if (Test-Path $draftPath) { Write-Output "NOT OPENED $rel - already drafted in lane ${Lane}: edit $draftPath"; continue }
            $holder = $otherLanes | Where-Object { Test-Path (Join-Path (Join-Path $draftsRoot $_) $rel) } | Select-Object -First 1
            if ($holder) { Write-Output "NOT OPENED $rel - lane $holder is drafting it: one path has one owner; ask the lead"; continue }
            New-Item -ItemType Directory -Force -Path (Split-Path $draftPath) | Out-Null
            Copy-Item -LiteralPath $source -Destination $draftPath
            $bases[$rel] = Get-Sha256 $source
            Write-Output "OPENED $rel -> $draftPath"
            $opened++
        }
    }
    Write-LaneBases $repo $Lane $bases
    if ($opened -eq 0) { exit 1 }
    exit 0
}

if ($Status) {
    $lanes = @()
    if ($Lane) { $lanes = @($Lane) } else { $lanes = @(Get-StudioLanes $repo) }
    $any = $false
    foreach ($laneName in $lanes) {
        $drafts = @(Get-LaneDrafts $repo $laneName)
        if ($drafts.Count -eq 0) { continue }
        $any = $true
        Write-Output "Lane $laneName ($($drafts.Count) drafts):"
        foreach ($draft in ($drafts | Sort-Object Rel)) {
            $state = Get-DraftState $draft
            $line = "  $($state.Kind.PadRight(9)) $($draft.Rel)"
            if ($state.Reason) { $line += " - $($state.Reason)" }
            Write-Output $line
        }
    }
    if (-not $any) { Write-Output 'No drafts.' }
    exit 0
}

if ($Discard) {
    $laneRoot = Join-Path $draftsRoot $Lane
    $count = @(Get-LaneDrafts $repo $Lane).Count
    if (Test-Path $laneRoot) { Remove-Item -Recurse -Force -LiteralPath $laneRoot }
    Write-LaneBases $repo $Lane @{}
    Write-Output "Discarded $count drafts of lane $Lane."
    exit 0
}

# Land: check every draft first, copy only when none conflicts.
$drafts = @(Get-LaneDrafts $repo $Lane)
if ($drafts.Count -eq 0) { Write-Output "Lane $Lane has no drafts to land."; exit 0 }
$plan = @()
$conflicts = @()
foreach ($draft in ($drafts | Sort-Object Rel)) {
    $state = Get-DraftState $draft
    if ($state.Kind -eq 'conflict') { $conflicts += "  $($draft.Rel) - $($state.Reason)" }
    else { $plan += [pscustomobject]@{ Draft = $draft; Kind = $state.Kind } }
}
if ($conflicts.Count -gt 0) {
    Write-Output "NOTHING LANDED: $($conflicts.Count) of $($drafts.Count) drafts conflict."
    $conflicts | ForEach-Object { Write-Output $_ }
    exit 1
}

$landed = @()
foreach ($step in $plan) {
    if ($step.Kind -eq 'unchanged') { continue }
    $target = Join-Path $repo $step.Draft.Rel
    New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
    Copy-Item -LiteralPath $step.Draft.DraftPath -Destination $target -Force
    $landed += "  $($step.Kind.PadRight(4)) $($step.Draft.Rel)"
}
Remove-Item -Recurse -Force -LiteralPath (Join-Path $draftsRoot $Lane)
Write-LaneBases $repo $Lane @{}

$unchanged = @($plan | Where-Object { $_.Kind -eq 'unchanged' }).Count
Write-Output "LANDED $($landed.Count) files from lane $Lane ($unchanged unchanged drafts dropped):"
$landed | ForEach-Object { Write-Output $_ }
Write-Output 'Next, in the Editor: AssetDatabase.Refresh(), wait for the compile to finish and read its errors in the Console.'
exit 0
