# Shared PowerShell profile for Windows PowerShell 5.1 and PowerShell 7.
# WezTerm and Windows Terminal start PowerShell with -NoProfile and dot-source this file,
# because $PROFILE lives in OneDrive Documents and fails while OneDrive is not running.
# The 5.1 $PROFILE is also a one-line stub to this file, for other hosts.
$DOT = "$HOME\Dev\dotfiles"

# PowerShell 7 searches OneDrive\Documents\PowerShell\Modules first. Its copies (old
# PSReadLine, posh-git, the retired oh-my-posh module) are cloud-only placeholders that
# fail to load, and pwsh bundles a newer PSReadLine, so leave that folder out.
if ($PSVersionTable.PSEdition -eq 'Core') {
  $docsModules = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'PowerShell\Modules'
  $env:PSModulePath = ($env:PSModulePath -split ';' | Where-Object { $_ -and $_ -ne $docsModules }) -join ';'
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

# theme [name]: switch WezTerm, Windows Terminal and pi to config/themes/<name>.
function theme {
  $ps = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }
  & $ps -NoProfile -File "$DOT\config\powershell\theme.ps1" @args
}

# PSReadLine: history predictions in a list, zsh-like completion menu.
if (Get-Module -ListAvailable PSReadLine) {
  Set-PSReadLineOption -EditMode Windows
  try {
    Set-PSReadLineOption -PredictionSource History -PredictionViewStyle ListView
  } catch {} # PSReadLine < 2.2 (stock 5.1) has no predictions
  Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete
  Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
  Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward
}

# Chocolatey tab completion, if installed.
$ChocolateyProfile = "$env:ChocolateyInstall\helpers\chocolateyProfile.psm1"
if ($env:ChocolateyInstall -and (Test-Path $ChocolateyProfile)) { Import-Module $ChocolateyProfile }

# Per-machine additions: config/powershell/local.ps1 (gitignored).
if (Test-Path "$DOT\config\powershell\local.ps1") { . "$DOT\config\powershell\local.ps1" }
