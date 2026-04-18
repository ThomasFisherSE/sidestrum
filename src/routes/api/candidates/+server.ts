import { json, type RequestHandler } from '@sveltejs/kit';
import { findCandidates } from '$lib/server/gemini';

export const POST: RequestHandler = async ({ request }) => {
	const { query } = (await request.json()) as { query: string };
	if (!query?.trim()) return json({ candidates: [] });
	try {
		const candidates = await findCandidates(query.trim());
		return json({ candidates });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'unknown error';
		return json({ error: message }, { status: 500 });
	}
};
