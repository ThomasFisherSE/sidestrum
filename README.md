# sidestrum

A ChordPro performance player. Paste or drop a ChordPro file and get a scrollable chord chart with chord diagrams, transpose, tap-synced line advance, and autoscroll.

This is a player engine: bring your own ChordPro. Nothing is fetched from the internet.

## What it does

- Parses ChordPro with inline `[C]` chord markers and `# Section` headers.
- Renders lyrics with chords positioned above the syllable where each change happens.
- Shows chord diagrams (guitar) for every chord used in the song.
- **Play Along** mode: tap the beat to advance the current line in time with you.
- **Autoscroll** mode: smooth continuous scroll at a configurable rate.
- Library stored locally in SQLite.

## ChordPro format

Minimal example:

```
TITLE: Example Progression
ARTIST: You
KEY: C
BPM: 120

# Verse
[C]Hello [G]world, [Am]here's a [F]song
[C]Simple [G]chords, [F]sing a-[C]long

# Chorus
[F]La la [C]la, [G]la la [Am]la
[F]La la [G]la, [C]la
```

Headers (`TITLE`, `ARTIST`, `KEY`, `BPM`, `TIME`, `CAPO`) are optional. Section names start with `#`. Chords go inline in square brackets at the position where the change occurs in the lyric.

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
