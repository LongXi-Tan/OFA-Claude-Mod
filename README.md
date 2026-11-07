# OFA-Claude-Mod

My mods for [Claude Code](https://claude.com/claude-code). Each one is a standalone plugin under `plugins/`.

| Mod | What it does |
| --- | --- |
| [progress-bar](plugins/progress-bar) | A progress bar above the prompt that fills as Claude's tasks and subagents finish, and an Agents pane of animated pixel crabs with cost, tokens and time. |
| [game-studio](plugins/game-studio/skills/game-studio/SKILL.md) | A skill that runs a Unity game project as a small studio: Claude leads, and VFX Artist, 3D Model Artist and Game Programmer workers on its own model and effort build in parallel, taking turns on the one Unity Editor. |

## Install

**Claude desktop app**

1. Click **+** next to the prompt box, then **Plugins**.
2. Choose **Add marketplace** and enter `LongXi-Tan/OFA-Claude-Mod`.
3. Choose **Add plugin**, then **progress-bar**.

**Claude Code in a terminal**

```
/plugin install progress-bar --marketplace LongXi-Tan/OFA-Claude-Mod
```

Answer `y` to add the marketplace, then press Enter to install it for your user. The mod starts working right away, including in the desktop app's Code tab.

## Use

Give Claude some work, and the bar appears above the prompt. Run `/progress-bar demo` to see it in action for free. Everything the mod does is in its [README](plugins/progress-bar).

Mods run on Claude Code's function hooks, an early-access API. This one is tested on Claude Code 2.1.309.

## Develop

```bash
claude --plugin-dir plugins/progress-bar
```

```bash
claude plugin test plugins/progress-bar
```

```bash
claude plugin validate .
```

The first loads the mod from this folder for one session, the second runs its tests, and the third checks the marketplace.

## Attribution

shoutout to JohnnyVizz on the [claude-kit](https://github.com/JohnnyVizz/claude-kit) (savvy-progress) plugin, big fan of that plugin he made, used and decided to build one mod like this progress bar myself.

## License

[MIT](LICENSE)
