const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_TO_SHARP: Record<string, string> = {
	Db: 'C#', Eb: 'D#', Gb: 'F#', Ab: 'G#', Bb: 'A#'
};

export function parseChord(chord: string): { root: string; rest: string; bass: string | null } {
	const [main, bassRaw] = chord.split('/');
	const m = main.match(/^([A-G][b#]?)(.*)$/);
	if (!m) return { root: main, rest: '', bass: bassRaw ?? null };
	const root = FLAT_TO_SHARP[m[1]] ?? m[1];
	let bass: string | null = null;
	if (bassRaw) {
		const bm = bassRaw.match(/^([A-G][b#]?)(.*)$/);
		bass = bm ? (FLAT_TO_SHARP[bm[1]] ?? bm[1]) + (bm[2] ?? '') : bassRaw;
	}
	return { root, rest: m[2] ?? '', bass };
}

export function transposeChord(chord: string, semitones: number): string {
	const { root, rest, bass } = parseChord(chord);
	const shift = (note: string): string => {
		const clean = FLAT_TO_SHARP[note] ?? note;
		const idx = NOTES_SHARP.indexOf(clean);
		if (idx < 0) return note;
		return NOTES_SHARP[(idx + semitones + 12 * 10) % 12];
	};
	const shiftedRoot = shift(root);
	if (!bass) return shiftedRoot + rest;
	const bm = bass.match(/^([A-G][b#]?)(.*)$/);
	if (!bm) return shiftedRoot + rest + '/' + bass;
	return shiftedRoot + rest + '/' + shift(bm[1]) + (bm[2] ?? '');
}

export function keyToSemitones(from: string | null, to: string | null): number {
	if (!from || !to) return 0;
	const a = NOTES_SHARP.indexOf(FLAT_TO_SHARP[from] ?? from);
	const b = NOTES_SHARP.indexOf(FLAT_TO_SHARP[to] ?? to);
	if (a < 0 || b < 0) return 0;
	let diff = b - a;
	if (diff > 6) diff -= 12;
	if (diff < -6) diff += 12;
	return diff;
}

// Capo on fret N: shapes you play are N semitones LOWER than sounding pitch.
// So to display the shape for a given sounding chord, we transpose DOWN by capo fret.
export function displayChord(soundingChord: string, capo: number, transpose: number): string {
	return transposeChord(soundingChord, transpose - capo);
}

export function beatsPerLine(timeSignature: string): number {
	const [num] = timeSignature.split('/').map(Number);
	return Number.isFinite(num) ? num : 4;
}
