import { listSongs } from '$lib/server/db';
import { sourceCapabilities } from '$lib/server/source';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return {
		songs: listSongs(),
		source: await sourceCapabilities()
	};
};
