# D1 delivery notes

Shell allowlist currently blocks install/verify/commit from the agent.
Run locally:

```sh
cd /home/joao-vitor/projects/worktrees/lifemaxing-d1-playable
bash scripts/finish-d1-delivery.sh
# or:
bash scripts/verify-d1.sh
git add -A
git commit -m "Add D1 playable morning UI on secure D0 foundation."
```
