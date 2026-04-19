import type {
	ChordDef,
	CommentLine,
	Line,
	LyricLine,
	Section,
	SectionKind,
	Song,
	TabLine
} from './types';
import { isLyricLine } from './types';

export function parseChordProLine(raw: string): LyricLine {
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
	subtitle?: string;
	artist?: string;
	composer?: string;
	lyricist?: string;
	album?: string;
	year?: number;
	copyright?: string;
	key?: string | null;
	bpm?: number | null;
	time_signature?: string;
	capo?: number;
	duration?: string;
	meta?: Record<string, string>;
	sections: Section[];
	chord_defs?: ChordDef[];
};

type DirectiveMatch = { name: string; arg: string };

// ChordPro directive aliases (long form canonical, short form alias).
// https://www.chordpro.org/chordpro/chordpro-directives/
const DIRECTIVE_ALIAS: Record<string, string> = {
	t: 'title',
	st: 'subtitle',
	c: 'comment',
	ci: 'comment_italic',
	cb: 'comment_box',
	soc: 'start_of_chorus',
	eoc: 'end_of_chorus',
	sov: 'start_of_verse',
	eov: 'end_of_verse',
	sob: 'start_of_bridge',
	eob: 'end_of_bridge',
	sot: 'start_of_tab',
	eot: 'end_of_tab',
	sog: 'start_of_grid',
	eog: 'end_of_grid',
	ns: 'new_song',
	np: 'new_page',
	npp: 'new_physical_page',
	colb: 'column_break'
};

const SECTION_START_KINDS: Record<string, SectionKind> = {
	start_of_chorus: 'chorus',
	start_of_verse: 'verse',
	start_of_bridge: 'bridge',
	start_of_tab: 'tab',
	start_of_grid: 'grid'
};

const DEFAULT_SECTION_NAMES: Record<SectionKind, string> = {
	chorus: 'Chorus',
	verse: 'Verse',
	bridge: 'Bridge',
	tab: 'Tab',
	grid: 'Grid',
	other: 'Song'
};

function matchDirective(line: string): DirectiveMatch | null {
	const trimmed = line.trim();
	if (!(trimmed.startsWith('{') && trimmed.endsWith('}'))) return null;
	const inner = trimmed.slice(1, -1).trim();
	if (!inner) return null;
	const colon = inner.indexOf(':');
	const rawName = (colon === -1 ? inner : inner.slice(0, colon)).trim().toLowerCase();
	const arg = colon === -1 ? '' : inner.slice(colon + 1).trim();
	const name = DIRECTIVE_ALIAS[rawName] ?? rawName;
	return { name, arg };
}

const DEFINE_KEYWORDS = new Set([
	'frets',
	'fingers',
	'base-fret',
	'basefret',
	'add',
	'copy',
	'display'
]);

function parseChordDef(arg: string): ChordDef | null {
	// Examples from the spec:
	//   {define: Am base-fret 1 frets x 0 2 2 1 0}
	//   {define: C frets 0 3 2 0 1 0 fingers 0 3 2 0 1 0 base-fret 1}
	//   {define: Bb frets x 1 3 3 3 1 base-fret 1}
	// The first token is the chord name; remaining tokens are keyword-delimited groups.
	const tokens = arg.split(/\s+/).filter(Boolean);
	if (tokens.length < 2) return null;
	const name = tokens[0];
	let baseFret = 1;
	let frets: number[] | null = null;
	let fingers: number[] = [];
	const barres: number[] = [];

	let i = 1;
	while (i < tokens.length) {
		const key = tokens[i].toLowerCase();
		if (key === 'base-fret' || key === 'basefret') {
			const n = Number(tokens[i + 1]);
			if (Number.isFinite(n)) baseFret = n;
			i += 2;
		} else if (key === 'frets') {
			const out: number[] = [];
			let j = i + 1;
			while (j < tokens.length && !DEFINE_KEYWORDS.has(tokens[j].toLowerCase()) && out.length < 6) {
				out.push(tokens[j].toLowerCase() === 'x' ? -1 : Number(tokens[j]));
				j += 1;
			}
			frets = out;
			i = j;
		} else if (key === 'fingers') {
			const out: number[] = [];
			let j = i + 1;
			while (j < tokens.length && !DEFINE_KEYWORDS.has(tokens[j].toLowerCase()) && out.length < 6) {
				const v = tokens[j].toLowerCase();
				out.push(v === 'x' || v === '-' ? 0 : Number(tokens[j]));
				j += 1;
			}
			fingers = out;
			i = j;
		} else if (key === 'add' || key === 'copy' || key === 'display') {
			// skip: advanced / variant forms we don't render
			i += 2;
		} else {
			i += 1;
		}
	}

	if (!frets || frets.some((f) => !Number.isFinite(f))) return null;
	while (fingers.length < frets.length) fingers.push(0);

	// Derive barres: any fret value shared by two or more strings (relative to baseFret).
	const counts = new Map<number, number>();
	for (const f of frets) {
		if (f > 0) counts.set(f, (counts.get(f) ?? 0) + 1);
	}
	for (const [fret, count] of counts) {
		if (count >= 2) barres.push(fret);
	}

	return { name, baseFret, frets, fingers, barres };
}

function parseSimpleInt(raw: string): number | null {
	const n = Number(raw.replace(/[^\d.-]/g, ''));
	return Number.isFinite(n) ? n : null;
}

function hasSpecDirectives(lines: string[]): boolean {
	for (const raw of lines) {
		const d = matchDirective(raw);
		if (!d) continue;
		if (
			d.name === 'start_of_chorus' ||
			d.name === 'start_of_verse' ||
			d.name === 'start_of_bridge' ||
			d.name === 'start_of_tab' ||
			d.name === 'start_of_grid' ||
			d.name === 'title' ||
			d.name === 'artist' ||
			d.name === 'subtitle' ||
			d.name === 'key' ||
			d.name === 'tempo' ||
			d.name === 'time' ||
			d.name === 'capo' ||
			d.name === 'composer' ||
			d.name === 'lyricist' ||
			d.name === 'album' ||
			d.name === 'year' ||
			d.name === 'copyright' ||
			d.name === 'meta'
		) {
			return true;
		}
	}
	return false;
}

export function parseChordPro(text: string): ParsedChordPro {
	const result: ParsedChordPro = { sections: [] };
	const rawLines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
	const specMode = hasSpecDirectives(rawLines);

	let current: Section | null = null;
	let envKind: SectionKind | null = null;
	let sawBody = false;

	const openSection = (kind: SectionKind, label?: string): Section => {
		const sec: Section = {
			name: label?.trim() || DEFAULT_SECTION_NAMES[kind],
			kind,
			lines: []
		};
		result.sections.push(sec);
		return sec;
	};

	const ensureSection = (): Section => {
		if (current) return current;
		current = openSection('other', 'Song');
		return current;
	};

	const pushLine = (line: Line): void => {
		ensureSection().lines.push(line);
	};

	const setMeta = (key: string, value: string): void => {
		if (!result.meta) result.meta = {};
		result.meta[key] = value;
	};

	for (const raw of rawLines) {
		const line = raw.replace(/\s+$/, '');

		// In a tab environment, every non-directive line is verbatim.
		if (envKind === 'tab' || envKind === 'grid') {
			const d = matchDirective(line);
			if (d && (d.name === 'end_of_tab' || d.name === 'end_of_grid')) {
				current = null;
				envKind = null;
				continue;
			}
			const tabLine: TabLine = { type: 'tab', text: raw };
			pushLine(tabLine);
			continue;
		}

		if (!line.trim()) continue;

		const directive = matchDirective(line);
		if (directive) {
			sawBody = true;
			const { name, arg } = directive;

			// Metadata
			if (name === 'title') {
				result.title = arg;
				continue;
			}
			if (name === 'subtitle') {
				result.subtitle = arg;
				continue;
			}
			if (name === 'artist') {
				result.artist = arg;
				continue;
			}
			if (name === 'composer') {
				result.composer = arg;
				continue;
			}
			if (name === 'lyricist') {
				result.lyricist = arg;
				continue;
			}
			if (name === 'album') {
				result.album = arg;
				continue;
			}
			if (name === 'year') {
				const y = parseSimpleInt(arg);
				if (y !== null) result.year = y;
				continue;
			}
			if (name === 'copyright') {
				result.copyright = arg;
				continue;
			}
			if (name === 'key') {
				result.key = arg || null;
				continue;
			}
			if (name === 'time') {
				result.time_signature = arg;
				continue;
			}
			if (name === 'tempo') {
				const n = parseSimpleInt(arg);
				result.bpm = n;
				continue;
			}
			if (name === 'capo') {
				const n = parseSimpleInt(arg);
				if (n !== null) result.capo = n;
				continue;
			}
			if (name === 'duration') {
				result.duration = arg;
				continue;
			}
			if (name === 'meta') {
				const sp = arg.indexOf(' ');
				if (sp > 0) setMeta(arg.slice(0, sp).trim(), arg.slice(sp + 1).trim());
				continue;
			}

			// Chord definitions
			if (name === 'define' || name === 'chord') {
				const def = parseChordDef(arg);
				if (def) {
					if (!result.chord_defs) result.chord_defs = [];
					result.chord_defs.push(def);
				}
				continue;
			}

			// Section environments
			const startKind = SECTION_START_KINDS[name];
			if (startKind) {
				current = openSection(startKind, arg);
				envKind = startKind === 'tab' || startKind === 'grid' ? startKind : null;
				continue;
			}
			if (
				name === 'end_of_chorus' ||
				name === 'end_of_verse' ||
				name === 'end_of_bridge' ||
				name === 'end_of_tab' ||
				name === 'end_of_grid'
			) {
				current = null;
				envKind = null;
				continue;
			}

			// Inline comment variants
			if (name === 'comment' || name === 'highlight') {
				pushLine({ type: 'comment', text: arg, style: 'plain' } satisfies CommentLine);
				continue;
			}
			if (name === 'comment_italic') {
				pushLine({ type: 'comment', text: arg, style: 'italic' } satisfies CommentLine);
				continue;
			}
			if (name === 'comment_box') {
				pushLine({ type: 'comment', text: arg, style: 'box' } satisfies CommentLine);
				continue;
			}

			// Chorus reference (repeats previously defined chorus). If it appears outside
			// any open section (between verses, etc.), attach it to the most recent section
			// rather than spinning up a phantom one.
			if (name === 'chorus') {
				const ref: Line = { type: 'chorus_ref', label: arg || undefined };
				if (current) {
					current.lines.push(ref);
				} else if (result.sections.length > 0) {
					result.sections[result.sections.length - 1].lines.push(ref);
				} else {
					pushLine(ref);
				}
				continue;
			}

			// Page/column breaks and unknown directives: silently ignore.
			continue;
		}

		// Legacy header lines: TITLE:, ARTIST:, KEY:, BPM:, TIME/TIME_SIGNATURE:, CAPO:
		// Only honoured before any body content.
		if (!sawBody) {
			const header = line.match(/^([A-Z_]+):\s*(.+)$/);
			if (header) {
				const k = header[1];
				const v = header[2].trim();
				if (k === 'TITLE') {
					result.title = v;
					continue;
				}
				if (k === 'ARTIST') {
					result.artist = v;
					continue;
				}
				if (k === 'KEY') {
					result.key = v || null;
					continue;
				}
				if (k === 'BPM') {
					const n = Number(v);
					result.bpm = Number.isFinite(n) ? n : null;
					continue;
				}
				if (k === 'TIME' || k === 'TIME_SIGNATURE') {
					result.time_signature = v;
					continue;
				}
				if (k === 'CAPO') {
					const n = parseSimpleInt(v);
					if (n !== null) result.capo = n;
					continue;
				}
			}
		}

		// Section header via legacy `# Name`, only honoured when the file has no spec
		// directives at all. With spec directives present, `#` lines are comments (ignored).
		if (/^#+/.test(line)) {
			if (specMode) continue;
			const m = line.match(/^#+\s*(.+)$/);
			if (m) {
				const label = m[1].trim();
				const kind = inferKindFromLabel(label);
				current = openSection(kind, label);
				envKind = null;
				sawBody = true;
				continue;
			}
			continue;
		}

		sawBody = true;
		pushLine(parseChordProLine(line));
	}

	return result;
}

function inferKindFromLabel(label: string): SectionKind {
	const l = label.toLowerCase();
	if (l.startsWith('chorus')) return 'chorus';
	if (l.startsWith('verse')) return 'verse';
	if (l.startsWith('bridge')) return 'bridge';
	if (l.startsWith('tab') || l.startsWith('solo')) return 'other';
	return 'other';
}

const SECTION_ENV_DIRECTIVES: Record<Exclude<SectionKind, 'other'>, { start: string; end: string; default: string }> = {
	chorus: { start: 'start_of_chorus', end: 'end_of_chorus', default: 'Chorus' },
	verse: { start: 'start_of_verse', end: 'end_of_verse', default: 'Verse' },
	bridge: { start: 'start_of_bridge', end: 'end_of_bridge', default: 'Bridge' },
	tab: { start: 'start_of_tab', end: 'end_of_tab', default: 'Tab' },
	grid: { start: 'start_of_grid', end: 'end_of_grid', default: 'Grid' }
};

function reconstructLyricLine(line: LyricLine): string {
	if (line.chords.length === 0) return line.lyric;
	const chordsByPos = new Map<number, string[]>();
	let lastPos = 0;
	for (const c of line.chords) {
		const arr = chordsByPos.get(c.pos) ?? [];
		arr.push(c.chord);
		chordsByPos.set(c.pos, arr);
		if (c.pos > lastPos) lastPos = c.pos;
	}
	const totalCols = Math.max(line.lyric.length, lastPos);
	let out = '';
	for (let i = 0; i <= totalCols; i++) {
		const at = chordsByPos.get(i);
		if (at) for (const ch of at) out += `[${ch}]`;
		if (i < line.lyric.length) out += line.lyric[i];
		else if (i < totalCols) out += ' ';
	}
	return out;
}

function reconstructLine(line: Line): string {
	if (isLyricLine(line)) return reconstructLyricLine(line);
	if (line.type === 'comment') {
		const dir = line.style === 'italic' ? 'comment_italic' : line.style === 'box' ? 'comment_box' : 'comment';
		return `{${dir}: ${line.text}}`;
	}
	if (line.type === 'tab') return line.text;
	if (line.type === 'chorus_ref') return line.label ? `{chorus: ${line.label}}` : '{chorus}';
	return '';
}

export function reconstructChordPro(song: Song): string {
	const out: string[] = [];
	const push = (s: string) => out.push(s);

	if (song.title) push(`{title: ${song.title}}`);
	if (song.artist) push(`{artist: ${song.artist}}`);
	if (song.subtitle) push(`{subtitle: ${song.subtitle}}`);
	if (song.composer) push(`{composer: ${song.composer}}`);
	if (song.lyricist) push(`{lyricist: ${song.lyricist}}`);
	if (song.album) push(`{album: ${song.album}}`);
	if (song.year !== undefined) push(`{year: ${song.year}}`);
	if (song.copyright) push(`{copyright: ${song.copyright}}`);
	if (song.key) push(`{key: ${song.key}}`);
	if (song.bpm !== null && song.bpm !== undefined) push(`{tempo: ${song.bpm}}`);
	if (song.time_signature) push(`{time: ${song.time_signature}}`);
	if (song.capo) push(`{capo: ${song.capo}}`);
	if (song.duration) push(`{duration: ${song.duration}}`);
	if (song.meta) {
		for (const [k, v] of Object.entries(song.meta)) push(`{meta: ${k} ${v}}`);
	}
	if (song.chord_defs) {
		for (const def of song.chord_defs) {
			const frets = def.frets.map((f) => (f === -1 ? 'x' : String(f))).join(' ');
			const fingers = def.fingers.map((f) => (f === 0 ? '-' : String(f))).join(' ');
			push(`{define: ${def.name} base-fret ${def.baseFret} frets ${frets} fingers ${fingers}}`);
		}
	}
	if (out.length > 0) push('');

	for (const section of song.sections) {
		const kind: SectionKind = section.kind ?? 'other';
		if (kind === 'other') {
			if (section.name && section.name !== 'Song') {
				push(`{comment_box: ${section.name}}`);
			}
			for (const ln of section.lines) push(reconstructLine(ln));
			push('');
			continue;
		}
		const env = SECTION_ENV_DIRECTIVES[kind];
		const labelArg = section.name && section.name !== env.default ? `: ${section.name}` : '';
		push(`{${env.start}${labelArg}}`);
		for (const ln of section.lines) push(reconstructLine(ln));
		push(`{${env.end}}`);
		push('');
	}

	return out.join('\n').replace(/\n+$/, '') + '\n';
}

// Best-effort copy of duration_beats from old → new lyric lines, by index across the
// flattened lyric stream. Only applied when counts and lyric strings match exactly,
// so re-tap-sync may be needed after structural edits.
export function preserveDurations(parsed: ParsedChordPro, oldSong: Song): void {
	const oldFlat: LyricLine[] = [];
	for (const s of oldSong.sections) for (const l of s.lines) if (isLyricLine(l)) oldFlat.push(l);
	const newFlat: LyricLine[] = [];
	for (const s of parsed.sections) for (const l of s.lines) if (isLyricLine(l)) newFlat.push(l);
	if (oldFlat.length !== newFlat.length) return;
	for (let i = 0; i < newFlat.length; i++) {
		const oldDur = oldFlat[i].duration_beats;
		if (oldDur !== undefined && newFlat[i].lyric === oldFlat[i].lyric) {
			newFlat[i].duration_beats = oldDur;
		}
	}
}
