# Shared PowerShell profile for Windows PowerShell 5.1 and PowerShell 7, the Windows
# counterpart of home/.zshrc and home/.zsh-colors.zsh.
# WezTerm and Windows Terminal start PowerShell with -NoProfile and dot-source this file,
# because $PROFILE lives in OneDrive Documents and fails while OneDrive is not running.
# The 5.1 $PROFILE is also a one-line stub to this file, for other hosts.
$DOT = "$HOME\Dev\dotfiles"
$e = [char]27

# PowerShell 7 searches OneDrive\Documents\PowerShell\Modules first. Its copies (old
# PSReadLine, posh-git, the retired oh-my-posh module) are cloud-only placeholders that
# fail to load, and pwsh bundles a newer PSReadLine, so leave that folder out. posh-git
# is saved to ~/.local/share/powershell/Modules instead (Save-Module posh-git -Path ...).
if ($PSVersionTable.PSEdition -eq 'Core') {
  $docsModules = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'PowerShell\Modules'
  $env:PSModulePath = ($env:PSModulePath -split ';' | Where-Object { $_ -and $_ -ne $docsModules }) -join ';'
}
$dotModules = "$HOME\.local\share\powershell\Modules"

# Tool init scripts are generated once and regenerated when the tool's binary changes,
# saving a process start per tool on every new shell.
$dotCache = "$env:LOCALAPPDATA\dotfiles\pwsh"
# Tools are found by their install path: each Get-Command miss searches all of PATH (40-90 ms).
# For scoop apps this is the app's own exe, whose date changes on update (the shim's does not).
function Get-DotExe([string]$Name, [string[]]$Paths = @("$HOME\scoop\apps\$Name\current\$Name.exe")) {
  foreach ($p in $Paths) { if (Test-Path $p) { return $p } }
}
function Get-DotInit([string]$Name, [string]$Exe, [scriptblock]$Make) {
  $f = "$dotCache\$Name.ps1"
  if (-not (Test-Path $f) -or (Get-Item $f).LastWriteTimeUtc -lt (Get-Item $Exe).LastWriteTimeUtc) {
    New-Item -ItemType Directory -Force $dotCache | Out-Null
    (& $Make) -join "`n" | Set-Content $f -Encoding utf8
  }
  $f
}

# Prompt: oh-my-posh port of home/.p10k.zsh (classic, darkest, two lines, full frame).
$omp = "$env:LOCALAPPDATA\Programs\oh-my-posh\bin\oh-my-posh.exe"
if (-not (Test-Path $omp)) { $omp = (Get-Command oh-my-posh -ErrorAction SilentlyContinue).Source }
if ($omp) {
  & $omp init pwsh --config "$DOT\config\powershell\p10k-classic.omp.json" | Invoke-Expression
}

# Report the folder to the terminal so new tabs, windows and splits open in it:
# OSC 7 for WezTerm, OSC 9;9 for Windows Terminal. oh-my-posh calls Set-PoshContext
# before each prompt, which keeps its own handling of the last command's status. Hooked by
# alias, as oh-my-posh documents: its module would otherwise resolve its own empty function.
function global:Send-DotCwd {
  $loc = $executionContext.SessionState.Path.CurrentLocation
  if ($loc.Provider.Name -ne 'FileSystem') { return }
  $p = $loc.ProviderPath
  $e = [char]27
  [Console]::Write("$e]7;file://$env:COMPUTERNAME/$($p -replace '\\', '/')$e\$e]9;9;`"$p`"$e\")
}
New-Alias -Name Set-PoshContext -Value Send-DotCwd -Scope Global -Force

# theme [name]: switch WezTerm, Windows Terminal, pi and bat to config/themes/<name>.
function theme {
  $ps = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }
  & $ps -NoProfile -File "$DOT\config\powershell\theme.ps1" @args
}

# PSReadLine, set up like zsh: emacs keys, a long shared history, inline suggestions.
# Loaded by now: the console host imports it, and so does the oh-my-posh init.
if (Get-Module PSReadLine) {
  Set-PSReadLineOption -EditMode Emacs
  # Emacs mode keeps Ctrl+A/E/K/U/W, Alt+B/F, Ctrl+R and Ctrl+D (exit on an empty line);
  # copy and paste stay on Ctrl+C / Ctrl+V as elsewhere on Windows.
  Set-PSReadLineKeyHandler -Chord Ctrl+c -Function CopyOrCancelLine
  Set-PSReadLineKeyHandler -Chord Ctrl+v -Function Paste
  Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
  Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
  Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward
  # Word jumps, as in kitty.
  Set-PSReadLineKeyHandler -Chord Alt+LeftArrow, Ctrl+LeftArrow -Function BackwardWord
  Set-PSReadLineKeyHandler -Chord Alt+RightArrow, Ctrl+RightArrow -Function ForwardWord

  # zsh: HISTSIZE=50000 with dupes dropped. PSReadLine's history file is already shared
  # by every session and appended after each command.
  Set-PSReadLineOption -MaximumHistoryCount 50000 -HistoryNoDuplicates -HistorySaveStyle SaveIncrementally

  # Colours as ANSI indexes, so they follow the terminal theme (home/.zsh-colors.zsh):
  # foreground only, comments and suggestions in bright black, selection on 235.
  $colors = @{
    Default = "$e[39m"; Command = "$e[32m"; Parameter = "$e[36m"; String = "$e[33m"
    Variable = "$e[35m"; Keyword = "$e[34;1m"; Operator = "$e[39m"; Number = "$e[39m"
    Type = "$e[36m"; Member = "$e[39m"; Comment = "$e[90m"; Error = "$e[31;1m"
    Selection = "$e[48;5;235m"; Emphasis = "$e[33;1m"; ContinuationPrompt = "$e[90m"
  }
  try {
    # zsh-autosuggestions: grey inline text, Right arrow (or End, Ctrl+E) accepts it.
    # F2 switches to the list view.
    Set-PSReadLineOption -PredictionSource History -PredictionViewStyle InlineView
    $colors.InlinePrediction = "$e[90m"
    $colors.ListPrediction = "$e[33m"
    $colors.ListPredictionSelected = "$e[48;5;235m"
  } catch {} # PSReadLine < 2.2 (stock 5.1) has no predictions
  Set-PSReadLineOption -Colors $colors
}

# Colours for ls (eza), bat and fzf, from home/.zsh-colors.zsh.
$env:LS_COLORS = 'di=1;34:ln=36:so=35:pi=33:ex=32:bd=1;33:cd=33:su=1;31:sg=1;33:tw=4;34:ow=34:st=4;34:or=4;31:mi=4;31:ca=31'
$env:BAT_THEME = 'current'
$env:FZF_DEFAULT_OPTS = '--color=fg:-1,bg:-1,hl:3,hl+:3,fg+:-1:bold,bg+:235,gutter:-1,prompt:4,pointer:1,marker:2,spinner:8,info:8,header:8,border:8,label:8,separator:8,scrollbar:8,preview-border:8'
# lazygit merges the active theme's colours over the repo config.
$env:LG_CONFIG_FILE = "$DOT\config\lazygit\config.yml,$DOT\config\themes\current\lazygit.yml"
# yazi needs `file` for mime types; Git for Windows ships one.
$gitFile = "$env:ProgramFiles\Git\usr\bin\file.exe"
if (Test-Path $gitFile) { $env:YAZI_FILE_ONE = $gitFile }

# Aliases from home/.zshrc.
Set-Alias c Clear-Host
function .. { Set-Location .. }
function ... { Set-Location ..\.. }
if (Get-DotExe nvim @("$HOME\scoop\apps\neovim\current\bin\nvim.exe")) { Set-Alias vim nvim }
if (Get-DotExe code-insiders @("$env:LOCALAPPDATA\Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd")) {
  Set-Alias code code-insiders
}
if (Get-DotExe eza) {
  Remove-Item Alias:ls -Force -ErrorAction SilentlyContinue
  function ls { eza @args }
  function la { eza -la @args }
  function ll { eza -l @args }
} else {
  function la { Get-ChildItem -Force @args }
  function ll { Get-ChildItem @args }
}

# zoxide: z and zi.
$zoxide = Get-DotExe zoxide
if ($zoxide) { . (Get-DotInit zoxide $zoxide { & $zoxide init powershell }) }

# gh completion.
# Its script runs `gh __complete` with stderr going to the console, so every Tab printed
# "Completion ended with directive". Checked against gh 2.105.0 (cobra's script).
$gh = Get-DotExe gh @("$env:ProgramFiles\GitHub CLI\gh.exe", "$HOME\scoop\apps\gh\current\bin\gh.exe")
if ($gh) {
  . (Get-DotInit gh $gh {
      $s = (& $gh completion -s powershell) -join "`n"
      $leak = 'Invoke-Expression -OutVariable out "$RequestComp" 2>&1'
      if (-not $s.Contains($leak)) { Write-Warning "gh completion changed shape; Tab may print gh's debug line" }
      $s.Replace($leak, 'Invoke-Expression -OutVariable out "$RequestComp 2>`$null"')
    })
}

# posh-git's git completion, imported on the first Tab after `git` so startup stays fast.
# Importing it replaces this completer with posh-git's own; the padding is posh-git's.
if (Test-Path "$dotModules\posh-git") {
  Register-ArgumentCompleter -CommandName git, tgit, gitk -Native -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)
    Import-Module "$HOME\.local\share\powershell\Modules\posh-git" -Global
    $padLength = $cursorPosition - $commandAst.Extent.StartOffset
    Expand-GitCommand $commandAst.ToString().PadRight($padLength, ' ').Substring(0, $padLength)
  }
}

# y: yazi, and quitting with q leaves the shell in yazi's last folder (yazi's quick start).
function y {
  $tmp = (New-TemporaryFile).FullName
  yazi $args --cwd-file="$tmp"
  $cwd = Get-Content -Path $tmp -Encoding UTF8
  if (-not [String]::IsNullOrEmpty($cwd) -and $cwd -ne $PWD.Path) {
    Set-Location -LiteralPath (Resolve-Path -LiteralPath $cwd).Path
  }
  Remove-Item -Path $tmp
}

# Claude Code, as in home/.zshrc; the GitHub MCP server reads the token.
if (Get-DotExe claude @("$HOME\.local\bin\claude.exe", "$env:APPDATA\npm\claude.cmd")) {
  function yolo { claude --dangerously-skip-permissions @args }
  function claude-plan { claude --permission-mode plan @args }
  function claude-orch { claude --agent orchestrator @args }
  if ($gh) { $env:GITHUB_PERSONAL_ACCESS_TOKEN = & $gh auth token 2>$null }
}

# Chocolatey tab completion, if installed.
$ChocolateyProfile = "$env:ChocolateyInstall\helpers\chocolateyProfile.psm1"
if ($env:ChocolateyInstall -and (Test-Path $ChocolateyProfile)) { Import-Module $ChocolateyProfile }

# Per-machine additions: config/powershell/local.ps1 (gitignored).
if (Test-Path "$DOT\config\powershell\local.ps1") { . "$DOT\config\powershell\local.ps1" }
