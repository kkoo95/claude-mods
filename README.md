# claude-mods

Jordan's Claude Code mods, published as the `jordan-mods` plugin marketplace.

## ribbon

A slim band above the prompt, on one row:

```
CTX ●●··· 24% · 245k/1M   $3.40   ⌫ ⇊ ↻   WARM 42m left   Show
```

- **CTX** — how full the context window is: a dot bar, the percent, and tokens over the window size.
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

## Install

```
claude plugin install ribbon@jordan-mods --marketplace kkoo95/claude-mods
```

Pick the user scope, then start a new session. To develop it, add a clone as a folder marketplace
(`claude plugin marketplace add <clone>`): edits then apply with `/reload-plugins`.

Run the tests with `claude plugin test ribbon`.

## License

MIT, see `ribbon/LICENSE`. The embedded Outfit font is under the SIL Open Font License 1.1.
