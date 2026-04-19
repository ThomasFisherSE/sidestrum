import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getSong, touchPlayed, updateSong } from '$lib/server/db';
import type { Song } from '$lib/types';

export const GET: RequestHandler = async ({ params }) => {
	const song = getSong(params.id!);
	if (!song) throw error(404, 'song not found');
	touchPlayed(song.id);
	return json({ song });
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const existing = getSong(params.id!);
	if (!existing) throw error(404, 'song not found');
	const patch = (await request.json()) as Partial<Song>;
	const updated: Song = { ...existing, ...patch, id: existing.id, created_at: existing.created_at };
	updateSong(existing.id, updated);
	return json({ song: updated });
};
