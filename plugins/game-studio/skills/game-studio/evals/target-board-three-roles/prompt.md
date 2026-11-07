---
tags: [skill-creator]
max_turns: 60
timeout_seconds: 1800
allowed_tools: [Read, Glob, Grep, Skill, Write, Bash, PowerShell]
---

get the team on a new training prop: an archery style target board on a wooden post in the training yard. when a bolt hits it, a glowing scorch ring appears where it landed and fades after a few seconds, and the board's readout keeps score, 10 for the bullseye down to 1 at the rim. i want the model, the hit effect and the scoring built in parallel

This is a dry run to check the plan, not to build it. Spawn no agents, run no `unity command`, and change no file in the repository. Work out everything you would do and write it to `plan.md` in your outputs folder: the Current-Task-Plan.md you would write, every worker you would start with the exact Agent tool call (all its parameters and the full prompt), the order in which agents would use the Unity Editor and how that is coordinated, how you would review, integrate and commit, and anything you would ask me first.
