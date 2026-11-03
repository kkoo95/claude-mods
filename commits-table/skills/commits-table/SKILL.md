---
name: commits-table
description: Add or refresh a "## Commits" table in a GitHub pull request description — one row per commit with its short SHA linked to the commit in the PR, its area, and one line written from its diff. Use it whenever the user asks for a commit table, "tableau des commits", "table des commits dans la desc", a list or summary of a PR's commits in its description, links to each commit, or after regrouping, squashing, rebasing or force-pushing a PR's history (the SHAs change, so the table must be rebuilt). Also use it when a PR description already has a Commits section that is stale or lacks links, and when the user asks to regroup, reorganise, squash or clean up a PR's commits ("regroupe les commits", "regroup commits", "one commit per area"), which usually comes right before the table. It has a rewrite mode, used when the caller asks for it, that replaces a long or bloated PR description with a short one built around the table: "replace the description with the table", "remplace la desc par le tableau", "la description est trop longue", "condense / clean up / rewrite the PR description around the commits".
---

# commits-table

A reviewer reads a PR commit by commit. The table tells them what each commit holds and takes them to it in one click, so they can review one area at a time instead of the whole diff.

## Regroup first, when asked

The caller often asks to regroup the commits before the table ("regroup commits + commit table in the desc"). The table describes commits, so regroup first, push, then build the table. Read `references/regroup.md` for the procedure. A script does the risky part: it backs the branch up, rebuilds one commit per group and checks the final tree is identical. Then force-push it with a lease on the old head, without asking: landing the regroup on the PR is the point of the request.

## Two modes

The caller picks the mode, by asking for it in words or by passing `mode=rewrite`:

- **table** (the default): add or refresh the `## Commits` section and leave every other line of the description as it is.
- **rewrite**: replace the description with a short one built around the table. Use it when the description has grown into pages of generated prose that restate the diff. The table already says what each commit holds, so the rest of the description only has to carry what the table cannot. Never pick this mode on your own: it deletes text, and only the caller knows whether that text matters.

Steps 1 to 5 are the same in both modes. Step 6 differs.

## Steps

`<skill-dir>` below is the folder that holds this SKILL.md. Run the `git` commands inside the PR's repository clone. Write every file to one scratch folder (`mktemp -d`), never into the clone, under these names: `body.md` (the current description), `section.md` (the Commits section), `new.md` (the rewritten text, rewrite mode only) and `new-body.md` (what gets sent).

1. **Resolve the PR.** A number or URL from the user wins. Otherwise use the PR of the current branch: `gh api "repos/<owner>/<repo>/pulls?head=<owner>:$(git branch --show-current)&state=open"`.

2. **Make sure the history is pushed.** The links point at commits on GitHub, so a commit that only exists locally gives a dead link. Compare `git rev-parse HEAD` with the PR's `head.sha` (`gh api repos/<owner>/<repo>/pulls/<n> --jq .head.sha`). If they differ, stop and say so: the table must be built after the push. Never push to make the table work, since pushing is the user's decision.

3. **List the commits**, oldest first, with their links and changed files:
   ```bash
   python3 <skill-dir>/scripts/commits_table.py commits <owner>/<repo> <pr>
   ```
   Each entry has `short`, `url` (the commit inside the PR: `https://github.com/<owner>/<repo>/pull/<n>/commits/<sha>`), `area` (the part before `: ` in the subject, without a `[ticket]` prefix; for a conventional commit such as `refactor(i18n): …` it is the scope, `i18n`, or the type when there is no scope), `title`, `files`, `additions`, `deletions`, `empty`, `merge`.

   **Already current?** If the description has a `## Commits` section that lists exactly these SHAs, in this order and each one linked, its rows are good. Rewriting them produces churn and makes nothing better. In table mode, tell the user the table is up to date and stop. In rewrite mode, reuse the rows as they are and go on to the rewrite. Rebuild the rows only when the SHAs differ, a link is missing, or the user asks for new wording.

4. **Read each commit's diff** (`git show --stat <sha>`, then `git show <sha> -- <key files>`) and write its "What it holds" cell. This is the part a reviewer cannot get from the subject line, so it is written from the diff, not copied from the commit message:
   - Name what changed concretely: the components, rules, endpoints, config or files, and the behaviour they get. Example: "`inputId` on `ap-neo-timepicker`, `ap-input-chips`, with specs". Generic words such as "updates", "various fixes" or "improvements" don't help the reviewer.
   - Keep it to one line of about 25 words at most, and don't restate the subject. The limit holds in rewrite mode too: a detail that doesn't fit its row goes to `## Notes`. When a commit touches more than a handful of components, name the kind of change and the top areas instead of listing everything. For example: "labels of ambassador, library, publishing (25 files); host ids → `<hostId>-input`".
   - On a large commit, start from `git show --stat` to see where the lines go, then read the diff of the 2–3 files that carry the change. Reading every file is rarely needed.
   - For a merge commit (`merge: true`), the API lists everything the merged branch brought in, which says nothing about this PR. Describe only what the merge settled for this branch (conflicts resolved, a deletion kept), from the merge's own message and `git show --remerge-diff <sha>` when it is available. Label it "Merge <branch>".
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

   In **rewrite** mode, go to "Rewrite the description" below instead.

7. **Report** the PR link and the table in the reply, so the user sees it without opening GitHub.

## Rewrite the description (rewrite mode)

The aim is a description a reviewer reads in under a minute: why the PR exists, the table that guides them through the commits, and the few things they must know that are in no single commit.

0. **Check it is worth it.** Count the prose of the old body (`words` from `keep` below, which leaves out the table and the footer). If that is already under about 120 words, or the rewrite would cut less than about a third, the description is already compact: tell the caller, show the text you would drop, and rewrite only if they confirm.

1. **List what must survive.** These are not Claude's prose: someone needs them, a tool reads them, or a human wrote them.
   ```bash
   python3 <skill-dir>/scripts/commits_table.py keep body.md
   ```
   The output holds the attribution `footer`, the `checklists` (`- [ ]` / `- [x]` lines, ticked state included), the `references` (`Closes #12`, `sc-123`, ticket URLs), the `headings` and `words`, the prose word count without the footer or a `## Commits` section, so the counts before and after compare like for like. Then look at the repository's PR templates (`.github/pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/PULL_REQUEST_TEMPLATE/*.md`, `docs/PULL_REQUEST_TEMPLATE.md`). If the old body follows one of them, keep that template's headings and checklist, because a CI check or a reviewer may look for them. Put the template's first section (often Summary) first, then `## Commits`, then `## Notes`, then the template's checklist last. A template section other than the summary keeps only the cross-commit content that belongs under its heading. Leave it out if nothing does and the template doesn't require it. If it follows none, don't add a template now: that changes the PR's shape beyond what was asked.

2. **Write the new body** with this structure, in the language of the old one:
   ```markdown
   ## Summary
   - Why the PR exists, in 1 to 3 bullets: the problem and the approach, not the file list.

   ## Commits
   <the table from step 5>

   ## Notes
   - Only what a reviewer needs and no row can hold: a decision that cuts across commits, a risk, a migration or deploy step, the QA status, a known follow-up.
   ```
   Move the details that belong to one area into that commit's row when they fit there. Drop the rest of the old prose: implementation walkthroughs, file lists, restated code, test descriptions. The diff and the table already carry all of it. Leave out `## Notes` when there is nothing for it. Put back everything from step 1 in its place: template headings, checklists with their ticked state, ticket references (in the Summary when the old body had them in prose).

3. **Splice the footer back and update the PR.**
   ```bash
   python3 <skill-dir>/scripts/commits_table.py rewrite body.md new.md > new-body.md
   gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@new-body.md --jq .html_url
   ```
   `rewrite` appends the old attribution footer unless the new text already holds it.

4. **Report** the old and new prose word counts (`words` from `keep` on `body.md` and on `new-body.md`, both without the table and the footer). Also say how many rows the table adds: with many commits, the description can get longer overall while its prose gets shorter, and the caller should know that. what was dropped in one line ("implementation walkthrough, file list"), and what was kept from step 1. Also mention that GitHub keeps the previous description in the PR's edit history ("edited" menu on the description), so nothing is lost for good.

## After a history rewrite

Regrouping, squashing, rebasing or amending changes every SHA after the first rewritten commit, and the old links then point at commits that are no longer in the PR. Rebuild the whole table from step 3 after the force-push. Don't patch individual rows.

## Notes

- `gh api` uses REST only, so it also works in sessions where GitHub's GraphQL API is blocked (`gh pr view` and `gh pr edit` fail there).
- A PR with many commits (more than about 15) still gets one row per commit. Long tables are fine. Merging rows hides which commit to open.
