import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Song, SongSummary } from '$lib/types';

const db = new Database('sidestrum.db');
db.pragma('journal_mode = WAL');

db.exec(`
	CREATE TABLE IF NOT EXISTS songs (
		id TEXT PRIMARY KEY,
		title TEXT NOT NULL,
		artist TEXT NOT NULL,
		key TEXT,
		bpm INTEGER,
		data TEXT NOT NULL,
		created_at TEXT NOT NULL,
		last_played_at TEXT
	);
	CREATE INDEX IF NOT EXISTS idx_songs_title_artist ON songs(title, artist);
`);

export function saveSong(song: Omit<Song, 'id' | 'created_at' | 'last_played_at'>): Song {
	const id = randomUUID();
	const created_at = new Date().toISOString();
	const full: Song = { ...song, id, created_at, last_played_at: null };
	db.prepare(
		`INSERT INTO songs (id, title, artist, key, bpm, data, created_at, last_played_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
	).run(id, full.title, full.artist, full.key, full.bpm, JSON.stringify(full), created_at, null);
	return full;
}

export function getSong(id: string): Song | null {
	const row = db.prepare(`SELECT data FROM songs WHERE id = ?`).get(id) as { data: string } | undefined;
	return row ? (JSON.parse(row.data) as Song) : null;
}

export function findByTitleArtist(title: string, artist: string): Song | null {
	const row = db
		.prepare(`SELECT data FROM songs WHERE LOWER(title) = LOWER(?) AND LOWER(artist) = LOWER(?) LIMIT 1`)
		.get(title, artist) as { data: string } | undefined;
	return row ? (JSON.parse(row.data) as Song) : null;
}

export function listSongs(): SongSummary[] {
	const rows = db
		.prepare(
			`SELECT id, title, artist, key, bpm, created_at, last_played_at
			 FROM songs
			 ORDER BY COALESCE(last_played_at, created_at) DESC`
		)
		.all() as SongSummary[];
	return rows;
}

export function updateSong(id: string, song: Song): void {
	db.prepare(
		`UPDATE songs SET title=?, artist=?, key=?, bpm=?, data=? WHERE id=?`
	).run(song.title, song.artist, song.key, song.bpm, JSON.stringify(song), id);
}

export function touchPlayed(id: string): void {
	db.prepare(`UPDATE songs SET last_played_at=? WHERE id=?`).run(new Date().toISOString(), id);
}

export function deleteSong(id: string): void {
	db.prepare(`DELETE FROM songs WHERE id=?`).run(id);
}
