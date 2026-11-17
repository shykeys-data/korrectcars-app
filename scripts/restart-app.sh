#!/bin/bash
# Restart a Korrect Cars app on the DirectAdmin/LiteSpeed host and stop the copies the old code left running.
#   bash restart-app.sh /home/kcars/korrectcars_app https://www.korrectcars.com/api/health
# Why: LiteSpeed starts a fresh copy (lsnode) after tmp/restart.txt is touched but can leave older copies running
# for days. They serve old code and hold database connections; the host allows 8 per user ("Too many connections").
# How: touch restart.txt, wait until /api/health is answered by a copy started after that moment, then send SIGTERM
# (a clean stop: requests in progress finish, connections close) to every copy of THIS app started before it.
# If the new copy can't be confirmed (e.g. staging behind a password), nothing is stopped.
APP=${1:?app folder}; URL=${2:?health url}
mkdir -p "$APP/tmp" && touch "$APP/tmp/restart.txt"
START=$(date +%s); NEW_OK=0
for i in $(seq 1 30); do
  UP=$(curl -s -m 10 "$URL" | grep -o '"uptime":[0-9]*' | cut -d: -f2)
  NOW=$(date +%s)
  if [ -n "$UP" ] && [ "$UP" -le $((NOW - START + 2)) ]; then NEW_OK=1; break; fi
  sleep 2
done
if [ $NEW_OK -ne 1 ]; then echo "RESTART: new copy not confirmed at $URL; old copies left running"; exit 0; fi
AGE=$(( $(date +%s) - START ))
for P in $(ps -u "$(id -un)" -o pid=,etimes=,args= | awk -v app="lsnode:${APP%/}/" -v age="$AGE" '$3==app && $2>age+2 {print $1}'); do
  kill -TERM "$P" && echo "RESTART: stopped old copy $P"
done
echo "RESTART: running copies now: $(ps -u "$(id -un)" -o args= | grep -c "^lsnode:${APP%/}/")"
