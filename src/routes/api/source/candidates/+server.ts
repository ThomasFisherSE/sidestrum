import { json, type RequestHandler } from '@sveltejs/kit';
import { getSource } from '$lib/server/source';

export const POST: RequestHandler = async ({ request }) => {
	const source = await getSource();
	if (!source || !source.findCandidates) {
		return json({ error: 'no source plugin configured for candidates' }, { status: 404 });
	}

	const { query } = (await request.json()) as { query: string };
	if (!query?.trim()) {
		return json({ error: 'query required' }, { status: 400 });
	}

	try {
		const candidates = await source.findCandidates(query.trim());
		return json({ candidates });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'candidates failed';
		return json({ error: message }, { status: 500 });
	}
};
