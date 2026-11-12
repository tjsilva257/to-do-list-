#!/usr/bin/env node
// Command-line access to the same private gist the app syncs with, so Claude (or you) can read and add tasks.
// Credentials are read from ~/.synctask.json  { "token": "...", "gistId": "..." }  and never from this repo.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';

const FILE = 'synctask-data.json'; // same name as js/sync.js
const CATEGORIES = ['Work', 'Personal', 'Shopping', 'Study']; // the only ones the app's sidebar knows
const FLAGS = { all: false, done: false, cat: true, prio: true, due: true, notes: true }; // true = takes a value
const USAGE = `Usage:
  node tools/todo.mjs list [--all]              open tasks (--all: also completed)
  node tools/todo.mjs today                     tasks created or completed today
  node tools/todo.mjs add "Title" [--cat Work] [--prio low|medium|high] [--due YYYY-MM-DD] [--notes "..."] [--done]
  node tools/todo.mjs done "<id or part of title>"
  node tools/todo.mjs selftest`;

// Same shape the app writes in js/storage.js saveTask / js/app.js handleAddTask
export function makeTask({ title, cat = 'Work', prio = 'medium', due = null, notes = '', done = false }, now = Date.now()) {
  if (!title || !title.trim()) throw new Error('A task needs a title');
  if (!['low', 'medium', 'high'].includes(prio)) throw new Error('--prio must be low, medium or high');
  if (!CATEGORIES.includes(cat)) throw new Error('--cat must be one of ' + CATEGORIES.join(', '));
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || isNaN(new Date(due)))) throw new Error('--due must be a real date as YYYY-MM-DD');
  return {
    id: 'task_' + now + '_' + Math.random().toString(36).substring(2, 9),
    title: title.trim(), priority: prio, category: cat, dueDate: due, notes,
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

export function touchedToday(tasks, now = Date.now()) {
  const start = new Date(now).setHours(0, 0, 0, 0);
  // completedAt is missing on tasks completed by older app versions: fall back to the last change
  return tasks.filter(t => !t.deletedAt && (t.createdAt >= start || (t.completed && (t.completedAt || t.updatedAt) >= start)));
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

const show = t => `${t.completed ? '[x]' : '[ ]'} ${t.title}  (${t.category || '-'}, ${t.priority}${t.dueDate ? ', due ' + t.dueDate : ''})  ${t.id}${t.notes ? '\n      ' + t.notes : ''}`;

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
  assert.deepEqual(touchedToday([{ ...b, completed: true, updatedAt: now }], now).length, 1);
  assert.deepEqual(parseArgs(['add', 'T', '--prio', 'high', '--done']), { _: ['add', 'T'], prio: 'high', done: true });
  console.log('selftest ok');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const [cmd, arg] = opts._;
  if (cmd === 'selftest') return selftest();
  if (!['list', 'today', 'add', 'done'].includes(cmd)) return console.log(USAGE);

  const cfg = loadConfig();
  const data = await readData(cfg);
  data.tasks ||= [];

  if (cmd === 'list') {
    const tasks = data.tasks.filter(t => !t.deletedAt && (opts.all || !t.completed));
    console.log(tasks.map(show).join('\n') || 'No tasks.');
  } else if (cmd === 'today') {
    console.log(touchedToday(data.tasks).map(show).join('\n') || 'Nothing created or completed today.');
  } else if (cmd === 'add') {
    const task = makeTask({ title: arg, ...opts });
    data.tasks.push(task);
    await writeData(cfg, data);
    console.log('Added: ' + show(task));
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
