# claude-mods

Jordan's Claude Code mods, as a plugin marketplace (`jordan-mods`).

## ribbon

A slim band above the prompt: how full the context window is, what the session has cost so far,
whether the prompt cache is warm or cold, and small buttons to clear, compact, or clear and
reload the project-memory project loaded in the session.

## Install

```
claude plugin install ribbon@jordan-mods --marketplace kkoo95/claude-mods
```

Pick the user scope, then start a new session.

ribbon is adapted from [robonuggets/ribbon](https://github.com/robonuggets/ribbon) (MIT, see `ribbon/LICENSE`); its embedded Outfit font is under the SIL Open Font License 1.1.
