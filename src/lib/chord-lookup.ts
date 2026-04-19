import guitarDb from '@tombatossals/chords-db/lib/guitar.json';

export type Position = {
	frets: number[];
	fingers: number[];
	barres: number[];
	baseFret: number;
	capo?: boolean;
};

type ChordEntry = {
	key: string;
	suffix: string;
	positions: Position[];
};

type GuitarDb = {
	chords: Record<string, ChordEntry[]>;
};

const db = guitarDb as unknown as GuitarDb;

const SHARP_TO_DB: Record<string, string> = {
	'C#': 'Csharp',
	'D#': 'Eb',
	'F#': 'Fsharp',
	'G#': 'Ab',
	'A#': 'Bb'
};

// Inside chord entries, keys are written "C", "C#", "D", ...
// But the outer `chords` object uses different keys — chords-db uses "Csharp", "Fsharp" for # notes
// and "Eb", "Ab", "Bb" for flats. Let's handle both.

const SUFFIX_MAP: Record<string, string> = {
	'': 'major',
	M: 'major',
	maj: 'major',
	m: 'minor',
	min: 'minor',
	'-': 'minor',
	dim: 'dim',
	'°': 'dim',
	dim7: 'dim7',
	'°7': 'dim7',
	sus: 'sus4',
	sus2: 'sus2',
	sus4: 'sus4',
	'7sus4': '7sus4',
	aug: 'aug',
	'+': 'aug',
	'6': '6',
	'69': '69',
	'7': '7',
	'7b5': '7b5',
	aug7: 'aug7',
	'9': '9',
	'9b5': '9b5',
	aug9: 'aug9',
	'7b9': '7b9',
	'7#9': '7#9',
	'11': '11',
	'9#11': '9#11',
	'13': '13',
	maj7: 'maj7',
	M7: 'maj7',
	'maj7b5': 'maj7b5',
	'maj7#5': 'maj7#5',
	maj9: 'maj9',
	maj11: 'maj11',
	maj13: 'maj13',
	m6: 'm6',
	m69: 'm69',
	m7: 'm7',
	'm7b5': 'm7b5',
	m9: 'm9',
	m11: 'm11',
	mmaj7: 'mmaj7',
	'mmaj7b5': 'mmaj7b5',
	mmaj9: 'mmaj9',
	mmaj11: 'mmaj11',
	add9: 'add9',
	madd9: 'madd9'
};

function rootToDbKey(root: string): string {
	return SHARP_TO_DB[root] ?? root;
}

function splitChord(chord: string): { root: string; suffix: string; bass: string | null } {
	const [main, bass] = chord.split('/');
	const m = main.match(/^([A-G][b#]?)(.*)$/);
	if (!m) return { root: main, suffix: '', bass: bass ?? null };
	return { root: m[1], suffix: m[2] ?? '', bass: bass ?? null };
}

export function lookupChordPositions(chord: string): Position[] {
	const { root, suffix, bass } = splitChord(chord);
	const dbKey = rootToDbKey(root);
	const entries = db.chords[dbKey];
	if (!entries) return [];

	const mappedSuffix = SUFFIX_MAP[suffix] ?? suffix;

	// If slash, try slash-specific suffix first
	if (bass) {
		const slashKey = `${mappedSuffix === 'major' ? '' : mappedSuffix}/${bass.replace('#', 'sharp')}`;
		const slashEntry = entries.find((e) => e.suffix === slashKey);
		if (slashEntry?.positions?.length) return slashEntry.positions;
	}

	const entry = entries.find((e) => e.suffix === mappedSuffix);
	if (entry?.positions?.length) return entry.positions;

	// Fallback: major/minor
	const fallback = entries.find((e) => e.suffix === (suffix.startsWith('m') ? 'minor' : 'major'));
	return fallback?.positions ?? [];
}

export function lookupChord(chord: string): Position | null {
	return lookupChordPositions(chord)[0] ?? null;
}
