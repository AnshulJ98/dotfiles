# Shared PowerShell profile for Windows PowerShell 5.1 and PowerShell 7.
# Each $PROFILE is a one-line stub that dot-sources this file (the profiles live
# in OneDrive, which does not sync symlinks well).
$DOT = "$HOME\Dev\dotfiles"

# Prompt: oh-my-posh port of home/.p10k.zsh (classic, darkest, two lines, full frame).
$omp = "$env:LOCALAPPDATA\Programs\oh-my-posh\bin\oh-my-posh.exe"
if (-not (Test-Path $omp)) { $omp = (Get-Command oh-my-posh -ErrorAction SilentlyContinue).Source }
if ($omp) {
  & $omp init pwsh --config "$DOT\config\powershell\p10k-classic.omp.json" | Invoke-Expression
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
