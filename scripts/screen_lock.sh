#!/bin/bash
rm /tmp/screen.png

TMPBG=/tmp/screen.png
scrot /tmp/screen.png
convert $TMPBG -scale 10% -scale 1000% $TMPBG
convert $TMPBG -gravity top -composite -matte $TMPBG
#i3lock -u -i $TMPBG
exec qdbus org.freedesktop.ScreenSaver /ScreenSaver Lock

#~/Downloads/i3lock/build/i3lock -i $TMPBG -c '#000000' -o '#191d0f' -w '#572020' -l '#ffffff' -e

#rm /tmp/screen.png
#rm /tmp/screen_000.png
