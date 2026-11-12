# claude-mods

Jordan's Claude Code mods, published as the `jordan-mods` plugin marketplace.

## ribbon

A slim band above the prompt, on one row:

```
CTX ●○○○○ 24% · 245k/1M   7D ●●◐○○ 47%   $3.40   ⌫ ⇊ ↻   WARM 42m left   Show
```

- **CTX** — how full the context window is: five rounds filled by half steps, the percent, and tokens over the window size. Bold HIGH from 80%.
- **7D** — how much of the 7-day rate limit is used, as the same five rounds. Hidden off a subscription.
- Both gauges shift colour with the fill: green, yellow, orange, then red from 95%.
  A bold **HIGH** shows from 80%, when compaction gets close.
- **Cost** — what the session has cost so far, as `/cost` totals it (API prices; not what a subscription bills).
- **⌫ Clear** — runs `/clear`. The first press arms it (✓), a second press within 5 seconds runs it.
- **⇊ Compact** — runs `/compact` in one press.
- **↻ Reload project** — shows once a `project-memory` project was loaded, resumed or created in the session.
  Armed like Clear, it runs `/clear` then `/project-memory:resume-project <project>`.
- **Prompt cache** — after the first reply: **WARM** for an hour after the last request, then **COLD** with
  what the next message costs to re-cache. **Show** opens a card with the cost on each model.

On a narrow window each part stacks into its own block. The terminal shows the same figures as text, without buttons.

It reads the app's own figures and never calls a model. Cache prices come from the `MODELS` table in
`ribbon/hooks/cache-art.ts`; edit it when prices change.

## commits-table

A skill that adds a `## Commits` table to a GitHub pull request description, or refreshes it after the history
was rewritten:

| # | Commit | LoC | What it holds |
|---|---|---:|---|
| 1 | [`07e58f6`](https://github.com/kkoo95/claude-mods) Components | +120 −30 | `inputId` on `ap-neo-timepicker`, `ap-input-chips`, with specs |

- Each short SHA links to the commit inside the PR, so a reviewer can open them one by one.
- The last column is written from each commit's diff, not copied from its message.
- The rest of the description stays as it is: the section is replaced in place, or inserted before the attribution footer.
- It refuses to build links to commits that are not pushed yet.
- Each row shows the commit's lines of code (`+added −deleted`), so a reviewer can budget their time.
- By default, it first regroups the PR's commits by area (one commit per reviewable part, backup branch, identical tree
  checked), force-pushes it (with a lease on the old head), then builds the table. Say "no regroup" / "sans
  regroupement" to skip it. It also skips on its own when the PR is someone else's, already reviewed, or already grouped.
- On request, a rewrite mode replaces a bloated description with a short one built around the table: why the PR exists,
  the table, and only the notes no row can hold. Checklists, ticket references, template headings and the footer are kept.

Ask for it in plain words ("add the commit table to the PR description", "refresh the commits table after the force-push").
It uses `gh api` over REST only, so it also works where GitHub's GraphQL API is blocked.

## slang

A skill that switches Claude's conversational replies to French slang — verlan, banlieue argot and Gen Z
anglicisms — at a level from 0 (standard French) to 3 (heavy, the default). Pull request descriptions, commits,
code comments and docs stay professional, and critical sentences (errors, destructive steps) stay plain.

Call it with `/slang`, `/slang 2`, or "parle normal" to switch it off. The vocabulary lives in
`slang/skills/slang/EXPRESSIONS.md`, meant to be refreshed as words date.

## Install

```
claude plugin install ribbon@jordan-mods --marketplace kkoo95/claude-mods
claude plugin install commits-table@jordan-mods --marketplace kkoo95/claude-mods
claude plugin install slang@jordan-mods --marketplace kkoo95/claude-mods
```

Pick the user scope, then start a new session. To develop it, add a clone as a folder marketplace
(`claude plugin marketplace add <clone>`): edits then apply with `/reload-plugins`.

Run the tests with `claude plugin test ribbon`.

## License

MIT, see `ribbon/LICENSE`. The embedded Outfit font is under the SIL Open Font License 1.1.
