#!/bin/bash
# Hook Stop — avviso commit non pushati (CLAUDE.md review 2026-11-15, punto 4)
#
# Recidiva storica del progetto: Session 41 (90 commit mai pushati) e
# Session 89 (55 commit) — entrambe scoperte per caso, la seconda con un
# container in crash-loop in produzione per una dipendenza mai arrivata
# sul remoto. Questo hook stampa un avviso alla fine di ogni turno di
# Claude finché il lavoro locale non è stato pushato. Silenzioso quando
# tutto è allineato.

set -u
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

branch=$(git branch --show-current 2>/dev/null)
[ -n "$branch" ] || exit 0  # detached HEAD o non-repo: niente da dire

ahead=$(git rev-list --count "@{upstream}..HEAD" 2>/dev/null)
if [ -n "$ahead" ]; then
  # Branch con upstream: avvisa per qualunque commit non pushato
  if [ "$ahead" -gt 0 ]; then
    printf '{"systemMessage":"⚠️  %s commit non pushati su %s — git push prima di chiudere (recidiva: Session 41 = 90 commit, Session 89 = 55)"}\n' "$ahead" "$branch"
  fi
else
  # Branch senza upstream: tollera il lavoro iniziale, avvisa oltre 5 commit
  # che non esistono su NESSUN remoto
  local_only=$(git rev-list --count HEAD --not --remotes 2>/dev/null || echo 0)
  if [ "$local_only" -gt 5 ]; then
    printf '{"systemMessage":"⚠️  Branch %s senza upstream: %s commit locali mai pushati su alcun remoto"}\n' "$branch" "$local_only"
  fi
fi
exit 0
