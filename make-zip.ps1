# Packs the overlay into one zip to send to someone: the app itself, plus the
# game files and set-up you've made (artifacts/ PDFs, icons, maps and zones,
# fonts, portraits, newspaper dates, layouts, theme).
#
# Left out: installed packages (the start script reinstalls them), builds,
# backups, trash and your saved cases. Add -IncludeCases to send cases too.
# -Mini also leaves out the PDFs (most of the size); SETUP.md tells the
# receiver where to put their own copies.
#
#   powershell -ExecutionPolicy Bypass -File make-zip.ps1 [-Mini] [-IncludeCases] [-Out C:\path\file.zip]

param([switch]$Mini, [switch]$IncludeCases, [string]$Out)
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$name = Split-Path $root -Leaf
$parent = Split-Path $root -Parent
if (-not $Out) { $Out = Join-Path $parent $(if ($Mini) { "$name-mini.zip" } else { "$name.zip" }) }
$Out = [IO.Path]::GetFullPath($Out)

Push-Location $root
try {
  # The app: every file git tracks or would track (not ignored), if still there.
  $files = @(git ls-files --cached --others --exclude-standard) | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf }
  if ($LASTEXITCODE -ne 0) { throw "git is needed to list the app's files" }

  # Your data, without dot-folders (index caches, trash, set-aside files) or rolling backups.
  $data = @("icons", "maps", "fonts", "portraits", "papers")
  if (-not $Mini) { $data += "artifacts" }
  if ($IncludeCases) { $data += "cases" }
  foreach ($dir in $data) {
    if (-not (Test-Path $dir)) { continue }
    Get-ChildItem $dir -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($root.Length + 1).Replace("\", "/")
      if ($rel -match "(^|/)\." -or $rel -match "(^|/)state\.\d+\.json$" -or $rel -match "\.broken[-.]") { return }
      $files += $rel
    }
  }
  foreach ($f in @("layouts.json", "theme.json")) { if (Test-Path $f) { $files += $f } }
  $files = $files | Sort-Object -Unique
} finally {
  Pop-Location
}

# tar (built into Windows 10 and later) writes a zip when the name ends in .zip.
# Paths are listed from the parent folder so the zip holds one top folder.
$list = [IO.Path]::GetTempFileName()
[IO.File]::WriteAllLines($list, ($files | ForEach-Object { "$name/$_" }), (New-Object Text.UTF8Encoding $false))
if (Test-Path $Out) { Remove-Item $Out }
Push-Location $parent
try {
  # Windows' own tar, not a GNU tar that may come first on the PATH (Git Bash).
  & (Join-Path $env:SystemRoot "System32\tar.exe") -a -c -f $Out -T $list
  if ($LASTEXITCODE -ne 0) { throw "tar failed" }
} finally {
  Pop-Location
  Remove-Item $list
}

$size = (Get-Item $Out).Length / 1MB
Write-Host ("Wrote {0} ({1} files, {2:N0} MB)" -f $Out, $files.Count, $size)
