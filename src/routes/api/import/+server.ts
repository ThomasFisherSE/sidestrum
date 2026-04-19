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
		key: parsed.key ?? null,
		bpm: parsed.bpm ?? null,
		time_signature: parsed.time_signature ?? '4/4',
		capo: 0,
		sections: parsed.sections,
		source: {
			type: filename ? 'import' : 'paste',
			filename,
			imported_at: new Date().toISOString()
		},
		user_edits: null
	});
	return json({ song: saved });
};
