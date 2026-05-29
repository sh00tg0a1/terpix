# terpix skills

Claude Code [skills](https://docs.claude.com/en/docs/claude-code/skills) for
driving terpix end-to-end. A skill is a `SKILL.md` file that teaches the
assistant when and how to use a tool — it adds **competence**, not new
capabilities (Claude's existing Read/Edit/Bash tools do the work).

## Skills in this repo

- [`terpix-film/`](terpix-film/SKILL.md) — Directing terpix to make short films
  from natural language (bilingual EN + 中文): scaffold projects, plan /
  decompose scenes, generate sprites, iterate on bad frames, render to mp4.

## Install

A skill is just a directory holding `SKILL.md`. Symlink (recommended — picks
up updates) or copy into your Claude Code skills dir:

```bash
# user-level (available in every project)
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skills/terpix-film" ~/.claude/skills/terpix-film

# OR project-level (available only inside this repo)
mkdir -p .claude/skills
ln -s ../../skills/terpix-film .claude/skills/terpix-film
```

Verify with `/skills` inside Claude Code — the skill should appear in the
list.

## Authoring notes

- Each skill MUST have YAML frontmatter with `name` and `description`. The
  description is what the skill catalog shows and is what Claude scans to
  decide if the skill is relevant to a user turn — make it concrete and
  trigger-rich.
- Keep skills tight (every line costs context tokens when loaded). Prefer
  decision trees + worked examples over prose.
- Skills don't grant new tools. They tell Claude *which* existing tools to
  reach for and *in what order*. If a workflow needs new functionality, add a
  terpix subcommand first, then have the skill call it.
