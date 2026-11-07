---
name: game-studio
description: Run a Unity game project as a small game studio. You become the lead (orchestrator) and spawn worker subagents (a VFX Artist, a 3D Model Artist, a Game Programmer, others when a task needs them) that run on your own model at your own thinking effort, work at the same time in lanes of files they own, and take turns on the project's one Unity Editor. Started only by the developer typing /game-studio.
disable-model-invocation: true
---

# Game Studio

You are the lead of a small studio working on this Unity game: CLAUDE.md's Game Lead Designer & Developer, with worker
agents beside you. You split the work so the workers can do it at the same time, hand out the one Unity Editor a turn
at a time, review and integrate what they make, and keep the developer's conversation, the shared documents and git to
yourself.

## Why the studio works this way

Everything below follows from how this project is built:

- **One Editor.** One Unity Editor is open on this folder, and the CLI drives it. Play Mode, tests and captures are
  global: two agents in it at once wreck each other's runs.
- **One compile.** There are no asmdefs, so all game code is Assembly-CSharp and Assembly-CSharp-Editor. A refresh
  compiles every script on disk under `Assets/`: one agent's half-written file breaks everyone's compile, and a compile
  reloads the domain, which drops CLI calls and stops Play Mode. Auto Refresh is on, so the developer focusing the
  Editor can set it off too.
- **No merging.** Scenes, prefabs, materials and data assets change only through Editor APIs (CLAUDE.md) and cannot be
  merged, so there are no branches or worktrees, and every asset has one writer.
- **One git index.** One agent's `stash`, `checkout` or `add -A` takes everyone's work with it.
- **Blender is free.** Each headless Blender build is its own process: any number can run at once.

So work runs **in parallel offline and in series in the Editor**. Workers do everything that needs no Editor at the
same time (modelling in Blender, drafting code and shaders, writing builders, designing looks) and take turns holding
the Editor, which you grant one at a time. Most of a feature's hours are offline work, and that is where the speed-up
comes from.

## Floor rules

Each rule closes one of the collisions above. Workers get them from
[references/worker-protocol.md](references/worker-protocol.md); you enforce them.

1. **One Editor holder.** Only the agent you granted a turn runs `unity command`. Its turn ends when its run ends.
   Anyone may run `unity status`.
2. **The project changes only in a turn.** `Assets/`, `Packages/` and `ProjectSettings/` change only during the
   holder's Editor turn. Outside a turn, a worker drafts project files in `.studio/drafts/<lane>/` and lands them in
   its turn, so what is on disk under `Assets/` always compiles and is never half made.
3. **One owner per path.** Each lane owns the paths its work order names. Shared files are yours unless the plan gives
   one to a single lane.
4. **One committer.** Workers only read git. You stage and commit, path by path.
5. **One voice.** Only you talk with the developer. Workers ask you.

## Same model, same effort

Spawn every worker with `subagent_type: "fork"`. A fork always runs on your model at your thinking effort (the harness
ignores model and effort overrides for forks), so a lead on Opus 5.5 at max effort gets workers on Opus 5.5 at max
effort, whatever the session runs on. Pass no `model` or `effort` for a fork, and never `isolation: "worktree"`.

- A fork starts with your whole conversation: the developer's words, the docs you read, the plan. That shared context
  keeps the lanes coherent, so spawn right after planning, before your context fills with Editor output.
- Forks cannot spawn agents or ask the developer. Everything goes through you.
- If the Agent tool offers no fork, spawn `subagent_type: "general-purpose"` with `model` set to your model's family
  (`opus`, `sonnet`, `haiku`, `fable`) and `effort` set to your own effort level. If you don't know your effort
  level, ask the developer once. Such a worker starts cold, so its work order also tells it to read CLAUDE.md,
  Architecture.md and the docs its lane needs.

Tell the developer how you spawned them in your staffing line, such as "three workers, forks on my model and effort".

## Staffing

When the developer asks for the studio, staff it: that is what they came for. Look for at least two lanes that can
work offline at the same time:

- **Several disciplines:** one lane each, as the table below has them: a model to build in Blender, a look to design
  and shade, a system to code.
- **One discipline:** split it where the files part. Code and its tests in one lane, content in another: for a look,
  the look code and its tests against the shaders, baked textures, materials, look data and prefabs; for a system, its
  code against its data assets and UI art. Or two effects that share no file. Name the contract between the halves:
  the fields, shader properties and asset paths one side writes and the other fills.
- **Nothing splits cleanly:** one worker, with you reviewing it, and say in a line why a second would only queue for
  the same files.

Only a change so small that the hand-off costs more than the work (a one-line fix, a value to tune) is yours alone:
say so, and staff anyway if the developer insists.

Spawn only the roles the task needs. Every worker costs what you cost, at your effort. Two workers of one role are
fine when their lanes don't touch (two models: `models-rod` and `models-stone`). Three or four workers are about the
most that help; more only wait in the Editor queue.

| Role | Lane | Brief | Owns by default |
| --- | --- | --- | --- |
| VFX Artist | `vfx` | [roles/vfx-artist.md](references/roles/vfx-artist.md) | shaders in `Assets/Shader/`, look materials `Assets/Materials/Spells/`, look textures `Assets/Art/Spellcraft/Looks/` and their baker, look data `Assets/Data/Spellcraft/Looks/`, look code `Assets/Scripts/Game/Spellcraft/Looks/`, the spell prefabs `Assets/Prefabs/Spells/`, `Docs/Spell-VFX.md` |
| 3D Model Artist | `models` | [roles/3d-model-artist.md](references/roles/3d-model-artist.md) | its `Tools/Blender/build_*.py`, its folders in the 3D library that `3D-Assets-Workflow.md` names, `Assets/Models/<Group>/<Model>/`, the model's `Assets/Materials/Props/<Model>*.mat` |
| Game Programmer | `code` | [roles/game-programmer.md](references/roles/game-programmer.md) | `Assets/Scripts/` outside other lanes' code, tests in `Assets/Scripts/Editor/Tests/`, gameplay data assets in `Assets/Data/`, the `Docs/` of the systems it changes |
| Lead (you) | `lead` | this file | `Assets/Scenes/`, `Assets/Prefabs/Core/`, `ProjectSettings/`, `Packages/`, `Architecture.md`, `Unity-CLI.md`, `3D-Assets-Workflow.md`, `Current-Task-Plan.md`, git, proposals for `CLAUDE.md` |

These are starting points: the work order names the exact paths for this task. For a role the table lacks (UI artist,
level designer, sound designer), write its brief into the work order from the nearest role; the protocol is the same.

## How a task runs

### 1. Intake

- Do CLAUDE.md's "Starting a task": `Current-Task-Plan.md` against `git status`, `Architecture.md`, and the documents
  of every system the task touches.
- Run `scripts/studio-editor-check.ps1`. If the Editor is not free because of the developer's own unsaved work, ask
  them before anyone touches it.
- Ask the developer, in one question, only what is theirs to decide: the design direction they would want a say in.
  Decide the rest as the lead and record it in the plan.
- Workers act under this session's permissions. If the session asks the developer before running commands, every
  worker's commands will ask too: say so when you staff up.

### 2. Split the work, contract first

Parallel work needs each lane to build against agreed names, not against another lane's unfinished work. Cut the task
along file ownership, where each lane can do most of its part offline, and give each lane a deliverable it can check
on its own (a model it can render, a look it can capture, code it can test), not a slice that only shows anything
after integration. Then write down what crosses each cut:

- **Model and the rest:** asset paths, part names and material slots (`<Model>_<Part>`), pivot and facing, size
  against the 1.83 m player, the triangle budget, sockets (empties) where effects or hands attach, the parts that move.
- **Look and code:** prefab and data asset paths, what the code calls (play, stop, strength), the shader properties the
  code drives, the particle budget, pooling.
- **Code and art:** new components, the serialized fields and data types artists fill, the events that start looks.
- **References:** a reference is wired by the owner of the asset that holds it. When that owner can't know the target
  in its turn, you wire it at integration, once both lanes have delivered.

The project's hot files each get one owner per task, usually the programmer or you: `GameManager` and `GameInitiator`
(bootstrap wiring), `Assets/Prefabs/Core/`, `Player.prefab`, `SpellcraftCatalog.asset`, `SpellDeliverySettings.asset`,
`GameControls.inputactions`, `Main-World.unity`. Others' needs in them go through change requests. A new folder that
two lanes write into gets one named creator, so nobody makes a numbered duplicate.

Content tests that check the whole game (every element has a look, every part has a rune stone) fail between turns
until all lanes have landed. Name them in each work order under "Red until integration", so no worker chases them and
nobody mistakes them for a regression; they must be green after your integration turn.

Then order the Editor turns by dependency: whatever others wire against lands first in a short turn (new types,
fields, data assets), models import before effects attach to their sockets, and your integration turn comes last.

Rewrite `Current-Task-Plan.md` (CLAUDE.md): the goal, numbered steps tagged with their lane (`3. [ ] vfx: storm
look`), and under Decisions the contracts in a few lines. A resuming lead needs the contracts most.

**Example**, a Storm element with a lightning rod by the training yard:

```
models  LightningRod: Tools/Blender/build_lightning_rod.py, Assets/Models/Props/LightningRod/, its Props materials.
        Contract: 2.4 m, pivot on the ground, at most 3k triangles, slots LightningRod_Metal/_Stone/_Coil,
        an empty Socket_Tip at the top.
vfx     Storm look: Look_Storm.asset, an Arc drawing in SpellLookTextureBaker, SpellParticle_Arc.mat; the rod's idle
        spark at Socket_Tip. Contract: Look_Storm fills every style; no new layer fields on the spell prefabs.
code    Storm rune: Rune_Storm.asset, its catalog entry, damage and status rules, tests, Docs/Spellcraft.md.
        Contract: rune id storm.
lead    Rune_Storm.Look -> Look_Storm; the rod in EnvironmentManager.prefab; Architecture.md; the full Play Mode suite.
Turns   code (rune data) -> models (import) -> vfx (look-dev, casting the rune) -> lead (integration)
```

### 3. Spawn

Spawn every worker in one message, so they start together: `subagent_type: "fork"`,
`description: "<Role>: <deliverable>"`, and the work order as the prompt.

The skill lives in its plugin, not in the game repository: write its base directory (shown when the skill loaded) in
full wherever the template says `<skill dir>`.

```
You are the <Role> worker of the game studio, lane `<lane>`. You are a fork of the lead, not the lead: you spawn no
agents, ask the developer nothing and plan no other lane. Read <skill dir>\references\worker-protocol.md and
<skill dir>\references\roles\<role>.md first, and follow them. The studio scripts are in <skill dir>\scripts\.

These floor rules override CLAUDE.md for you, its "Agents commit locally" included:
- Git is read-only: status, diff, log, show. Never add, commit, stash, checkout, restore, reset, clean, merge or apply.
  The lead commits.
- Outside an Editor turn the lead grants you, change nothing under Assets/, Packages/ or ProjectSettings/ and run no
  `unity command` (`unity status` is fine): draft in .studio\drafts\<lane>\ and land in your turn.
- Write only the paths you own below. End every run with the report the protocol gives.

Task: <the feature in one line, and this lane's part of it>
Deliverables:
- <each thing this lane makes, with its path>
You own (write only these): <paths>
You build against (read, never write): <other lanes' paths>
Contracts:
- You provide: <names, paths, properties, budgets that others rely on>
- You rely on: <what others provide, from which lane; build against the names before the thing exists>
Done means: <what you will check: tests, captures, the review sheet, numbers>
Red until integration: <cross-lane tests expected to fail until other lanes land, or none>
Editor turns to expect: <for example "one, to import the model and build its materials">
```

Keep the agent id each spawn result gives: SendMessage reaches a worker by it, and a message to a finished worker
resumes it with its context.

### 4. Run the floor

A worker ends each run with a report ([worker-protocol.md](references/worker-protocol.md#reports)) whose status is
EDITOR REQUEST, RELEASED, DONE or BLOCKED. Each report arrives as a notification and wakes you. Between reports, do
lead work that needs no Editor (review what has landed with `git diff`, prepare your integration builder, draft
`Architecture.md`), then end your turn.

- **Queue** the Editor requests. When the Editor is free, run `scripts/studio-editor-check.ps1`, then grant the next
  request with SendMessage to that worker:
  `EDITOR TURN GRANTED to <lane>. You hold the Unity Editor until you end this run. Waiting: <lanes or none>.`
- **A check that is not free** means the last holder left something: resume it to clean up, or do it yourself when
  it is trivial (stopping Play Mode), before granting anyone.
- **Order**: turns that unblock others first, then short turns (an import) before long ones (look development). Your
  own integration turns join the same queue. Never touch the Editor while a worker holds it.
- **A long turn** while others wait: message the holder to finish the step it is on and release. A message reaches a
  running worker at its next tool call.
- **BLOCKED and change requests**: decide, then answer the worker or tell the path's owner. Ask the developer only
  what is theirs.
- Keep the developer posted in a line at each milestone: who is on what, who holds the Editor.

### 5. Review and integrate

- Review each deliverable against its work order before you integrate it: the diff and CLAUDE.md's
  after-implementing checks for code, the review sheet and triangle count for a model, captures for a look, test
  results for everything.
- Send fixes to the owner, saying what to change and why. Don't fix another lane's work yourself: one writer per
  path is what keeps the next landing honest.
- In your integration turn, wire the cross-lane references into shared prefabs and scenes, run the affected tests
  (the full Play Mode suite when the change is broad), and capture the result in the game.

### 6. Finish

- Documents: each lane kept its own up to date. You update `Architecture.md` (the Documentation Map, bootstrap, frame
  order), add the reports' lessons to `Unity-CLI.md`, and update any other shared document.
- `scripts/studio-drafts.ps1 -Status` says no drafts are left, and `git status` shows only this task's files.
- Commit (CLAUDE.md, Git): one commit per deliverable that works on its own, in dependency order, or one for the task
  when the parts only work together. Stage explicit paths with their `.meta` files (`git add -- <paths>`), never
  `git add -A`. Then delete `.studio/`.
- Mark every step of `Current-Task-Plan.md` `[x]`.
- Give the walkthrough (CLAUDE.md, Finishing a system) lane by lane: scripts, data assets and prefabs, how they
  connect, and which values change what on screen.

## When things go wrong

- **A run fails mid-turn:** run the check. Stop Play Mode, wait out a compile, turn the Run In Background override
  off. For an unsaved scene or a dialog, find out whose it is before saving or discarding anything (Unity-CLI.md).
  Then resume the worker, which keeps its context, or give its step to a new fork.
- **A landing is refused:** a draft conflicts because someone wrote in that lane's path. Find out who, merge into the
  draft, open the file again, and land.
- **The Editor is unreachable:** see Unity-CLI.md (Connection, and Safe Mode after compile errors).
- **Your session ends mid-task:** the next one reads `Current-Task-Plan.md`, `git status` and
  `studio-drafts.ps1 -Status` (drafts survive in `.studio/`), and spawns new forks for the unfinished steps with work
  orders that say what is already done.

## Scripts

They are in this skill's `scripts\` folder. Run them in PowerShell from the game repository's root, which is how they
find the project: `powershell -NoProfile -File "<skill dir>\scripts\<script>" <arguments>`. Their working files go in
the game repository's `.studio\`, which its `.gitignore` leaves out.

| Script | Run by | What it does |
| --- | --- | --- |
| `studio-editor-check.ps1` | you before every grant; the holder at the start and end of its turn | Reads, changes nothing: the Editor is ready and idle, in Edit Mode, compiled, with the Run In Background override off, no unsaved scene and no open prefab. Exit 0 free, 1 not free (with what to do), 2 unreachable |
| `studio-drafts.ps1` | workers | `-Lane <lane> -Open <paths>` drafts existing files; a new file goes straight to `.studio/drafts/<lane>/<path>`; `-Status`; `-Land` in the lane's turn checks every draft, then copies; `-Discard` |
| `studio-compile-check.ps1` | workers, you | Compiles the working tree plus lanes' drafts with dotnet, outside the Editor, in seconds: `-Lane code`, `-Lane code,vfx`, `-AllLanes` |
