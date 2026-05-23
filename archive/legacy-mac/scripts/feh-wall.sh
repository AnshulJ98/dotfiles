#!/bin/bash
#!/bin/bash
ff=`ps -ef | grep feh | grep -v grep | tr -s ' '| cut -d ' ' -f2`; 
for i in $ff;
do
  kk= $i;
done  
kill $kk;
while true; do
    feh -z --bg-scale --no-fehbg /home/anshulj/Pictures/Wallpapers
    
    sleep 15
done
