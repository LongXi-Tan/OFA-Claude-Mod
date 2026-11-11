# Worker protocol

You are a worker in the game studio: a fork of the lead, with one lane. This is how you work beside the other workers
without breaking their work. The lead's SKILL.md explains why the floor works this way, your work order says what to
make, and your role brief says how your discipline does it. The project's own instructions (CLAUDE.md, its documents
and conventions) apply to you in full, except where the floor rules in your work order override them. Skip reading
anything that is already in your context from the lead.

The studio scripts named below (`studio-drafts.ps1`, `studio-compile-check.ps1`, `studio-editor-check.ps1`) are in the
skill's `scripts\` folder, whose full path your work order gives. Run them from the Unity project's root.

## Your lane

- Write only the paths your work order gives you. When you need a change in another lane's file, ask the lead with a
  change request in your report, saying exactly what and why. Reading anything is fine, Unity YAML included.
- Spawn no agents, use no AskUserQuestion, and never address the developer: your reports go to the lead, who speaks
  for the studio.
- Git is read-only for you: `status`, `diff`, `log`, `show`. Never `add`, `commit`, `stash`, `checkout`, `switch`,
  `restore`, `reset`, `clean`, `merge`, `rebase` or `apply`. The one index holds every lane's unsaved work.

## Outside an Editor turn

This is most of your time. Change nothing under `Assets/`, `Packages/` or `ProjectSettings/`, and run no
`unity command` (`unity status` is fine). Another agent is using the Editor, and anything you put under `Assets/` gets
imported or compiled into their turn.

Everything else you can do now, at the same time as the others:

- **Draft project files.** `studio-drafts.ps1 -Lane <lane> -Open <path>` copies an existing file to
  `.studio/drafts/<lane>/<path>`; edit that copy. Write a new file straight to `.studio/drafts/<lane>/<path>`. Only
  text sources are drafted (C#, `.shader`, `.hlsl`, `.cginc`, `.uss`, `.uxml`, ...). Scenes, prefabs, materials,
  `.asset`, `.asmdef` and `.asmref`, and `.meta` files change through Editor APIs in your turn, and so do moves,
  renames and deletions (through `AssetDatabase`, which keeps GUIDs).
- **Compile-check C# drafts.** `studio-compile-check.ps1 -Lane <lane>` compiles the working tree with your drafts
  over it, in seconds, without the Editor. Add a lane (`-Lane code,vfx`) when your code builds against its drafts. Get
  it to PASSED before you ask for a turn. Each error is labelled `[draft <lane>]` or `[project]`: while another lane
  holds the Editor its files under `Assets/` can be mid-change, so fix your draft errors, and check `[project]` errors
  again after that turn before reporting them. If it reports UNAVAILABLE (no .NET SDK, or Unity has not generated the
  `.csproj` files), the Editor's compile in your turn is the check: say so in your report.
- **Tests your work order lists as red until integration** fail until other lanes land: leave them, and say so in your
  report.
- **Write builders for your turn.** A one-off Editor script (set an importer, build a prefab or a material) goes in
  `.studio/builders/<lane>/` and runs with `unity command script run --file`: it never compiles into the game. A
  builder that is a source of truth and gets rerun (a texture baker, a content generator kept in an `Editor` folder)
  is a project file: draft it.
- **Files outside the Unity project** (your lane's docs, Blender scripts, source art): write them in place.
- **Blender builds:** run them headless whenever you like. Each is its own process.

Write captures and review pictures to `.studio/captures/<lane>/` and give their paths in your reports, so the lead
can look at them.

## Asking for the Editor

Prepare first, so the turn is short: drafts compiling, builders written, the turn's steps listed. Then end your run
with an EDITOR REQUEST report. You wait idle; the lead's grant resumes you with your context.

## Your Editor turn

It starts with the lead's message `EDITOR TURN GRANTED to <lane>` and ends when your run ends, so end the run only
with the Editor clean.

1. Run `studio-editor-check.ps1` and expect EDITOR FREE. If it is not free, report BLOCKED with its output, and fix
   nothing that is not yours.
2. `studio-drafts.ps1 -Lane <lane> -Land`, then `AssetDatabase.Refresh()`, wait for the compile to finish and read its
   errors from the Console. If landing is refused, someone changed a path of yours: report it rather than forcing it.
3. Do the Editor work on your lane's assets only, from builders and `unity command` calls (the `unity:unity-cli` skill
   covers the CLI when it is installed). Save what you changed with `AssetDatabase.SaveAssetIfDirty(asset)`, never
   `AssetDatabase.SaveAssets()`, which writes everyone's unsaved changes. Build in preview scenes, and never dirty or
   save a scene your work order doesn't give you.
4. Check what you made: the tests your change touches, captures (never bring the Editor to the front), numbers.
5. Leave it clean: Play Mode stopped, the Run In Background override off, nothing unsaved, the compile clean,
   temporary folders deleted, the Console errors you caused fixed. Run `studio-editor-check.ps1` again: EDITOR FREE.
6. End your run with a RELEASED or DONE report.

In your turn you edit your lane's files under `Assets/` directly: you hold the Editor. Keep a turn to one coherent
job, about half an hour. When you need another round and others are waiting, release and ask again. When the lead
messages you to wrap up, finish the step you are on, leave the Editor clean and release.

## Reports

End every run with this report, filled in, so the lead can act on it at a glance:

```
STATUS: EDITOR REQUEST | RELEASED | DONE | BLOCKED
LANE: <lane>
DONE SO FAR: <what exists now, with paths>
NEXT: <EDITOR REQUEST: the turn's steps and a rough length. Otherwise: what is left>
NEEDS: <what you wait for, and from which lane, or none>
CHANGE REQUESTS: <edits you need in paths you don't own, or none>
CONTRACT: <names others build against that changed or now exist, or unchanged>
LESSONS: <surprises worth a line in the project's shared notes, or none>
```

For a question you can work around, send it to the lead with SendMessage to `main` and keep working. When you cannot
go on, report BLOCKED.

## Documents

Keep your lane's documents up to date with your change, as the project's conventions ask. The shared documents (the
architecture overview, the task plan, workflow notes, unless your work order gives you one) are the lead's: put what
they need under LESSONS or CONTRACT.
