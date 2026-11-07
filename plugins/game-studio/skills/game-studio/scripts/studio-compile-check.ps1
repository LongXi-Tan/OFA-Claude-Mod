<#
.SYNOPSIS
  Compiles the game's C# outside the Unity Editor: the working tree with lanes' drafts laid over it.

.DESCRIPTION
  Builds copies of Unity's generated Assembly-CSharp and Assembly-CSharp-Editor projects with dotnet, from every .cs
  file under Assets\ (a lane's draft replaces the file at its path, or adds a new one), into .studio\compile\<key>\.
  Nothing in Assets\, Library\ or the running Editor changes, so a worker can get its drafts compiling while another
  agent holds the Editor. The Editor's own compile, after landing, stays the final word.

.PARAMETER Lane
  Lanes whose drafts are laid over the working tree. Omit to check the working tree alone.

.PARAMETER AllLanes
  Lay every lane's drafts over the working tree: the project as it will be once everyone has landed.

.PARAMETER ShowWarnings
  Also list the compiler's warnings (by default only their count).

.EXAMPLE
  powershell -NoProfile -File <skill dir>\scripts\studio-compile-check.ps1 -Lane code
#>
param(
    [string[]] $Lane = @(),
    [switch] $AllLanes,
    [switch] $ShowWarnings
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'studio-common.ps1')

$repo = Get-StudioRepo
$lanes = @()
if ($AllLanes) { $lanes = @(Get-StudioLanes $repo) }
else {
    foreach ($name in $Lane) {
        foreach ($part in ($name -split ',')) {
            $trimmed = $part.Trim()
            if ($trimmed) { Assert-LaneName $trimmed; $lanes += $trimmed }
        }
    }
}

foreach ($generated in @('Assembly-CSharp.csproj', 'Assembly-CSharp-Editor.csproj')) {
    if (-not (Test-Path (Join-Path $repo $generated))) {
        Write-Output "COMPILE CHECK UNAVAILABLE: $generated is missing. Unity writes it when the Editor syncs the IDE projects; ask the lead for an Editor turn and compile there."
        exit 2
    }
}

# Sources keyed by lower-cased repo-relative path, so a draft replaces the working tree's file at the same path.
$sources = @{}
$assetsRoot = Join-Path $repo 'Assets'
foreach ($file in (Get-ChildItem -Path $assetsRoot -Recurse -File -Filter '*.cs' | Where-Object { $_.Extension -eq '.cs' })) {
    $rel = $file.FullName.Substring($repo.Length + 1)
    if (Test-UnityIgnored $rel) { continue }
    $sources[$rel.ToLowerInvariant()] = [pscustomobject]@{ Rel = $rel; Path = $file.FullName; Lane = $null }
}

$draftCount = 0
foreach ($laneName in $lanes) {
    $draftRoot = Join-Path (Get-StudioDir $repo 'drafts') $laneName
    if (-not (Test-Path $draftRoot)) { continue }
    foreach ($file in (Get-ChildItem -Path $draftRoot -Recurse -File -Filter '*.cs' | Where-Object { $_.Extension -eq '.cs' })) {
        $rel = $file.FullName.Substring($draftRoot.Length + 1)
        if (-not $rel.StartsWith('Assets\', [System.StringComparison]::OrdinalIgnoreCase)) { continue }
        if (Test-UnityIgnored $rel) { continue }
        $key = $rel.ToLowerInvariant()
        if ($sources.ContainsKey($key) -and $sources[$key].Lane) {
            Write-Output "COMPILE CHECK REFUSED: lanes '$($sources[$key].Lane)' and '$laneName' both draft $rel. One path has one owner."
            exit 2
        }
        $sources[$key] = [pscustomobject]@{ Rel = $rel; Path = $file.FullName; Lane = $laneName }
        $draftCount++
    }
}

$runtimeFiles = @()
$editorFiles = @()
foreach ($source in ($sources.Values | Sort-Object Rel)) {
    if (Test-EditorScript $source.Rel) { $editorFiles += $source.Path } else { $runtimeFiles += $source.Path }
}

$key = 'tree'
if ($lanes.Count -gt 0) { $key = ($lanes | Sort-Object) -join '+' }
$outDir = Join-Path (Get-StudioDir $repo 'compile') $key
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Write-CheckProject([string] $SourceProject, [string] $DestinationProject, [string[]] $Files, [string] $Root) {
    [xml] $xml = Get-Content -Raw -Path $SourceProject
    $ns = $xml.DocumentElement.NamespaceURI

    # The generated file lists its sources and IDE extras relative to the repository; this copy lists its own.
    foreach ($itemName in @('Compile', 'None')) {
        foreach ($node in @($xml.SelectNodes("//*[local-name()='$itemName']"))) { [void]$node.ParentNode.RemoveChild($node) }
    }
    # Package assemblies are referenced relative to the repository (Library\ScriptAssemblies, Library\PackageCache):
    # the copy lives elsewhere, so make them absolute.
    foreach ($node in @($xml.SelectNodes("//*[local-name()='HintPath']"))) {
        if (-not [System.IO.Path]::IsPathRooted($node.InnerText)) { $node.InnerText = Join-Path $repo $node.InnerText }
    }
    foreach ($node in @($xml.SelectNodes("//*[local-name()='Analyzer']"))) {
        $include = $node.GetAttribute('Include')
        if ($include -and -not [System.IO.Path]::IsPathRooted($include)) {
            $include = Join-Path $repo $include
            $node.SetAttribute('Include', $include)
        }
        # An IDE analyzer that is no longer installed would only add noise.
        if ($include -and -not (Test-Path $include)) { [void]$node.ParentNode.RemoveChild($node) }
    }

    $assemblyName = [System.IO.Path]::GetFileNameWithoutExtension($SourceProject)
    $settings = @{
        'BaseIntermediateOutputPath' = (Join-Path $Root "obj\$assemblyName") + '\'
        'IntermediateOutputPath'     = (Join-Path $Root "obj\$assemblyName") + '\'
        'OutputPath'                 = (Join-Path $Root 'bin') + '\'
    }
    foreach ($name in $settings.Keys) {
        foreach ($node in @($xml.SelectNodes("//*[local-name()='$name']"))) { $node.InnerText = $settings[$name] }
    }

    $group = $xml.CreateElement('ItemGroup', $ns)
    foreach ($path in $Files) {
        $item = $xml.CreateElement('Compile', $ns)
        $item.SetAttribute('Include', $path)
        [void]$group.AppendChild($item)
    }
    $targets = $xml.SelectSingleNode("//*[local-name()='Import' and @Project='Sdk.targets']")
    if ($targets) { [void]$targets.ParentNode.InsertBefore($group, $targets) } else { [void]$xml.DocumentElement.AppendChild($group) }

    $xml.Save($DestinationProject)
}

$runtimeProject = Join-Path $outDir 'Assembly-CSharp.csproj'
$editorProject = Join-Path $outDir 'Assembly-CSharp-Editor.csproj'
Write-CheckProject (Join-Path $repo 'Assembly-CSharp.csproj') $runtimeProject $runtimeFiles $outDir
# The editor project's ProjectReference names Assembly-CSharp.csproj beside it: the copy just written.
Write-CheckProject (Join-Path $repo 'Assembly-CSharp-Editor.csproj') $editorProject $editorFiles $outDir

$started = Get-Date
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$log = & dotnet build $editorProject -nologo -v:minimal -clp:NoSummary -p:GenerateFullPaths=true 2>$null
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $previous
$seconds = [int]((Get-Date) - $started).TotalSeconds

$errors = @()
$warnings = @()
foreach ($line in $log) {
    $text = ([string]$line) -replace '\s+\[[^\]]+\.csproj\]\s*$', ''
    if ($text -match ':\s+error\s+[A-Z]+\d+') { if ($errors -notcontains $text) { $errors += $text } }
    elseif ($text -match ':\s+warning\s+[A-Z]+\d+') { if ($warnings -notcontains $text) { $warnings += $text } }
}

$scope = 'working tree'
if ($lanes.Count -gt 0) { $scope = "working tree + drafts of $($lanes -join ', ') ($draftCount .cs)" }
$fileCount = $runtimeFiles.Count + $editorFiles.Count

if ($exitCode -eq 0 -and $errors.Count -eq 0) {
    Write-Output "COMPILE CHECK PASSED: $scope; $fileCount files ($($runtimeFiles.Count) runtime, $($editorFiles.Count) editor), $($warnings.Count) warnings, ${seconds}s."
    if ($ShowWarnings) { $warnings | ForEach-Object { Write-Output "  $_" } }
    exit 0
}

Write-Output "COMPILE CHECK FAILED: $scope; $($errors.Count) errors, $($warnings.Count) warnings, ${seconds}s."
if ($errors.Count -gt 0) {
    $errors | Select-Object -First 60 | ForEach-Object { Write-Output "  $_" }
    if ($errors.Count -gt 60) { Write-Output "  ... $($errors.Count - 60) more" }
}
else {
    # dotnet failed without compiler errors (restore, SDK or project trouble): show its own words.
    $log | Select-Object -Last 25 | ForEach-Object { Write-Output "  $_" }
}
if ($ShowWarnings) { $warnings | ForEach-Object { Write-Output "  $_" } }
exit 1
