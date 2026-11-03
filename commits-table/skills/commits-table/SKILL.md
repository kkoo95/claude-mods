---
name: commits-table
description: Add or refresh a "## Commits" table in a GitHub pull request description — one row per commit with its short SHA linked to the commit in the PR, its area, and one line written from its diff. Use it whenever the user asks for a commit table, "tableau des commits", "table des commits dans la desc", a list or summary of a PR's commits in its description, links to each commit, or after regrouping, squashing, rebasing or force-pushing a PR's history (the SHAs change, so the table must be rebuilt). Also use it when a PR description already has a Commits section that is stale or lacks links.
---

# commits-table

A reviewer reads a PR commit by commit. The table tells them what each commit holds and takes them to it in one click, so they can review one area at a time instead of the whole diff.

## Steps

1. **Resolve the PR.** A number or URL from the user wins. Otherwise use the PR of the current branch: `gh api "repos/<owner>/<repo>/pulls?head=<owner>:<branch>&state=open"`.

2. **Make sure the history is pushed.** The links point at commits on GitHub, so a commit that only exists locally gives a dead link. Compare `git rev-parse HEAD` with the PR's `head.sha` (`gh api repos/<owner>/<repo>/pulls/<n> --jq .head.sha`). If they differ, stop and say so: the table must be built after the push. Never push to make the table work, since pushing is the user's decision.

3. **List the commits**, oldest first, with their links and changed files:
   ```bash
   python3 <skill-dir>/scripts/commits_table.py commits <owner>/<repo> <pr>
   ```
   Each entry has `short`, `url` (the commit inside the PR: `https://github.com/<owner>/<repo>/pull/<n>/commits/<sha>`), `area` (the part before `: ` in the subject, without a `[ticket]` prefix), `title`, `files`, `additions`, `deletions`, `empty`.

4. **Read each commit's diff** (`git show --stat <sha>`, then `git show <sha> -- <key files>`) and write its "What it holds" cell. This is the part a reviewer cannot get from the subject line, so it is written from the diff, not copied from the commit message:
   - Name what changed concretely: the components, rules, endpoints, config or files, and the behaviour they get. Example: "`inputId` on `ap-neo-timepicker`, `ap-input-chips`, with specs". Generic words such as "updates", "various fixes" or "improvements" don't help the reviewer.
   - Keep it to one line, about 20 words at most. Don't restate the subject.
   - For an empty commit (`empty: true`), say why it exists if the message tells you (e.g. "empty: forces a rebuild"), otherwise "empty commit".

5. **Build the section**, in the language of the rest of the description:
   ```markdown
   ## Commits

   | # | Commit | What it holds |
   |---|---|---|
   | 1 | [`07e58f6`](https://github.com/<owner>/<repo>/pull/<n>/commits/<full-sha>) Components | `inputId` on `ap-neo-timepicker`, `ap-input-chips`, with specs |
   ```
   Every SHA is a link. A bare SHA is the first thing reviewers complain about. The label after the link is the commit's `area`. When there is none, use a 2–4 word summary of the title.

6. **Splice it into the description without touching anything else.** The description often holds a template, a checklist or attribution lines that belong to someone else.
   ```bash
   gh api repos/<owner>/<repo>/pulls/<n> --jq .body > body.md
   python3 <skill-dir>/scripts/commits_table.py splice body.md section.md > new-body.md
   gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@new-body.md --jq .html_url
   ```
   `splice` replaces an existing `## Commits` section up to the next `## ` heading or the attribution footer. When there is none, it inserts the section before the footer (`🤖 Generated with`, a `---` rule, a session link), or at the end. Running it again with the same section changes nothing. When the GitHub MCP is the only GitHub access, pass the new body to its `update_pull_request` tool instead of the `PATCH`.

7. **Report** the PR link and the table in the reply, so the user sees it without opening GitHub.

## After a history rewrite

Regrouping, squashing, rebasing or amending changes every SHA after the first rewritten commit, and the old links then point at commits that are no longer in the PR. Rebuild the whole table from step 3 after the force-push. Don't patch individual rows.

## Notes

- `gh api` uses REST only, so it also works in sessions where GitHub's GraphQL API is blocked (`gh pr view` and `gh pr edit` fail there).
- A PR with many commits (more than about 15) still gets one row per commit. Long tables are fine. Merging rows hides which commit to open.
