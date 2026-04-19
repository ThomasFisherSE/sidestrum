import { json, type RequestHandler } from '@sveltejs/kit';
import { getSource } from '$lib/server/source';
import { parseChordPro } from '$lib/chordpro';
import { saveSong } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
	const source = await getSource();
	if (!source) {
		return json({ error: 'no source plugin configured' }, { status: 404 });
	}

	const { title, artist } = (await request.json()) as { title: string; artist: string };
	if (!title?.trim() || !artist?.trim()) {
		return json({ error: 'title and artist required' }, { status: 400 });
	}

	let fetched;
	try {
		fetched = await source.fetchSong(title.trim(), artist.trim());
	} catch (e) {
		const message = e instanceof Error ? e.message : 'fetch failed';
		return json({ error: message }, { status: 502 });
	}

	if (!fetched?.chordpro?.trim()) {
		return json({ error: 'plugin returned empty chordpro' }, { status: 502 });
	}

	const parsed = parseChordPro(fetched.chordpro);
	if (parsed.sections.length === 0) {
		return json({ error: 'plugin returned chordpro with no sections' }, { status: 502 });
	}

	const saved = saveSong({
		title: parsed.title ?? title,
		artist: parsed.artist ?? artist,
		key: parsed.key ?? null,
		bpm: parsed.bpm ?? null,
		time_signature: parsed.time_signature ?? '4/4',
		capo: 0,
		sections: parsed.sections,
		source: {
			type: 'plugin',
			sourceUrl: fetched.sourceUrl,
			imported_at: new Date().toISOString()
		},
		user_edits: null
	});
	return json({ song: saved });
};
