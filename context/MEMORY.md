# Project memory

- An agent's shell can be blocked from running installs, `pnpm verify`, or
  `git commit` directly inside a task worktree (encountered in
  `task/d1-playable`, recorded in `docs/qa/AGENT_BLOCKER.md`). When that
  happens, run `scripts/finish-d1-delivery.sh` or `scripts/verify-d1.sh`
  and commit manually rather than assuming the restriction is a real
  workflow failure.
- The original v0 prototype (mock-data only, no backend) lived at
  `7thcapitalist/lifemax` on GitHub as a separate git history from this
  local repo. The real backend implementation (auth, persistence,
  onboarding, quests, chronicle, today) was built later in this repo's
  `task/d0-foundation`/`task/d1-playable` worktrees. The two histories have
  no common ancestor — do not assume a plain `git merge` between them is
  possible; the prototype's docs (product thesis, roadmap) were carried
  forward into this context/ directory by hand instead.
