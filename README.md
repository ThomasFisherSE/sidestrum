# sidestrum

A ChordPro performance player. Paste or drop a ChordPro file and get a scrollable chord chart with chord diagrams, transpose, tap-synced line advance, and autoscroll.

This is a player engine: bring your own ChordPro. Nothing is fetched from the internet.

[sidestrum_example.webm](https://github.com/user-attachments/assets/8d6cfc1b-8fa6-4b55-8162-6620dbf07956)

## What it does

- Parses ChordPro with inline `[C]` chord markers, spec-compliant `{...}` directives, and section environments.
- Renders lyrics with chords positioned above the syllable where each change happens.
- Shows chord diagrams (guitar) for every chord used in the song. Custom `{define: ...}` fingerings override the built-in library.
- **Play Along** mode: tap the beat to advance the current line in time with you.
- **Autoscroll** mode: smooth continuous scroll at a configurable rate.
- Library stored locally in SQLite.

## ChordPro format

sidestrum follows the [ChordPro specification](https://www.chordpro.org/chordpro/chordpro-directives/). Example:

```
{title: Example Progression}
{artist: You}
{key: C}
{tempo: 120}
{time: 4/4}

{start_of_verse: Verse 1}
[C]Hello [G]world, [Am]here's a [F]song
[C]Simple [G]chords, [F]sing a-[C]long
{end_of_verse}

{start_of_chorus}
{comment: sing it loud}
[F]La la [C]la, [G]la la [Am]la
[F]La la [G]la, [C]la
{end_of_chorus}
```

### Supported directives

Metadata: `{title}` / `{t}`, `{subtitle}` / `{st}`, `{artist}`, `{composer}`, `{lyricist}`, `{album}`, `{year}`, `{copyright}`, `{key}`, `{tempo}`, `{time}`, `{capo}`, `{duration}`, `{meta: key value}`.

Sections: `{start_of_verse}` / `{sov}`, `{start_of_chorus}` / `{soc}`, `{start_of_bridge}` / `{sob}`, `{start_of_tab}` / `{sot}`, `{start_of_grid}` / `{sog}`, each with matching `{end_of_*}` / `{eo*}`. A label after the colon becomes the section heading (e.g. `{start_of_verse: Verse 2}`).

Inline: `{comment: ...}` / `{c: ...}`, `{comment_italic: ...}` / `{ci: ...}`, `{comment_box: ...}` / `{cb: ...}`, `{chorus}` to repeat a chorus by reference.

Chord definitions: `{define: Dsus4 base-fret 1 frets x x 0 2 3 3}` (optionally `fingers ...`). Definitions override the built-in chord diagram library for that chord name.

Lines starting with `#` are comments and are ignored, per spec.

For backward compatibility, files written in sidestrum's earlier conventions still parse: `TITLE: ...`, `ARTIST: ...`, `KEY: ...`, `BPM: ...`, `TIME: ...`, `CAPO: ...` header lines, and `# Section Name` headings (only honoured when the file contains no `{...}` directives at all).

Files with `.cho`, `.chordpro`, `.pro`, or `.txt` extensions are accepted for import.

## Running locally

```sh
npm install
npm run dev
```

Open the printed URL, paste a ChordPro song, click **Add to library**, then open it from the library to play.

## Optional: search plugins

The engine itself does not access the internet. If you want a search-and-fetch flow, you can write a source plugin and point the engine at it with the `SIDESTRUM_SOURCE` env var:

```sh
SIDESTRUM_SOURCE=./my-source.mjs npm run dev
```

A plugin is a module exporting `fetchSong(title, artist)` (required) and optionally `findCandidates(query)`. See [docs/plugins.md](docs/plugins.md) for the full interface and an example local-folder plugin.

You are responsible for the terms of service and copyright status of any source your plugin queries. Do not publish plugins that scrape services without permission.

## Built with

- [SvelteKit](https://kit.svelte.dev/) 5
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) for local library storage
- [@tombatossals/chords-db](https://github.com/tombatossals/chords-db) for chord diagram data

## License

MIT.
