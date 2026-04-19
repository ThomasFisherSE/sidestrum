import { error } from '@sveltejs/kit';
import { getSong, touchPlayed } from '$lib/server/db';
import { sourceCapabilities } from '$lib/server/source';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const song = getSong(params.id);
	if (!song) throw error(404, 'song not found');
	touchPlayed(song.id);
	return { song, source: await sourceCapabilities() };
};
