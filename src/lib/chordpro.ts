import type { Line, Section } from './types';

export function parseChordProLine(raw: string): Line {
	const chords: { pos: number; chord: string }[] = [];
	let lyric = '';
	let i = 0;
	while (i < raw.length) {
		if (raw[i] === '[') {
			const end = raw.indexOf(']', i);
			if (end === -1) {
				lyric += raw[i++];
				continue;
			}
			const chord = raw.slice(i + 1, end).trim();
			if (chord) chords.push({ pos: lyric.length, chord });
			i = end + 1;
		} else {
			lyric += raw[i++];
		}
	}
	return { lyric: lyric.trimEnd(), chords };
}

export type ParsedChordPro = {
	title?: string;
	artist?: string;
	key?: string | null;
	bpm?: number | null;
	time_signature?: string;
	sections: Section[];
};

const HEADER_KEYS = ['TITLE', 'ARTIST', 'KEY', 'BPM', 'TIME', 'TIME_SIGNATURE', 'CAPO'];

export function parseChordPro(text: string): ParsedChordPro {
	const result: ParsedChordPro = { sections: [] };
	const lines = text.replace(/\r\n/g, '\n').split('\n');

	let currentSection: Section | null = null;
	let inBody = false;

	for (const raw of lines) {
		const line = raw.replace(/\s+$/, '');
		if (!line) {
			// preserve blank inside a section? skip for now
			continue;
		}

		if (!inBody) {
			const header = line.match(/^([A-Z_]+):\s*(.+)$/);
			if (header && HEADER_KEYS.includes(header[1])) {
				const k = header[1];
				const v = header[2].trim();
				if (k === 'TITLE') result.title = v;
				else if (k === 'ARTIST') result.artist = v;
				else if (k === 'KEY') result.key = v || null;
				else if (k === 'BPM') {
					const n = Number(v);
					result.bpm = Number.isFinite(n) ? n : null;
				} else if (k === 'TIME' || k === 'TIME_SIGNATURE') result.time_signature = v;
				continue;
			}
			inBody = true;
		}

		// Section header: "# Name" or "## Name"
		const sec = line.match(/^#+\s*(.+)$/);
		if (sec) {
			currentSection = { name: sec[1].trim(), lines: [] };
			result.sections.push(currentSection);
			continue;
		}

		if (!currentSection) {
			currentSection = { name: 'Song', lines: [] };
			result.sections.push(currentSection);
		}
		currentSection.lines.push(parseChordProLine(line));
	}

	return result;
}
