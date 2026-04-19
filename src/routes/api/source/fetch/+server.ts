import { json, type RequestHandler } from '@sveltejs/kit';
import { getSource } from '$lib/server/source';

export const POST: RequestHandler = async ({ request }) => {
	const source = await getSource();
	if (!source) {
		return json({ error: 'no source plugin configured' }, { status: 404 });
	}

	const { title, artist } = (await request.json()) as { title: string; artist: string };
	if (!title?.trim() || !artist?.trim()) {
		return json({ error: 'title and artist required' }, { status: 400 });
	}

	try {
		const fetched = await source.fetchSong(title.trim(), artist.trim());
		if (!fetched?.chordpro?.trim()) {
			return json({ error: 'plugin returned empty chordpro' }, { status: 502 });
		}
		return json({
			chordpro: fetched.chordpro,
			sourceUrl: fetched.sourceUrl,
			title: title.trim(),
			artist: artist.trim()
		});
	} catch (e) {
		const message = e instanceof Error ? e.message : 'fetch failed';
		return json({ error: message }, { status: 502 });
	}
};
