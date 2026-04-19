import type { SongCandidate } from '$lib/types';

export type FetchedSong = {
	chordpro: string;
	sourceUrl?: string;
};

export interface SongSourcePlugin {
	findCandidates?(query: string): Promise<SongCandidate[]>;
	fetchSong(title: string, artist: string): Promise<FetchedSong>;
}

export type SourceCapabilities = {
	available: boolean;
	supportsCandidates: boolean;
	error?: string;
};
