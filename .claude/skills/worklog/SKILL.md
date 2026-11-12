---
name: worklog
description: Writes the user's daily work summary (for an internship or work log form) and keeps their SyncTask to-do list up to date. Use when the user asks "what did I work on today", wants a daily summary, log or stagelog to copy-paste, asks to add, list or complete to-dos or put the current project/work in their to-do list, or wants to tell the people who asked that their to-dos are done.
---

# Worklog and to-do list

The to-do list is the SyncTask app. Read and change it only through the tool (TODO = `node tools/todo.mjs`, run from the SyncTask repo):

```
TODO list [--all]
TODO today [YYYY-MM-DD]
TODO add "Title" [--cat Work] [--prio low|medium|high] [--due YYYY-MM-DD] [--notes "..."] [--source https://...] [--done]
TODO edit "<id or part of title>" [--notes "..."] [--source https://...]
TODO done "<id or part of title>"
TODO replies
TODO replied "<task id>"
TODO summaries
TODO summary YYYY-MM-DD "Text"
```

If the tool says `~/.synctask.json` is missing, tell the user what it asks for and stop. Never ask the user to paste a token into the chat, and never write a token or gist ID into a file inside a repository.

## Putting work in the to-do list

- One task per piece of work a colleague would recognise ("Build contact form for site X"), not per commit or file.
- Category is `Work` unless the user says otherwise (the app also knows `Personal`, `Shopping`, `Study`).
- Start the title with the project name, e.g. `Site X: fix mobile menu`, so the list can be searched per project.
- Work that is already finished: add it with `--done`, or `TODO done` the existing task. Check `TODO list` first so you do not add a duplicate.
- Planned work: add it open, with `--due` only if the user gave a date.
- Notes: the first line is a one-sentence summary; after a blank line, explain what to do and how in a few numbered steps (write `\n` for a line break). If the task came from a message, pass its link as `--source`.

## Telling the sender a to-do is done

When the user asks to answer the people whose to-dos are finished (or as part of the daily summary):

1. `TODO replies` lists completed to-dos that came from a message (`source`) and were not answered yet.
2. For each one, open the thread behind the source link. If the user already said there that it is done, only run `TODO replied "<task id>"`.
3. Otherwise write a one- or two-sentence reply in the language of the original message and show it to the user. Create it as a draft in that thread, or send it only after the user says yes to that specific text.
4. Then run `TODO replied "<task id>"`.

## Daily summary

1. Gather what happened today:
   - this conversation (what was built, fixed, decided);
   - `git log --since=midnight --author="$(git config user.name)" --oneline` in the current repository, and in other repositories the user names;
   - `TODO today`.
2. Record it: add or complete tasks so the to-do list matches the work (rules above).
3. Write the summary:
   - 3 to 6 short sentences or bullets, past tense, first person, plain words a non-technical supervisor understands;
   - say what was done and why it mattered, not which files changed; no commit hashes, no code;
   - one closing line on what is next, if known;
   - write it in the language the user's form uses; if unknown, use the language the user is writing in.
4. Save it with `TODO summary YYYY-MM-DD "Text"` (write `\n` for a line break) so it appears under Day Summary in the app, where the user copies it and ticks it off. If the tool says that day was already pasted, do not overwrite it.
5. Also output the summary in one fenced code block so it can be copied in one click, with nothing else inside the block.

Only report work you have evidence for. If today's evidence is thin, say so and ask what is missing instead of padding.
