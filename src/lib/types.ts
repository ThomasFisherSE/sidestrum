export type Chord = {
	pos: number;
	chord: string;
};

export type Line = {
	lyric: string;
	chords: Chord[];
	duration_beats?: number;
};

export type Section = {
	name: string;
	lines: Line[];
};

export type SongSource = {
	type: 'web_search' | 'llm_generated' | 'manual';
	url?: string;
	fetched_at: string;
};

export type Song = {
	id: string;
	title: string;
	artist: string;
	key: string | null;
	bpm: number | null;
	time_signature: string;
	capo: number;
	sections: Section[];
	source: SongSource;
	user_edits: Partial<Song> | null;
	created_at: string;
	last_played_at: string | null;
};

export type SongCandidate = {
	title: string;
	artist: string;
	year?: number;
	note?: string;
};

export type SongSummary = Pick<
	Song,
	'id' | 'title' | 'artist' | 'key' | 'bpm' | 'last_played_at' | 'created_at'
>;
