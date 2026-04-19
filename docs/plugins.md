# Source plugins

By default sidestrum does not access the internet: you paste or drop ChordPro and it gets stored in your local library. A source plugin is an optional hook that lets a developer add a "search" or "fetch by title/artist" flow on top of the engine, pulling ChordPro from anywhere they choose (a local folder, a private corpus, an online service, an LLM, etc.).

## Legal

You are responsible for the terms of service and copyright status of any source you query. Chord transcriptions and lyrics of copyrighted compositions are themselves copyrighted works, and many chord-sharing sites prohibit automated access in their terms. Do not publish or redistribute a plugin that scrapes a service without permission. The sidestrum engine itself does not access the internet and ships no such plugin.

## The contract

A plugin is a JavaScript/TypeScript module that exports an object matching `SongSourcePlugin`:

```ts
export type FetchedSong = {
	chordpro: string;
	sourceUrl?: string;
};

export interface SongSourcePlugin {
	findCandidates?(query: string): Promise<SongCandidate[]>;
	fetchSong(title: string, artist: string): Promise<FetchedSong>;
}

export type SongCandidate = {
	title: string;
	artist: string;
	year?: number;
	note?: string;
};
```

- `fetchSong` is required. Return ChordPro text; the engine parses and saves it.
- `findCandidates` is optional. If present, the home page shows a search bar and a picker for disambiguating recordings (original vs covers, etc.). If absent, the home page shows a direct "Title + Artist" fetch form.

Either named exports or a `default` export works.

## Configuring a plugin

Set the `SIDESTRUM_SOURCE` environment variable to the path of your plugin module (absolute or relative to the server's working directory):

```sh
SIDESTRUM_SOURCE=./plugins/my-source.mjs npm run dev
```

The module is loaded once, lazily, on first request. Restart the dev server after editing the plugin file.

## Example: local folder plugin

A minimal plugin that reads `.cho` files from a directory. No networking, no copyright concerns: a demonstration of the contract.

```js
// my-source.mjs
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const DIR = process.env.CHORDPRO_DIR ?? './chordpro-library';

export async function findCandidates(query) {
	const q = query.toLowerCase();
	const files = await readdir(DIR);
	return files
		.filter((f) => /\.(cho|chordpro|pro)$/i.test(f) && f.toLowerCase().includes(q))
		.slice(0, 5)
		.map((f) => ({ title: f.replace(/\.[^.]+$/, ''), artist: 'Local file' }));
}

export async function fetchSong(title) {
	const files = await readdir(DIR);
	const match = files.find((f) => f.replace(/\.[^.]+$/, '') === title);
	if (!match) throw new Error(`No file matching "${title}"`);
	const chordpro = await readFile(join(DIR, match), 'utf8');
	return { chordpro };
}
```

Run with:

```sh
CHORDPRO_DIR=~/chords SIDESTRUM_SOURCE=./my-source.mjs npm run dev
```

## Error handling

- Throwing from `fetchSong` surfaces the error message to the user as a 502 with the thrown message.
- Returning empty ChordPro, or ChordPro with no parseable sections, is treated as a plugin error.
- If the module fails to load (syntax error, missing `fetchSong` export), the home page shows a warning banner and falls back to paste-only.
