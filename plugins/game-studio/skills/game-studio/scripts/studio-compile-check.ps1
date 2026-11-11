<#
.SYNOPSIS
  Compiles the game's C# outside the Unity Editor: the working tree with lanes' drafts laid over it.

.DESCRIPTION
  Builds copies of every C# project Unity generated in the project root (Assembly-CSharp, Assembly-CSharp-Editor, one
  per .asmdef, the firstpass assemblies) with dotnet, into .studio\compile\<key>\. Each .cs file under Assets\ goes to
  the assembly Unity would compile it into: the nearest .asmdef or .asmref above it, else Assembly-CSharp, its
  -Editor and -firstpass variants by folder. A lane's draft replaces the file at its path, or adds a new one.
  Nothing in Assets\, Library\ or the running Editor changes, so a worker can get its drafts compiling while another
  agent holds the Editor. The Editor's own compile, after landing, stays the final word: platform and define
  constraints, source generators and anything Unity adds at compile time are not modelled here.

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

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
    Write-Output 'COMPILE CHECK UNAVAILABLE: dotnet is not installed. Install a .NET SDK, or compile in an Editor turn.'
    exit 2
}

# Unity's generated projects, one per assembly, named after the assembly.
$projects = @{}
foreach ($file in @(Get-ChildItem -Path $repo -Filter '*.csproj' -File)) {
    $projects[[System.IO.Path]::GetFileNameWithoutExtension($file.Name).ToLowerInvariant()] = $file.FullName
}
if ($projects.Count -eq 0) {
    Write-Output 'COMPILE CHECK UNAVAILABLE: no .csproj files in the project root. Unity writes them when the Editor syncs the IDE projects (an external script editor set in Preferences, then Assets > Open C# Project); until then, compile in an Editor turn.'
    exit 2
}
Register-StudioIgnore $repo

function Read-JsonFile([string] $Path) {
    try { return ((Get-Content -Raw -Path $Path) | ConvertFrom-Json) } catch { return $null }
}

# Assembly definitions under Assets\ and embedded packages: folder -> assembly name. An .asmref joins its folder to
# another assembly, named directly or by the GUID of the .asmdef's .meta.
$asmdefByGuid = @{}
$assemblyByFolder = @{}
$asmrefs = @()
$definitionRoots = @((Join-Path $repo 'Assets'), (Join-Path $repo 'Packages')) | Where-Object { Test-Path $_ }
foreach ($root in $definitionRoots) {
    foreach ($file in @(Get-ChildItem -Path $root -Recurse -File -Include '*.asmdef', '*.asmref')) {
        $rel = $file.FullName.Substring($repo.Length + 1)
        if (Test-UnityIgnored $rel) { continue }
        $folder = (Split-Path $rel).ToLowerInvariant()
        $json = Read-JsonFile $file.FullName
        if (-not $json) { continue }
        if ($file.Extension -ieq '.asmdef') {
            if (-not $json.name) { continue }
            $assemblyByFolder[$folder] = [string]$json.name
            $meta = $file.FullName + '.meta'
            if (Test-Path $meta) {
                $guidLine = Get-Content -Path $meta | Where-Object { $_ -match '^guid:\s*([0-9a-fA-F]+)' } | Select-Object -First 1
                if ($guidLine -match '^guid:\s*([0-9a-fA-F]+)') { $asmdefByGuid[$Matches[1].ToLowerInvariant()] = [string]$json.name }
            }
        }
        else { $asmrefs += [pscustomobject]@{ Folder = $folder; Reference = [string]$json.reference } }
    }
}
foreach ($asmref in $asmrefs) {
    $target = $asmref.Reference
    if ($target -match '^GUID:([0-9a-fA-F]+)$') {
        $guid = $Matches[1].ToLowerInvariant()
        if ($asmdefByGuid.ContainsKey($guid)) { $target = $asmdefByGuid[$guid] } else { $target = $null }
    }
    if ($target) { $assemblyByFolder[$asmref.Folder] = $target }
}

# The assembly Unity compiles a .cs file into, or $null when it compiles into none (a package folder with no asmdef).
function Resolve-Assembly([string] $RelativePath) {
    $folder = (Split-Path $RelativePath).ToLowerInvariant()
    while ($folder) {
        if ($assemblyByFolder.ContainsKey($folder)) { return $assemblyByFolder[$folder] }
        $folder = Split-Path $folder
    }
    if (-not $RelativePath.StartsWith('Assets\', [System.StringComparison]::OrdinalIgnoreCase)) { return $null }
    $lower = $RelativePath.ToLowerInvariant()
    $firstpass = $lower.StartsWith('assets\plugins\') -or $lower.StartsWith('assets\standard assets\') -or
        $lower.StartsWith('assets\pro standard assets\')
    $name = 'Assembly-CSharp'
    if (Test-EditorScript $RelativePath) { $name += '-Editor' }
    if ($firstpass) { $name += '-firstpass' }
    return $name
}

function Get-ProjectCompileItems([string] $ProjectPath) {
    [xml] $xml = Get-Content -Raw -Path $ProjectPath
    $items = @()
    foreach ($node in @($xml.SelectNodes("//*[local-name()='Compile']"))) {
        $include = $node.GetAttribute('Include')
        if (-not $include) { continue }
        $include = $include -replace '/', '\'
        if (-not [System.IO.Path]::IsPathRooted($include)) { $include = Join-Path $repo $include }
        $items += [System.IO.Path]::GetFullPath($include)
    }
    return $items
}

# Sources keyed by lower-cased path, so a draft replaces the working tree's file at the same path.
$sources = @{}
function Add-Source([string] $Key, [string] $Rel, [string] $Path, [string] $Assembly, [string] $LaneName) {
    $script:sources[$Key] = [pscustomobject]@{ Rel = $Rel; Path = $Path; Assembly = $Assembly; Lane = $LaneName }
}

# Package sources (embedded or local packages, and registry packages if Unity was told to generate their projects)
# come from the generated projects themselves; everything under Assets\ is read from disk, so files added or deleted
# since the projects were generated count as they are now.
$assetsPrefix = (Join-Path $repo 'Assets') + '\'
foreach ($assemblyKey in $projects.Keys) {
    $assembly = [System.IO.Path]::GetFileNameWithoutExtension($projects[$assemblyKey])
    foreach ($path in (Get-ProjectCompileItems $projects[$assemblyKey])) {
        if ($path.StartsWith($assetsPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
        $rel = $path
        if ($path.StartsWith($repo + '\', [System.StringComparison]::OrdinalIgnoreCase)) { $rel = $path.Substring($repo.Length + 1) }
        Add-Source $rel.ToLowerInvariant() $rel $path $assembly $null
    }
}
foreach ($file in (Get-ChildItem -Path (Join-Path $repo 'Assets') -Recurse -File -Filter '*.cs' | Where-Object { $_.Extension -eq '.cs' })) {
    $rel = $file.FullName.Substring($repo.Length + 1)
    if (Test-UnityIgnored $rel) { continue }
    Add-Source $rel.ToLowerInvariant() $rel $file.FullName (Resolve-Assembly $rel) $null
}

$draftCount = 0
foreach ($laneName in $lanes) {
    $draftRoot = Join-Path (Get-StudioDir $repo 'drafts') $laneName
    if (-not (Test-Path $draftRoot)) { continue }
    foreach ($file in (Get-ChildItem -Path $draftRoot -Recurse -File -Filter '*.cs' | Where-Object { $_.Extension -eq '.cs' })) {
        $rel = $file.FullName.Substring($draftRoot.Length + 1)
        $inProject = $rel.StartsWith('Assets\', [System.StringComparison]::OrdinalIgnoreCase) -or
            $rel.StartsWith('Packages\', [System.StringComparison]::OrdinalIgnoreCase)
        if (-not $inProject -or (Test-UnityIgnored $rel)) { continue }
        $key = $rel.ToLowerInvariant()
        if ($sources.ContainsKey($key) -and $sources[$key].Lane) {
            Write-Output "COMPILE CHECK REFUSED: lanes '$($sources[$key].Lane)' and '$laneName' both draft $rel. One path has one owner."
            exit 2
        }
        $assembly = $null
        if ($sources.ContainsKey($key)) { $assembly = $sources[$key].Assembly } else { $assembly = Resolve-Assembly $rel }
        Add-Source $key $rel $file.FullName $assembly $laneName
        $draftCount++
    }
}

# Group the sources by assembly. A file whose assembly has no generated project can't be checked here.
$filesByAssembly = @{}
foreach ($assemblyKey in $projects.Keys) { $filesByAssembly[$assemblyKey] = @() }
$unchecked = @()
foreach ($source in ($sources.Values | Sort-Object Rel)) {
    if (-not $source.Assembly) { continue }
    $assemblyKey = $source.Assembly.ToLowerInvariant()
    if ($filesByAssembly.ContainsKey($assemblyKey)) { $filesByAssembly[$assemblyKey] += $source.Path }
    else { $unchecked += $source }
}

$key = 'tree'
if ($lanes.Count -gt 0) { $key = ($lanes | Sort-Object) -join '+' }
$outDir = Join-Path (Get-StudioDir $repo 'compile') $key
if (Test-Path $outDir) { Get-ChildItem -Path $outDir -Filter '*.csproj' -File | Remove-Item -Force }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Write-CheckProject([string] $SourceProject, [string] $DestinationProject, [string[]] $Files, [string] $Root) {
    [xml] $xml = Get-Content -Raw -Path $SourceProject
    $ns = $xml.DocumentElement.NamespaceURI

    # The generated file lists its sources and IDE extras relative to the repository; this copy lists its own.
    foreach ($itemName in @('Compile', 'None')) {
        foreach ($node in @($xml.SelectNodes("//*[local-name()='$itemName']"))) { [void]$node.ParentNode.RemoveChild($node) }
    }
    # Assemblies are referenced relative to the project (Library\ScriptAssemblies, Library\PackageCache): the copy lives
    # elsewhere, so make them absolute. Project references name the sibling .csproj, which the copy has beside it too.
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
    $settings = [ordered]@{
        'BaseIntermediateOutputPath' = (Join-Path $Root "obj\$assemblyName") + '\'
        'IntermediateOutputPath'     = (Join-Path $Root "obj\$assemblyName") + '\'
        'OutputPath'                 = (Join-Path $Root "bin\$assemblyName") + '\'
    }
    $firstGroup = $xml.SelectSingleNode("//*[local-name()='PropertyGroup']")
    foreach ($name in $settings.Keys) {
        $nodes = @($xml.SelectNodes("//*[local-name()='$name']"))
        foreach ($node in $nodes) { $node.InnerText = $settings[$name] }
        if ($nodes.Count -eq 0 -and $firstGroup) {
            $node = $xml.CreateElement($name, $ns)
            $node.InnerText = $settings[$name]
            [void]$firstGroup.AppendChild($node)
        }
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

$copies = @()
$fileCount = 0
foreach ($assemblyKey in ($projects.Keys | Sort-Object)) {
    $source = $projects[$assemblyKey]
    $destination = Join-Path $outDir ([System.IO.Path]::GetFileName($source))
    Write-CheckProject $source $destination $filesByAssembly[$assemblyKey] $outDir
    $copies += $destination
    $fileCount += $filesByAssembly[$assemblyKey].Count
}

# One entry project builds them all, each once, in dependency order.
$entry = Join-Path $outDir 'studio-check.proj'
$entryXml = @"
<Project DefaultTargets="Build">
  <ItemGroup>
$(($copies | ForEach-Object { "    <CheckProject Include=`"$([System.Security.SecurityElement]::Escape([System.IO.Path]::GetFileName($_)))`" />" }) -join "`r`n")
  </ItemGroup>
  <Target Name="Restore"><MSBuild Projects="@(CheckProject)" Targets="Restore" /></Target>
  <Target Name="Build"><MSBuild Projects="@(CheckProject)" Targets="Build" BuildInParallel="true" /></Target>
</Project>
"@
Set-Content -Path $entry -Value $entryXml -Encoding UTF8

$started = Get-Date
$previous = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$log = & dotnet build $entry -nologo -v:minimal -clp:NoSummary -p:GenerateFullPaths=true 2>$null
$exitCode = $LASTEXITCODE
$ErrorActionPreference = $previous
$seconds = [int]((Get-Date) - $started).TotalSeconds

$errors = @()
$warnings = @()
foreach ($line in $log) {
    $text = ([string]$line) -replace '\s+\[[^\]]+\.(csproj|proj)\]\s*$', ''
    if ($text -match ':\s+error\s+[A-Z]+\d+') { if ($errors -notcontains $text) { $errors += $text } }
    elseif ($text -match ':\s+warning\s+[A-Z]+\d+') { if ($warnings -notcontains $text) { $warnings += $text } }
}

$scope = 'working tree'
if ($lanes.Count -gt 0) { $scope = "working tree + drafts of $($lanes -join ', ') ($draftCount .cs)" }
$uncheckedNote = ''
if ($unchecked.Count -gt 0) {
    $names = @($unchecked | ForEach-Object { $_.Assembly } | Sort-Object -Unique) -join ', '
    $uncheckedNote = " $($unchecked.Count) files not checked: no generated project for $names (new asmdef, or projects out of date; the Editor's compile will check them)."
}

if ($exitCode -eq 0 -and $errors.Count -eq 0) {
    Write-Output "COMPILE CHECK PASSED: $scope; $fileCount files in $($projects.Count) assemblies, $($warnings.Count) warnings, ${seconds}s.$uncheckedNote"
    $unchecked | Where-Object { $_.Lane } | ForEach-Object { Write-Output "  not checked: [draft $($_.Lane)] $($_.Rel) ($($_.Assembly))" }
    if ($ShowWarnings) { $warnings | ForEach-Object { Write-Output "  $_" } }
    exit 0
}

Write-Output "COMPILE CHECK FAILED: $scope; $($errors.Count) errors, $($warnings.Count) warnings, ${seconds}s.$uncheckedNote"
if ($errors.Count -gt 0) {
    # Each error is either in a lane's draft or in a project file. While another lane holds the Editor, its files
    # under Assets\ can be mid-change, so a project error may be theirs, not yours.
    $draftsMarker = '\.studio\drafts\'
    $draftErrors = 0
    $labelled = @()
    foreach ($message in $errors) {
        $at = $message.IndexOf($draftsMarker, [System.StringComparison]::OrdinalIgnoreCase)
        if ($at -ge 0) {
            $draftLane = ($message.Substring($at + $draftsMarker.Length) -split '\\')[0]
            $labelled += "[draft $draftLane] $message"
            $draftErrors++
        }
        else { $labelled += "[project] $message" }
    }
    $projectErrors = $errors.Count - $draftErrors
    Write-Output "  $draftErrors in drafts, $projectErrors in project files."
    $labelled | Select-Object -First 60 | ForEach-Object { Write-Output "  $_" }
    if ($errors.Count -gt 60) { Write-Output "  ... $($errors.Count - 60) more" }
    if ($draftErrors -eq 0) {
        Write-Output '  Your drafts compiled; every error is in a project file. If another lane holds the Editor, its files may be mid-change: check again after its turn, and report only errors that stay.'
    }
}
else {
    # dotnet failed without compiler errors (restore, SDK or project trouble): show its own words.
    $log | Select-Object -Last 25 | ForEach-Object { Write-Output "  $_" }
}
if ($ShowWarnings) { $warnings | ForEach-Object { Write-Output "  $_" } }
exit 1
