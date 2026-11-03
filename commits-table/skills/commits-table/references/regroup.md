# Regroup a PR's commits

Read this when the caller asks to regroup, reorganise, squash or clean up a PR's commits, usually just before asking for the table. The table describes commits, so the history comes first: regroup, push, then build the table from the new SHAs.

## 1. See what the branch changes

```bash
python3 <skill-dir>/scripts/commits_table.py files
```

It lists every file the branch changes since its merge base with the default branch, grouped by top folders. Uncommitted and untracked files are included, because the regroup commits them too. Read `git log --oneline <base>..HEAD` as well: the existing messages tell you how the author already thought about the work.

## 2. Propose the groups

One commit per reviewable area. A reviewer opens them one by one, so each should make sense alone:

- **Shared code first**: components, libraries or helpers that later groups use. A reviewer reads the API before its call sites, and each commit stays buildable.
- **Tooling next**: lint rules, CI, config, generated results such as a Betterer file, docs about the change.
- **Then one commit per area**: a tribe, a domain or an app (`analytics`, `content`, `organization`), following the repository's own folder split.
- Keep the repository's message convention: look at the existing subjects for a ticket prefix (`[sc-123] Area: …`) or conventional commits (`refactor(scope): …`). Write a short body that says what the group changes and why, plus any trailer lines the session or the repository requires.
- A file belongs to one group only. When a file mixes two concerns, put it with the group it serves most and say so in the body. Splitting hunks is rarely worth the risk.

Show the plan to the caller (group, files, message) before running it. The groups are the caller's call, and a rewrite is cheap to plan and costly to undo after a force-push.

## 3. Run it

Write the plan as JSON, in order:

```json
[
  {"message": "[sc-123] Components: an inputId for wrapped inputs\n\nWhy, in one or two lines.", "paths": ["frontend/libs/ui/timepicker", "frontend/libs/ui/chips"]},
  {"message": "[sc-123] Lint: a rule that checks a label reaches a control", "paths": ["eslint.config.mjs", "frontend/eslint-rules", ".betterer.results"]}
]
```

```bash
python3 <skill-dir>/scripts/commits_table.py regroup plan.json
```

A path matches a file or a whole folder. The script:
1. refuses with the list of leftovers when a changed file is in no group, and changes nothing;
2. saves everything, uncommitted work included, to `backup/<branch>-before-regroup`;
3. resets softly to the merge base (merges of the default branch disappear, since the base already holds them) and commits each group;
4. returns the new commits and `tree_identical`, which must be `true`: the final tree equals the backup, so nothing was lost or added.

After it runs, run the repository's fast checks on the changed files (lint, formatter, the tests the groups touch). A single commit may not build alone if a group was placed before what it needs: reorder the plan and run it again from the backup (`git reset --hard backup/<branch>-before-regroup`, then `regroup`).

## 4. Push, only when the caller says so

The branch history changed, so the push must be forced. That is the caller's decision, never implied by "regroup". Some environments block force-pushes until the user allows them. Then stop and ask instead of looking for another way. Anchor the lease on the head you replaced, so a commit someone pushed meanwhile is never lost:

```bash
git push --force-with-lease=<branch>:<old_head> origin HEAD:<branch>
```

`old_head` comes from the `regroup` output. Once the push succeeds, build the table (SKILL.md, from step 1): every SHA in the old table is now gone.

## Pitfalls

- **Shallow clones** often fetch only the default branch, so `origin/<branch>` is missing and `git branch -u` fails. Add the refspec once: `git config --add remote.origin.fetch '+refs/heads/<branch>:refs/remotes/origin/<branch>'`.
- **CI that deploys per commit SHA**, for example preview environments, rebuilds after the push. That is expected, not a side effect to hide.
- **An empty commit** (one pushed only to trigger CI) carries no file, so it disappears in the regroup. Mention it to the caller.
