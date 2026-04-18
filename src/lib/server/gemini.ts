import { GoogleGenAI, Type } from '@google/genai';
import { env } from '$env/dynamic/private';
import type { Song, SongCandidate } from '$lib/types';
import { parseChordPro } from '$lib/chordpro';

const MODEL = env.GEMINI_MODEL || 'gemini-2.5-flash';

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

export async function fetchSong(
	title: string,
	artist: string
): Promise<Omit<Song, 'id' | 'created_at' | 'last_played_at'>> {
	const ai = client();

	const prompt = `Find chords and lyrics for "${title}" by ${artist}.
Search tab/chord sites (Ultimate Guitar, e-chords, Chordie, azchords, etc.) and return the best chord chart.

Output format (STRICT):
- First, these header lines (one per line):
  TITLE: <song title>
  ARTIST: <artist>
  KEY: <key or blank>
  BPM: <tempo number or blank>
  TIME: <time signature, e.g. 4/4>
- Then blank line.
- Then sections. Each section starts with a header line: "# Section Name" (e.g. "# Verse 1", "# Chorus", "# Bridge", "# Outro").
- Each song line uses INLINE chord markers placed exactly where the chord change happens in the lyric:
  [D]Words are flowing [F#m]out like [Em]endless rain into a paper cup
- For intro/instrumental lines with no lyrics, space the chord markers out for readability:
  [D]    [F#m]    [Em]    [A]
- Use sharps (C#, F#) not flats where possible.
- DO NOT output a separate chord line above lyrics. DO NOT use (brackets) or <angles>. ONLY square brackets inline with lyrics.
- DO NOT wrap the output in code fences or markdown. Output raw text only.

Example:
TITLE: Let It Be
ARTIST: The Beatles
KEY: C
BPM: 72
TIME: 4/4

# Verse 1
[C]When I find myself in [G]times of trouble
[Am]Mother Mary [F]comes to me
[C]Speaking words of [G]wisdom, let it [F]be [C]

# Chorus
[Am]Let it [G]be, let it [F]be, let it [C]be, let it [G]be
`;

	const res = await ai.models.generateContent({
		model: MODEL,
		contents: prompt,
		config: {
			tools: [{ googleSearch: {} }]
		}
	});

	const text = (res.text ?? '').trim();
	if (!text) throw new Error('empty response from Gemini');

	// Strip accidental code fences
	const cleaned = text
		.replace(/^```[a-zA-Z]*\n?/, '')
		.replace(/\n?```$/, '')
		.trim();

	const parsed = parseChordPro(cleaned);

	const sources: string[] = [];
	const groundingChunks = res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
	for (const chunk of groundingChunks) {
		const uri = (chunk as { web?: { uri?: string } }).web?.uri;
		if (uri) sources.push(uri);
	}

	if (parsed.sections.length === 0) {
		throw new Error('could not parse chord chart from response');
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
			url: sources[0],
			fetched_at: new Date().toISOString()
		},
		user_edits: null
	};
}
