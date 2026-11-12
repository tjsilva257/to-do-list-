#!/usr/bin/env node
// Command-line access to the same private gist the app syncs with, so Claude (or you) can read and add tasks.
// Credentials are read from ~/.synctask.json  { "token": "...", "gistId": "..." }  and never from this repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';

const FILE = 'synctask-data.json'; // same name as js/sync.js
const CATEGORIES = ['Work', 'Personal', 'Shopping', 'Study']; // the only ones the app's sidebar knows
const FLAGS = { all: false, done: false, cat: true, prio: true, due: true, notes: true, source: true }; // true = takes a value
// A day that exists: 2026-02-30 parses as 2 March, so compare the round trip
export const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(new Date(d + 'T00:00Z')) && new Date(d + 'T00:00Z').toISOString().slice(0, 10) === d;
// How many words each command takes (command included); more means a quote went missing and text would be cut off
const WORDS = { list: 1, today: 2, add: 2, edit: 2, done: 2, replies: 1, replied: 2, summaries: 1, summary: 3, selftest: 1 };
const USAGE = `Usage:
  node tools/todo.mjs list [--all]              open tasks (--all: also completed)
  node tools/todo.mjs today [YYYY-MM-DD]        tasks created or completed on that day (default today)
  node tools/todo.mjs add "Title" [--cat Work] [--prio low|medium|high] [--due YYYY-MM-DD] [--notes "..."] [--source https://...] [--done]
  node tools/todo.mjs edit "<id or part of title>" [--notes "..."] [--source https://...]
  node tools/todo.mjs done "<id or part of title>"
  node tools/todo.mjs replies                   completed tasks that came from a message and were not answered yet
  node tools/todo.mjs replied "<id>"            mark that the sender was told it is done
  node tools/todo.mjs summaries                 days that have a written summary
  node tools/todo.mjs summary YYYY-MM-DD "Text"  store the written summary for a day
  In --notes and summary text, write \\n for a line break.
  node tools/todo.mjs selftest`;

// Same shape the app writes in js/storage.js saveTask / js/app.js handleAddTask
// Shells make real line breaks in arguments painful, so \n typed as two characters becomes one.
// ponytail: this also breaks a Windows path like C:\new in notes; write such paths with forward slashes.
export const multiline = text => String(text).replaceAll('\\n', '\n');

export function checkSource(source) {
  if (source && !/^https:\/\/\S+$/.test(source)) throw new Error('--source must be an https:// link');
  return source || null;
}

export function makeTask({ title, cat = 'Work', prio = 'medium', due = null, notes = '', source = null, done = false }, now = Date.now()) {
  if (!title || !title.trim()) throw new Error('A task needs a title');
  if (!['low', 'medium', 'high'].includes(prio)) throw new Error('--prio must be low, medium or high');
  if (!CATEGORIES.includes(cat)) throw new Error('--cat must be one of ' + CATEGORIES.join(', '));
  if (due && !isDay(due)) throw new Error('--due must be a real date as YYYY-MM-DD');
  return {
    id: 'task_' + now + '_' + Math.random().toString(36).substring(2, 9),
    title: title.trim(), priority: prio, category: cat, dueDate: due, notes: multiline(notes), source: checkSource(source),
    completed: !!done, completedAt: done ? now : null, subtasks: [], tags: [], createdAt: now, updatedAt: now,
  };
}

// Exact id wins; otherwise the title must match exactly one open task
export function findTask(tasks, query) {
  const live = tasks.filter(t => !t.deletedAt);
  const byId = live.find(t => t.id === query);
  if (byId) return byId;
  const hits = live.filter(t => !t.completed && t.title.toLowerCase().includes(query.toLowerCase()));
  if (hits.length === 1) return hits[0];
  throw new Error(hits.length ? `"${query}" matches ${hits.length} tasks: ${hits.map(t => t.title).join(' | ')}` : `No open task matches "${query}"`);
}

// Tasks created or completed on the local day that contains `now`
export function touchedToday(tasks, now = Date.now()) {
  const start = new Date(now).setHours(0, 0, 0, 0);
  const end = new Date(now).setHours(24, 0, 0, 0);
  const on = ts => ts >= start && ts < end;
  // completedAt is missing on tasks completed by older app versions: fall back to the last change
  return tasks.filter(t => !t.deletedAt && (on(t.createdAt) || (t.completed && on(t.completedAt || t.updatedAt))));
}

// Completed tasks that came from a message whose sender has not been told yet
export const awaitingReply = tasks => tasks.filter(t => !t.deletedAt && t.completed && t.source && !t.repliedAt);

// Summaries live next to the tasks: { 'YYYY-MM-DD': { text, updatedAt, pasted } }
export function setSummary(summaries, date, text, now = Date.now()) {
  if (!isDay(date)) throw new Error('The day must be a real date as YYYY-MM-DD');
  if (!text || !text.trim()) throw new Error('The summary text is empty');
  if (summaries[date]?.pasted) throw new Error(`The summary for ${date} was already pasted; not overwriting it`);
  summaries[date] = { text: multiline(text).trim(), updatedAt: now, pasted: false };
  return summaries[date];
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i].slice(2);
    if (!argv[i].startsWith('--')) opts._.push(argv[i]);
    else if (!(name in FLAGS)) throw new Error('Unknown option ' + argv[i]);
    else if (!FLAGS[name]) opts[name] = true;
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) throw new Error(argv[i] + ' needs a value');
    else opts[name] = argv[++i];
  }
  return opts;
}

function loadConfig() {
  const file = path.join(os.homedir(), '.synctask.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cfg.token && cfg.gistId) return cfg;
  } catch {}
  throw new Error(`Missing ${file}. Create it with {"token": "<GitHub token with only the gist permission>", "gistId": "<Gist ID shown in the app's Cloud tab>"}`);
}

async function gist(cfg, method = 'GET', body) {
  const res = await fetch('https://api.github.com/gists/' + cfg.gistId, {
    method,
    headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json' },
    body: body && JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub answered ${res.status} ${res.statusText}`);
  return res.json();
}

async function readData(cfg) {
  const file = (await gist(cfg)).files[FILE];
  if (!file) return { version: 1, tasks: [], categories: [] };
  // GitHub cuts large files off in the API answer and points to raw_url for the rest
  return JSON.parse(file.truncated ? await (await fetch(file.raw_url)).text() : file.content);
}

// ponytail: read-then-write without a lock; a change the app pushes in the same second can be lost. Fine for one person.
async function writeData(cfg, data) {
  data.updatedAt = Date.now();
  await gist(cfg, 'PATCH', { files: { [FILE]: { content: JSON.stringify(data, null, 2) } } });
}

const show = t => `${t.completed ? '[x]' : '[ ]'} ${t.title}  (${t.category || '-'}, ${t.priority}${t.dueDate ? ', due ' + t.dueDate : ''})  ${t.id}`
  + (t.source ? `\n      source: ${t.source}${t.repliedAt ? ' (answered)' : ''}` : '')
  + (t.notes ? '\n      ' + t.notes.replaceAll('\n', '\n      ') : '');

function selftest() {
  const now = new Date('2026-11-12T10:00:00').getTime();
  const a = makeTask({ title: ' Fix header ' }, now);
  assert.equal(a.title, 'Fix header');
  assert.equal(a.category, 'Work');
  assert.equal(a.updatedAt, now);
  assert.throws(() => makeTask({ title: '' }));
  assert.throws(() => makeTask({ title: 'x', prio: 'urgent' }));
  assert.throws(() => makeTask({ title: 'x', due: 'tomorrow' }));
  assert.throws(() => makeTask({ title: 'x', due: '2026-13-45' }));
  assert.throws(() => makeTask({ title: 'x', cat: 'work' }));
  assert.throws(() => parseArgs(['add', 'T', '--due', '--done']), /needs a value/);
  assert.throws(() => parseArgs(['add', 'T', '--priority', 'high']), /Unknown option/);
  const editedOldDone = { ...makeTask({ title: 'Old', done: true }, now - 3 * 86400000), updatedAt: now };
  assert.deepEqual(touchedToday([editedOldDone], now), []);
  const b = makeTask({ title: 'Fix footer' }, now - 2 * 86400000);
  const gone = { ...makeTask({ title: 'Fix header old' }, now), deletedAt: now };
  assert.equal(findTask([a, b, gone], 'footer'), b);
  assert.equal(findTask([a, b, gone], a.id), a);
  assert.throws(() => findTask([a, b], 'fix'), /matches 2/);
  assert.throws(() => findTask([a, b], 'nothing'), /No open task/);
  assert.deepEqual(touchedToday([a, b, gone], now), [a]);
  assert.deepEqual(touchedToday([a, b], now - 2 * 86400000), [b]); // a past day does not include later work
  assert.equal(makeTask({ title: 'x', notes: 'one\\ntwo' }).notes, 'one\ntwo');
  assert.throws(() => makeTask({ title: 'x', source: 'javascript:alert(1)' }), /https/);
  const fromSlack = makeTask({ title: 'Asked', source: 'https://x.slack.com/archives/C1/p1', done: true }, now);
  assert.deepEqual(awaitingReply([a, fromSlack, { ...fromSlack, repliedAt: now }, { ...fromSlack, completed: false }]), [fromSlack]);
  const sums = {};
  assert.equal(setSummary(sums, '2026-11-12', ' Did A.\\nDid B. ', now).text, 'Did A.\nDid B.');
  assert.throws(() => setSummary(sums, '12-11-2026', 'x'), /real date/);
  assert.throws(() => setSummary(sums, '2026-02-30', 'x'), /real date/);
  assert.throws(() => makeTask({ title: 'x', due: '2026-04-31' }), /real date/);
  assert.ok(isDay('2028-02-29'));
  assert.throws(() => setSummary(sums, '2026-11-12', '  '), /empty/);
  sums['2026-11-12'].pasted = true;
  assert.throws(() => setSummary(sums, '2026-11-12', 'new'), /already pasted/);
  assert.deepEqual(touchedToday([{ ...b, completed: true, updatedAt: now }], now).length, 1);
  assert.deepEqual(parseArgs(['add', 'T', '--prio', 'high', '--done']), { _: ['add', 'T'], prio: 'high', done: true });
  console.log('selftest ok');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [cmd, arg] = opts._;
  if (cmd === 'selftest') return selftest();
  if (!['list', 'today', 'add', 'edit', 'done', 'replies', 'replied', 'summaries', 'summary'].includes(cmd)) return console.log(USAGE);
  if (opts._.length > WORDS[cmd]) throw new Error(`Too many words after "${cmd}": put the text in one pair of double quotes and use no double quotes inside it`);

  const cfg = loadConfig();
  const data = await readData(cfg);
  data.tasks ||= [];
  data.summaries ||= {};

  if (cmd === 'list') {
    const tasks = data.tasks.filter(t => !t.deletedAt && (opts.all || !t.completed));
    console.log(tasks.map(show).join('\n') || 'No tasks.');
  } else if (cmd === 'today') {
    if (arg && !isDay(arg)) throw new Error('The day must be a real date as YYYY-MM-DD');
    const when = arg ? new Date(arg + 'T12:00').getTime() : Date.now();
    console.log(touchedToday(data.tasks, when).map(show).join('\n') || 'Nothing created or completed that day.');
  } else if (cmd === 'add') {
    const task = makeTask({ title: arg, ...opts });
    data.tasks.push(task);
    await writeData(cfg, data);
    console.log('Added: ' + show(task));
  } else if (cmd === 'edit') {
    if (!arg) throw new Error('Say which task: edit "<id or part of title>"');
    if (opts.notes === undefined && opts.source === undefined) throw new Error('Nothing to change: give --notes or --source');
    const task = findTask(data.tasks, arg);
    if (opts.notes !== undefined) task.notes = multiline(opts.notes);
    if (opts.source !== undefined) task.source = checkSource(opts.source);
    task.updatedAt = Date.now();
    await writeData(cfg, data);
    console.log('Updated: ' + show(task));
  } else if (cmd === 'replies') {
    console.log(awaitingReply(data.tasks).map(show).join('\n') || 'Nobody is waiting for an answer.');
  } else if (cmd === 'replied') {
    const task = awaitingReply(data.tasks).find(t => t.id === arg);
    if (!task) throw new Error(`No completed, unanswered task with a source has id ${arg}; see "replies"`);
    task.updatedAt = task.repliedAt = Date.now();
    await writeData(cfg, data);
    console.log('Marked as answered: ' + task.title);
  } else if (cmd === 'summaries') {
    const days = Object.keys(data.summaries).sort().reverse();
    console.log(days.map(d => `${d}  ${data.summaries[d].pasted ? 'pasted' : 'not pasted yet'}`).join('\n') || 'No summaries yet.');
  } else if (cmd === 'summary') {
    const saved = setSummary(data.summaries, arg, opts._[2]);
    await writeData(cfg, data);
    console.log(`Summary for ${arg} saved:\n${saved.text}`);
  } else if (cmd === 'done') {
    if (!arg) throw new Error('Say which task: done "<id or part of title>"');
    const task = findTask(data.tasks, arg);
    task.completed = true;
    task.updatedAt = task.completedAt = Date.now(); // newer timestamp makes every device accept the change
    await writeData(cfg, data);
    console.log('Completed: ' + show(task));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch(err => { console.error('Error: ' + err.message); process.exit(1); });
}
