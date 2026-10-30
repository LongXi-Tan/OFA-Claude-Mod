# OFA-Claude-Mod

Personal Claude Code mods.

## progress-bar

A standalone mod that shows what Claude and its native subagents are doing, with no skill or slash command needed to start it.

- **Band above the prompt** (while Claude works): a crab typing on its laptop, how many subagents are working, a bar that fills as this turn's subagents finish, elapsed time and estimated cost, and an `Agents ×N` button.
- **Agents pane** (opens by itself when subagents start, or with `/progress-bar`): session cost, tokens and work time at the top; the main session's crab, which pulls out a laptop and types while working and dozes when idle; then every subagent as its own animated pixel crab (Wizard, Pirate, Ninja, Knight, Musician, Painter) with its model, effort, context fill, tokens, cost and time. Finished agents rest with happy eyes; failed ones turn grey.

Cost is an estimate at API list prices (cache writes counted at 1.25x input). On a subscription plan it is what the work would cost on the API, not what you are billed.

### Run it from this folder

Name the mod folder in `CLAUDE_CODE_PLUGIN_DIRS` (in `~/.claude/settings.json` under `env`), or start a terminal session with `claude --plugin-dir ./progress-bar`.
