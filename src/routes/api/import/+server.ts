import { json, type RequestHandler } from '@sveltejs/kit';
import { parseChordPro } from '$lib/chordpro';
import { saveSong } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
	const { chordpro, filename } = (await request.json()) as {
		chordpro: string;
		filename?: string;
	};
	if (!chordpro?.trim()) {
		return json({ error: 'empty chordpro' }, { status: 400 });
	}

	const parsed = parseChordPro(chordpro);
	if (parsed.sections.length === 0) {
		return json({ error: 'no chord content found; check the ChordPro formatting' }, { status: 400 });
	}

	const saved = saveSong({
		title: parsed.title ?? (filename ? filename.replace(/\.[^.]+$/, '') : 'Untitled'),
		artist: parsed.artist ?? 'Unknown',
		subtitle: parsed.subtitle,
		composer: parsed.composer,
		lyricist: parsed.lyricist,
		album: parsed.album,
		year: parsed.year,
		copyright: parsed.copyright,
		key: parsed.key ?? null,
		bpm: parsed.bpm ?? null,
		time_signature: parsed.time_signature ?? '4/4',
		capo: parsed.capo ?? 0,
		duration: parsed.duration,
		meta: parsed.meta,
		sections: parsed.sections,
		chord_defs: parsed.chord_defs,
		source: {
			type: filename ? 'import' : 'paste',
			filename,
			imported_at: new Date().toISOString()
		},
		user_edits: null
	});
	return json({ song: saved });
};
