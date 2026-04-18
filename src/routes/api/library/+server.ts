import { json, type RequestHandler } from '@sveltejs/kit';
import { listSongs, deleteSong } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	return json({ songs: listSongs() });
};

export const DELETE: RequestHandler = async ({ request }) => {
	const { id } = (await request.json()) as { id: string };
	deleteSong(id);
	return json({ ok: true });
};
