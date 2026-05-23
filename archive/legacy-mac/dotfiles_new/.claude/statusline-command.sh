#!/usr/bin/env bash
# Claude Code status line — Powerlevel10k-style with Nerd Font / Powerline glyphs
#
# LAYOUT:
#   LEFT:  [apple+dir-seg] [git-seg]
#   RIGHT: [ctx-seg] [checkmark] [model-seg] [effort-seg] [user-seg] [time-seg]
#
# POWERLINE SEPARATOR RULES:
#   Left  segments use \ue0b0 (▶): fg=prev_seg_bg_color, bg=next_seg_bg_color
#   Right segments use \ue0b2 (◀): fg=next_seg_bg_color, bg=current_seg_bg_color
#   The glyph sits ON the boundary so its bg blends with one side and fg blends with the other.

input=$(cat)

# ── Glyphs (Nerd Font / Powerline) ──────────────────────────────────────────
APPLE=$'\uf179'       #  apple
SEP_R=$'\ue0b0'       #  filled right arrow  (used between LEFT  segments)
SEP_L=$'\ue0b2'       #  filled left  arrow  (used between RIGHT segments)
GIT_ICON=$'\ue0a0'    #  git branch
HOME_ICON=$'\uf015'   #  home
CLOCK_ICON=$'\uf017'  #  clock
CHECK=$'\u2713'       # ✓

# ── Palette — background codes (256-color) ───────────────────────────────────
# Each segment has a BG (applied to content) and a matching FG-equivalent
# (used as the foreground of the separator glyph on that segment's side).
#
#  Segment          BG escape          FG-equiv escape    256-color index
#  apple+dir        48;5;233 (black)   38;5;233           233  (#141414)
#  git              48;5;22  (d.green) 38;5;22            22   (#66ff88)
#  ctx (right)      48;5;235 (d.gray)  38;5;235           235  (#0e0e0e)
#  model (right)    48;5;53  (purple)  38;5;53            53   (#cc88ff)
#  effort (right)   48;5;58  (olive)   38;5;58            58   (#ffee00)
#  user (right)     48;5;30  (teal)    38;5;30            30   (#44ffcc)
#  time (right)     48;5;178 (gold)    38;5;178           178  (#ffee00)

BG_NAVY='\033[48;5;233m'
BG_DGREEN='\033[48;5;22m'
BG_DGRAY='\033[48;5;235m'
BG_PURPLE='\033[48;5;53m'
BG_OLIVE='\033[48;5;58m'
BG_TEAL='\033[48;5;30m'
BG_GOLD='\033[48;5;178m'

FG_NAVY='\033[38;5;233m'
FG_DGREEN='\033[38;5;22m'
FG_DGRAY='\033[38;5;235m'
FG_PURPLE='\033[38;5;53m'
FG_OLIVE='\033[38;5;58m'
FG_TEAL='\033[38;5;30m'
FG_GOLD='\033[38;5;178m'

# Content foreground colors (256-color to match Bearded Monokai Black Pro Filter)
FG_WHITE='\033[38;5;251m'
FG_BLACK='\033[38;5;233m'
FG_BGREEN='\033[38;5;84m'
FG_CYAN='\033[38;5;81m'
FG_YELLOW='\033[38;5;226m'
FG_DIM='\033[2m'

RESET='\033[0m'
BOLD='\033[1m'

# ── Data extraction ───────────────────────────────────────────────────────────
user=$(whoami)

cwd_raw=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // ""')
home_dir="$HOME"
dir="${cwd_raw/#$home_dir/\~}"   # replace $HOME prefix with ~

# Git branch (non-blocking; skips optional locks)
git_branch=""
git_cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // "."')
if GIT_OPTIONAL_LOCKS=0 git -C "$git_cwd" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$git_cwd" symbolic-ref --short HEAD 2>/dev/null \
            || GIT_OPTIONAL_LOCKS=0 git -C "$git_cwd" rev-parse --short HEAD 2>/dev/null)
fi

# Model display name
model_name=$(echo "$input" | jq -r '.model.display_name // empty')

# Effort level → icon
effort_raw=$(echo "$input" | jq -r '.effort // empty')
case "$effort_raw" in
  low)    effort_icon="▽" ;;
  normal) effort_icon="◇" ;;
  high)   effort_icon="◈" ;;
  max)    effort_icon="◆" ;;
  auto)   effort_icon="⊡" ;;
  *)      effort_icon="" ;;
esac

# Context window
used_pct=$(echo "$input"    | jq -r '.context_window.used_percentage // empty')
used_tokens=$(echo "$input" | jq -r '.context_window.used_tokens // empty')

# Time
now=$(date +"%I:%M:%S %p")

# ── LEFT SIDE ────────────────────────────────────────────────────────────────

# Segment 1: Apple + directory  (navy bg, white fg)
printf "${BG_NAVY}${FG_WHITE}${BOLD} ${APPLE} ${RESET}"
printf "${BG_NAVY}${FG_WHITE} %s ${RESET}" "$dir"

if [ -n "$git_branch" ]; then
  # LEFT separator: navy → dark-green
  # Glyph sits on the boundary: bg=next(dgreen), fg=prev(navy)
  printf "${BG_DGREEN}${FG_NAVY}${SEP_R}${RESET}"
  # Segment 2: Git branch (dark-green bg, bright-green fg)
  printf "${BG_DGREEN}${FG_BGREEN} ${GIT_ICON} %s ${RESET}" "$git_branch"
  # Closing arrow: no next segment, so transparent bg, fg=dark-green
  printf "${FG_DGREEN}${SEP_R}${RESET}"
else
  # Closing arrow from navy segment
  printf "${FG_NAVY}${SEP_R}${RESET}"
fi

# ── SPACER between left and right ────────────────────────────────────────────
printf "  "

# ── RIGHT SIDE ────────────────────────────────────────────────────────────────
# Right segments are printed left-to-right in this order:
#   ctx → checkmark → model → effort → user → time
#
# RIGHT separator \ue0b2 rule:
#   The glyph sits on the LEFT edge of each right segment.
#   fg = this segment's bg color (so it blends into the segment)
#   bg = previous item's bg (transparent/reset for the very first right item)

# ctx segment (dark-gray bg, cyan fg) — only when context data is available
if [ -n "$used_pct" ]; then
  # First right segment: no bg to the left, so just fg=dgray, no bg set
  printf "${FG_DGRAY}${SEP_L}${RESET}"
  printf "${BG_DGRAY}${FG_CYAN} ctx: %s%% ${RESET}" "$used_pct"
fi

# Standalone checkmark (no segment bg, lives in the gap)
printf "  ${FG_BGREEN}${CHECK}${RESET}  "

# Determine which right segments are active (need to know for separator bg chaining)
# We always show model if available, effort if available, user, time.

# model segment (purple bg, white fg)
if [ -n "$model_name" ]; then
  # Separator: fg=purple (blends into this segment), bg=transparent (reset)
  printf "${FG_PURPLE}${SEP_L}${RESET}"
  printf "${BG_PURPLE}${FG_WHITE} %s ${RESET}" "$model_name"
fi

# effort segment (olive bg, bright-yellow fg)
if [ -n "$effort_icon" ]; then
  if [ -n "$model_name" ]; then
    # Previous right segment was model (purple): bg=purple, fg=olive
    printf "${BG_PURPLE}${FG_OLIVE}${SEP_L}${RESET}"
  else
    printf "${FG_OLIVE}${SEP_L}${RESET}"
  fi
  printf "${BG_OLIVE}${FG_YELLOW} %s %s ${RESET}" "$effort_icon" "$effort_raw"
fi

# Determine bg of the last printed right segment (for chaining into user-seg)
if   [ -n "$effort_icon" ];  then prev_right_bg="$BG_OLIVE";  prev_right_fg="$FG_OLIVE"
elif [ -n "$model_name" ];   then prev_right_bg="$BG_PURPLE"; prev_right_fg="$FG_PURPLE"
else                              prev_right_bg="";            prev_right_fg=""
fi

# user segment (teal bg, white fg)
if [ -n "$prev_right_fg" ]; then
  # Separator: bg=prev segment's bg, fg=teal (this segment's bg)
  printf "${prev_right_bg}${FG_TEAL}${SEP_L}${RESET}"
else
  printf "${FG_TEAL}${SEP_L}${RESET}"
fi
printf "${BG_TEAL}${FG_WHITE} %s ${HOME_ICON} ${RESET}" "$user"

# time segment (gold bg, black fg)
# Separator: bg=teal (previous), fg=gold (this)
printf "${BG_TEAL}${FG_GOLD}${SEP_L}${RESET}"
printf "${BG_GOLD}${FG_BLACK} ${CLOCK_ICON} %s ${RESET}" "$now"

# token count — dim gray, appended after time (no powerline segment, just text)
if [ -n "$used_tokens" ]; then
  printf " ${FG_DIM}%s tokens${RESET}" "$used_tokens"
fi

printf "\n"
