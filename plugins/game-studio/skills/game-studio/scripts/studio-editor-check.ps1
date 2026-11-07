<#
.SYNOPSIS
  Is the Unity Editor free to hand to the next agent? Reads its state; changes nothing.

.DESCRIPTION
  The lead runs it before granting an Editor turn, and a worker runs it when its turn starts and again before it ends
  the turn. The Editor is free when it is ready and idle (no compile, no domain reload), in Edit Mode, compiled
  without errors, with the Run In Background override off, no unsaved scene and no prefab open in Prefab Mode.

  Exit codes: 0 free, 1 not free (each problem listed with what to do), 2 unreachable.
#>
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'studio-common.ps1')

$repo = Get-StudioRepo

# Is an Editor open on this project at all?
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$statusText = & unity status --format json 2>$null
$ErrorActionPreference = $previous
$instance = $null
try {
    $status = ($statusText | Out-String) | ConvertFrom-Json
    foreach ($candidate in @($status.data.instances)) {
        $path = ([string]$candidate.projectPath -replace '/', '\').TrimEnd('\')
        if ($path -ieq $repo) { $instance = $candidate }
    }
}
catch { $instance = $null }
if (-not $instance) {
    Write-Output "EDITOR UNREACHABLE: no Unity Editor reports $repo. Is it open? (unity status --format json; Unity-CLI.md, Connection)"
    exit 2
}

$editor = Invoke-UnityJson $repo @('editor', 'status')
if (-not $editor) {
    Write-Output "EDITOR UNREACHABLE: the Editor for $repo does not answer (a domain reload, a modal dialog, or Safe Mode). Retry in a moment; if it persists, see Unity-CLI.md (Tests: the modal dialog; Compiling: Safe Mode)."
    exit 2
}
$console = Invoke-UnityJson $repo @('console', 'status')
$evalFile = Join-Path $PSScriptRoot 'editor-unsaved-state.eval.cs'
$unsaved = $null
$evalResult = Invoke-UnityJson $repo @('script', 'eval', '--file', $evalFile)
if ($evalResult -and $evalResult.success -and $evalResult.result) {
    try { $unsaved = ([string]$evalResult.result) | ConvertFrom-Json } catch { $unsaved = $null }
}

$problems = @()
if ($editor.status -ne 'ready') { $problems += "Editor status is '$($editor.status)', not ready." }
if ($editor.compiling -or $editor.domainReloadInProgress) { $problems += 'Compiling or reloading the domain: wait until editor status reports compiling false.' }
if ($editor.playMode -ne 'stopped') { $problems += "Play Mode is $($editor.playMode): unity command editor.playmode stop." }
if ($editor.runInBackground) { $problems += 'The Run In Background override is on: unity command editor.playmode set_run_in_background --enabled false.' }
if ($console -and $console.groundTruth -and $console.groundTruth.compilationFailed) {
    $problems += 'The last compile failed: unity command console get --level error; fix it before anyone else uses the Editor.'
}
if (-not $unsaved) {
    $problems += 'Could not read unsaved scenes and prefabs (script eval failed): check them by hand before granting.'
}
else {
    foreach ($scene in @($unsaved.dirtyScenes)) {
        if ($scene) { $problems += "Unsaved changes in scene $scene. Find out whose before saving or discarding; never answer a save dialog for the developer." }
    }
    if ($unsaved.openPrefab) {
        $state = 'open'
        if ($unsaved.openPrefabDirty) { $state = 'open with unsaved changes' }
        $problems += "Prefab Mode has $($unsaved.openPrefab) $state. Builders edit prefabs with LoadPrefabContents and leave Prefab Mode closed."
    }
    if ($unsaved.recoveryFolder) { $problems += 'Assets/_Recovery exists: look inside before deleting it; it may hold the developer''s unsaved scene (Unity-CLI.md, Tests).' }
}

$errorsNote = ''
if ($console -and $console.groundTruth) { $errorsNote = ", $($console.groundTruth.consoleErrors) errors in the Console" }

if ($problems.Count -eq 0) {
    Write-Output "EDITOR FREE: ready, Edit Mode, compiled, nothing unsaved$errorsNote."
    exit 0
}
Write-Output "EDITOR NOT FREE ($($problems.Count)):"
$problems | ForEach-Object { Write-Output "  - $_" }
exit 1
