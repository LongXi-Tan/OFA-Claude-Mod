# OFA-Claude-Mod

Personal Use Claude Code mods.

## progress-bar

A standalone mod that shows what Claude and its native subagents are doing, with no skill or slash command needed to start it.

- **Band above the prompt**, while Claude works: a short title for the work, a bar of glowing pixel dots with a pill that steps forward as each subagent finishes (`2/6`), the percent, a walking crab, `×N` to open the Agents pane and `✕` to hide the band for this run. When the run ends it turns green and says **Done** until your next message.
- **Agents pane**, which opens by itself when subagents start, or with `/progress-bar`: session cost, tokens and work time at the top; the main session's crab, which pulls out a laptop and types while working and dozes when idle; then every subagent as its own animated pixel crab (Wizard, Pirate, Ninja, Knight, Musician, Painter) with its model, effort, context fill, tokens, cost and time. Finished agents rest with happy eyes, failed ones turn grey with crossed eyes, and stopped ones turn grey with ■. An agent woken again shows `round 2`.

### Runs and titles

A run begins with your own message when nothing is working, and a message sent mid-run joins it. Notifications from background agents, scheduled prompts and slash commands never start one. The run's title names the work rather than repeating your words: one quick Haiku call (a fraction of a cent) writes 2 to 6 words, and a follow-up like "yes, commit it" keeps the title it continues. If the call fails, or titles are turned off, the first line of your message stands in.

### Commands

- `/progress-bar` opens the Agents pane.
- `/progress-bar demo` plays a free demo: six fake subagents over about 20 seconds, with no model calls.
- `/progress-bar clear` removes the demo's agents.

### Options

Both are on by default; change them in the config menu, or under `pluginConfigs` in settings.

- `autoOpenPane`: open the Agents pane when subagents start working.
- `workTitles`: name each new piece of work with Haiku; off shows your message's first line.

### Cost

Cost is an estimate at API list prices (cache writes counted at 1.25x input). On a subscription plan it is what the work would cost on the API, not what you are billed.

### Develop and test

The folder type-checks with its own `tsconfig.json` once Claude Code has loaded the mod and laid its types in `.claude-plugin/types/`. The tests play the demo on a fake clock and cover runs, titles, rounds, stopped agents and `/clear`:

```bash
claude plugin test progress-bar
```

To load the mod in every session, name the mod folder in `CLAUDE_CODE_PLUGIN_DIRS` (in `~/.claude/settings.json` under `env`), or start a terminal session with `claude --plugin-dir ./progress-bar`.

### Attribution