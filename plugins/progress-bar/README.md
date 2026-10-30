# progress-bar

A Claude Code mod: a progress bar above the prompt that fills as Claude works, and an Agents pane where every subagent is an animated pixel crab.

- **Progress bar**: a short title for the work, a shimmering bar that fills as each task is done, the percent, and a hopping crab. It counts Claude's own task list when there is one, and its subagents otherwise. Click the crab and it pulls out a laptop and types. `×N` opens or closes the Agents pane, and `▼` folds the bar away. When the work ends, the bar turns green and says **Done**.
- **Agents pane**: cost, tokens and time at the top, then Claude's own crab, which types while it works and dozes once it is done. Below it, every subagent gets its own crab (Wizard, Pirate, Ninja, Knight, Musician or Painter) with its model, effort, context fill, tokens, cost and time.

The title comes from one quick Haiku call (a fraction of a cent). Cost is an estimate at API list prices, not a bill.

## Commands

- `/progress-bar` opens the Agents pane.
- `/progress-bar demo` plays a free 20-second demo with six fake subagents. It makes no model calls.
- `/progress-bar clear` removes the demo.

## Settings

Both are on by default. Change them when you install, or under `pluginConfigs` in `~/.claude/settings.json`:

- `autoOpenPane`: open the Agents pane when subagents start.
- `workTitles`: name the work with Haiku. When off, the bar shows the first line of your message.

```json
{ "pluginConfigs": { "progress-bar": { "options": { "workTitles": false } } } }
```

## Install

In a terminal session:

```
/plugin install progress-bar --marketplace LongXi-Tan/OFA-Claude-Mod
```

In the Claude desktop app, click **+** next to the prompt box, then **Plugins**. Choose **Add marketplace** and enter `LongXi-Tan/OFA-Claude-Mod`, then **Add plugin**. See the [repository README](../../README.md) for more.
