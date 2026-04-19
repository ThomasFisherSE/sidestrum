import { GoogleGenAI, Type } from '@google/genai';
import { env } from '$env/dynamic/private';
import type { Song, SongCandidate } from '$lib/types';
import { parseChordPro } from '$lib/chordpro';

const MODEL = env.GEMINI_MODEL || 'gemini-2.5-flash';

export class ChordsNotFoundError extends Error {
	constructor(
		message: string,
		public detail?: { url?: string; triedUrls?: string[] }
	) {
		super(message);
		this.name = 'ChordsNotFoundError';
	}
}

function client() {
	const key = env.GEMINI_API_KEY;
	if (!key) throw new Error('GEMINI_API_KEY not set — add it to .env');
	return new GoogleGenAI({ apiKey: key });
}

export async function findCandidates(query: string): Promise<SongCandidate[]> {
	const ai = client();
	const res = await ai.models.generateContent({
		model: MODEL,
		contents: `A user searched for "${query}" in a chord/lyrics app.
List up to 5 distinct recordings that could match. Include original and notable covers.
Return ONLY a JSON array, no prose. Shape: [{"title": "...", "artist": "...", "year": 1968, "note": "original"}, ...]`,
		config: {
			responseMimeType: 'application/json',
			responseSchema: {
				type: Type.ARRAY,
				items: {
					type: Type.OBJECT,
					properties: {
						title: { type: Type.STRING },
						artist: { type: Type.STRING },
						year: { type: Type.INTEGER },
						note: { type: Type.STRING }
					},
					required: ['title', 'artist']
				}
			}
		}
	});
	const text = res.text ?? '[]';
	try {
		return JSON.parse(text) as SongCandidate[];
	} catch {
		return [];
	}
}

// Domains that actually host chord charts (not lyrics-only, video, or forum).
const CHORD_DOMAINS = [
	'ultimate-guitar.com',
	'e-chords.com',
	'chordie.com',
	'azchords.com',
	'lacuerda.net',
	'chordu.com',
	'chordify.net',
	'guitartabs.cc',
	'tabs4acoustic.com',
	'songsterr.com'
];

function isKnownChordDomain(url: string): boolean {
	try {
		const u = new URL(url);
		const host = u.hostname.toLowerCase();
		return CHORD_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
	} catch {
		return false;
	}
}

async function findChordUrls(title: string, artist: string): Promise<string[]> {
	const ai = client();
	const prompt = `Use Google Search to find chord chart pages for "${title}" by ${artist}.
Requirements:
- Pages must show the actual chord chart (chords above lyrics, or inline chord markers).
- Prefer: Ultimate Guitar, e-chords, Chordie, AZChords, LaCuerda, Songsterr (chords tab).
- Reject: lyrics-only pages, YouTube/Spotify/Wikipedia, forum threads, videos, listings.

Respond with ONLY a JSON object (no prose, no code fences). Shape:
{"urls": ["<best url>", "<2nd best>", "<3rd best>"]}
Return an empty array if no suitable page exists: {"urls": []}
Only include direct URLs to chord chart pages you found via search.`;

	let text = '';
	try {
		const res = await ai.models.generateContent({
			model: MODEL,
			contents: prompt,
			config: {
				tools: [{ googleSearch: {} }]
			}
		});
		text = (res.text ?? '').trim();
	} catch {
		return [];
	}

	const cleaned = text
		.replace(/^```[a-zA-Z]*\n?/, '')
		.replace(/\n?```$/, '')
		.trim();
	const match = cleaned.match(/\{[\s\S]*\}/);
	if (!match) return [];

	try {
		const parsed = JSON.parse(match[0]) as { urls?: unknown };
		if (!Array.isArray(parsed.urls)) return [];
		const urls: string[] = [];
		for (const raw of parsed.urls) {
			if (typeof raw !== 'string') continue;
			try {
				const u = new URL(raw);
				if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
				urls.push(u.toString());
			} catch {
				// skip invalid
			}
		}
		// Prefer known chord domains first, but keep others as fallbacks
		urls.sort((a, b) => Number(isKnownChordDomain(b)) - Number(isKnownChordDomain(a)));
		return urls.slice(0, 3);
	} catch {
		return [];
	}
}

async function fetchPage(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'Accept-Language': 'en-US,en;q=0.9'
		},
		signal: AbortSignal.timeout(20_000),
		redirect: 'follow'
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return await res.text();
}

function stripHtmlForLlm(html: string): string {
	let out = html
		.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
		.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
		.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, '')
		.replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, '');
	out = out.replace(/\n{3,}/g, '\n\n');
	const MAX_CHARS = 150_000;
	if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS);
	return out;
}

async function extractChordPro(
	html: string,
	title: string,
	artist: string,
	sourceUrl: string
): Promise<string | null> {
	const ai = client();
	const stripped = stripHtmlForLlm(html);

	const prompt = `I fetched the HTML below from ${sourceUrl}, looking for a chord chart for "${title}" by ${artist}.

Task: transcribe the chord chart from this page into ChordPro format.

CRITICAL RULES — DO NOT VIOLATE:
- Use ONLY chords and lyrics that appear in the provided HTML. Do not fill in from memory.
- Do not invent or guess chords for sections that are not in the page.
- Some chord sites store the chart inside a script JSON blob, a <pre> block, or a div with "data-content". Look in all of these.
- If the page does NOT contain a chord chart for this specific song (wrong song, lyrics-only, search/listing page, paywall, captcha, error page, empty), respond with exactly one line:
  NOT_FOUND: <brief reason>
- If the page is for the right song but partial, transcribe what is there.

Output format (when a chord chart IS found):
TITLE: <song title>
ARTIST: <artist>
KEY: <key, or blank>
BPM: <tempo number, or blank>
TIME: <time signature e.g. 4/4, or blank>

# Section Name
[C]Inline [G]chord [Am]markers [F]placed where the change happens in the lyric

Formatting rules:
- Inline square-bracket chord markers, placed at the character where the chord changes.
- Use sharps (C#, F#) not flats where reasonable.
- Instrumental lines: space the chord markers for readability, e.g. "[D]    [G]    [A]".
- Do NOT output a separate chord line above lyrics.
- Do NOT wrap the output in code fences or markdown.
- Section headers start with "# " (e.g. "# Verse 1", "# Chorus", "# Bridge").

HTML:
${stripped}`;

	const res = await ai.models.generateContent({
		model: MODEL,
		contents: prompt
	});

	const text = (res.text ?? '').trim();
	const cleaned = text
		.replace(/^```[a-zA-Z]*\n?/, '')
		.replace(/\n?```$/, '')
		.trim();

	if (!cleaned) return null;
	if (/^NOT[_\s-]?FOUND\b/i.test(cleaned)) return null;
	return cleaned;
}

export async function fetchSong(
	title: string,
	artist: string
): Promise<Omit<Song, 'id' | 'created_at' | 'last_played_at'>> {
	const urls = await findChordUrls(title, artist);
	if (urls.length === 0) {
		throw new ChordsNotFoundError(
			`Couldn't find a chord chart for "${title}" by ${artist} on any known chord site.`
		);
	}

	const tried: string[] = [];
	let lastReason = '';

	for (const url of urls) {
		tried.push(url);
		let html: string;
		try {
			html = await fetchPage(url);
		} catch (e) {
			lastReason = `fetch ${new URL(url).hostname}: ${e instanceof Error ? e.message : String(e)}`;
			continue;
		}

		let chordpro: string | null;
		try {
			chordpro = await extractChordPro(html, title, artist, url);
		} catch (e) {
			lastReason = `extract ${new URL(url).hostname}: ${e instanceof Error ? e.message : String(e)}`;
			continue;
		}
		if (!chordpro) {
			lastReason = `${new URL(url).hostname} did not contain a chord chart for this song`;
			continue;
		}

		const parsed = parseChordPro(chordpro);
		if (parsed.sections.length === 0) {
			lastReason = `couldn't parse chord chart from ${new URL(url).hostname}`;
			continue;
		}

		return {
			title: parsed.title ?? title,
			artist: parsed.artist ?? artist,
			key: parsed.key ?? null,
			bpm: parsed.bpm ?? null,
			time_signature: parsed.time_signature ?? '4/4',
			capo: 0,
			sections: parsed.sections,
			source: {
				type: 'web_search',
				url,
				fetched_at: new Date().toISOString()
			},
			user_edits: null
		};
	}

	throw new ChordsNotFoundError(
		`Couldn't extract chords for "${title}" by ${artist} from any source. ${lastReason}`,
		{ triedUrls: tried }
	);
}
