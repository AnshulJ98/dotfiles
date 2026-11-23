# theme [name]: the Windows side of config/themes/theme. With no name, list the themes.
# Relinks config/themes/current (WezTerm reads its kitty.conf) and pi's current.json,
# writes the theme into Windows Terminal's "Dotfiles" scheme, and reloads WezTerm.
# In pi, run /reload afterwards.
param([string]$Name)
$ErrorActionPreference = 'Stop'
$DOT = "$HOME\Dev\dotfiles"
$T = "$DOT\config\themes"

function Target($path) {
  $item = Get-Item $path -Force -ErrorAction SilentlyContinue
  if ($item -and $item.LinkType) { Split-Path -Leaf (@($item.Target)[0]) }
}

$themes = Get-ChildItem $T -Directory | Where-Object { $_.Name -ne 'current' -and (Test-Path "$($_.FullName)\kitty.conf") }
if (-not $Name) {
  $cur = Target "$T\current"
  $themes | ForEach-Object { if ($_.Name -eq $cur) { "* $($_.Name)" } else { "  $($_.Name)" } }
  return
}
if ($Name -notin $themes.Name) { throw "theme: no theme named '$Name' (run theme with no argument to list them)" }

function Relink($link, $target, [switch]$Dir) {
  if (Test-Path $link) { if ($Dir) { cmd /c rmdir "`"$link`"" } else { Remove-Item $link -Force } }
  $flag = if ($Dir) { '/D' } else { '' }
  cmd /c "mklink $flag `"$link`" `"$target`"" | Out-Null
  if ($LASTEXITCODE) { throw "mklink failed: $link" }
}
Relink "$T\current" $Name -Dir                                    # relative, as on macOS
Relink "$DOT\config\pi\themes\current.json" "$T\$Name\pi.json"   # ~/.pi/agent/themes links here

# Windows Terminal: kitty.conf -> scheme "Dotfiles", used by every profile.
$k = @{}
foreach ($line in Get-Content "$T\$Name\kitty.conf") {
  if ($line -match '^\s*(\w+)\s+(#[0-9a-fA-F]{6})') { $k[$Matches[1]] = $Matches[2] }
}
$scheme = [ordered]@{
  name = 'Dotfiles'; foreground = $k.foreground; background = $k.background
  cursorColor = $k.cursor; selectionBackground = $k.selection_background
  black = $k.color0; red = $k.color1; green = $k.color2; yellow = $k.color3
  blue = $k.color4; purple = $k.color5; cyan = $k.color6; white = $k.color7
  brightBlack = $k.color8; brightRed = $k.color9; brightGreen = $k.color10; brightYellow = $k.color11
  brightBlue = $k.color12; brightPurple = $k.color13; brightCyan = $k.color14; brightWhite = $k.color15
}
$wt = "$env:LOCALAPPDATA\Packages\Microsoft.WindowsTerminal_8wekyb3d8bbwe\LocalState\settings.json"
if (Test-Path $wt) {
  $s = Get-Content $wt -Raw | ConvertFrom-Json
  $s.schemes = @(@($s.schemes | Where-Object { $_.name -ne 'Dotfiles' }) + [pscustomobject]$scheme)
  $s.profiles.defaults | Add-Member -Force colorScheme 'Dotfiles'
  $s | ConvertTo-Json -Depth 32 | Set-Content $wt -Encoding utf8
}

# WezTerm reloads when its config file changes.
(Get-Item "$DOT\config\wezterm\wezterm.lua").LastWriteTime = Get-Date

# bat (and delta through it) reads themes from its cache; current.tmTheme follows the link.
if (Get-Command bat -ErrorAction SilentlyContinue) {
  bat cache --build | Out-Null
  if ($LASTEXITCODE) { Write-Warning 'bat cache did not rebuild' }
}

"theme: $Name. In pi run /reload; restart yazi and lazygit; new prompts pick it up in WezTerm now."
