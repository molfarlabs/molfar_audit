#!/usr/bin/env bash
# Wait for a report newer than the last deploy and copy it to tmp/last-report.json.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p tmp
SINCE=${1:-0}
for _ in $(seq 1 30); do
  LINE=$(ssh -o ClearAllForwardings=yes fivem-dev 'sudo sh -c "cd /opt/fivem/txData/*.base/resources/[[]molfar[]]/molfar_audit/reports 2>/dev/null && ls -t *.json 2>/dev/null | head -1 | xargs -r stat -c \"%Y %n\""' || true)
  if [[ -n $LINE && ${LINE%% *} -gt $SINCE ]]; then
    NAME=${LINE#* }
    ssh -o ClearAllForwardings=yes fivem-dev "sudo sh -c 'cat /opt/fivem/txData/*.base/resources/[[]molfar[]]/molfar_audit/reports/$NAME'" > tmp/last-report.json
    jq '.summary' tmp/last-report.json
    exit 0
  fi
  sleep 10
done
echo "no new report after 5 minutes" >&2
exit 1
