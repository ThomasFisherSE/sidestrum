export type Chord = {
	pos: number;
	chord: string;
};

export type LyricLine = {
	type?: 'lyric';
	lyric: string;
	chords: Chord[];
	duration_beats?: number;
};

export type CommentLine = {
	type: 'comment';
	text: string;
	style: 'plain' | 'italic' | 'box';
};

export type TabLine = {
	type: 'tab';
	text: string;
};

export type ChorusRefLine = {
	type: 'chorus_ref';
	label?: string;
};

export type Line = LyricLine | CommentLine | TabLine | ChorusRefLine;

export function isLyricLine(line: Line): line is LyricLine {
	return line.type === undefined || line.type === 'lyric';
}

export type SectionKind = 'verse' | 'chorus' | 'bridge' | 'tab' | 'grid' | 'other';

export type Section = {
	name: string;
	kind?: SectionKind;
	lines: Line[];
};

export type ChordDef = {
	name: string;
	baseFret: number;
	frets: number[];
	fingers: number[];
	barres: number[];
};

export type SongSource = {
	type: 'paste' | 'import' | 'plugin';
	filename?: string;
	sourceUrl?: string;
	imported_at: string;
};

export type Song = {
	id: string;
	title: string;
	artist: string;
	subtitle?: string;
	composer?: string;
	lyricist?: string;
	album?: string;
	year?: number;
	copyright?: string;
	key: string | null;
	bpm: number | null;
	time_signature: string;
	capo: number;
	duration?: string;
	meta?: Record<string, string>;
	sections: Section[];
	chord_defs?: ChordDef[];
	source: SongSource;
	user_edits: Partial<Song> | null;
	created_at: string;
	last_played_at: string | null;
};

export type SongSummary = Pick<
	Song,
	'id' | 'title' | 'artist' | 'key' | 'bpm' | 'last_played_at' | 'created_at'
>;

export type SongCandidate = {
	title: string;
	artist: string;
	year?: number;
	note?: string;
};
