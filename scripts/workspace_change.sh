#!/bin/sh

currentWorkspace=$(i3-msg -t get_workspaces \
  | jq '.[] | select(.focused==true).name' \
  | cut -d"\"" -f2);
if [ $1 == 'next' ] ; then
 if [ $currentWorkspace == '10' ] ; then
    i3-msg workspace 1;
    exit;
  fi  
  n=$((currentWorkspace+1));
  i3-msg workspace $n;
elif [ $1 == 'prev' ] ; then
  if [ $currentWorkspace == '1' ] ; then
    i3-msg workspace 10;
    exit;
  fi  
  n=$((currentWorkspace-1));
  i3-msg workspace $n;
elif [ $1 == 'snext' ] ; then
  if [ $currentWorkspace == '10' ] ; then
    i3-msg move container to workspace 1;
    i3-msg workspace 1;
    exit;
  fi  
  n=$((currentWorkspace+1));
  i3-msg move container to workspace $n;
  i3-msg workspace $n;
elif [ $1 == 'sprev' ] ; then
  if [ $currentWorkspace == '1' ] ; then
    i3-msg move container to workspace 10;
    i3-msg workspace 10;
    exit;
  fi  
  n=$((currentWorkspace-1));
  i3-msg move container to workspace $n; 
  i3-msg workspace $n;
fi  
