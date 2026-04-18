import { json, type RequestHandler } from '@sveltejs/kit';
import { fetchSong } from '$lib/server/gemini';
import { findByTitleArtist, saveSong } from '$lib/server/db';

export const POST: RequestHandler = async ({ request }) => {
	const { title, artist } = (await request.json()) as { title: string; artist: string };
	if (!title?.trim() || !artist?.trim()) {
		return json({ error: 'title and artist required' }, { status: 400 });
	}

	const existing = findByTitleArtist(title, artist);
	if (existing) return json({ song: existing, cached: true });

	try {
		const fetched = await fetchSong(title.trim(), artist.trim());
		const saved = saveSong(fetched);
		return json({ song: saved, cached: false });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'unknown error';
		return json({ error: message }, { status: 500 });
	}
};
