import { env } from '$env/dynamic/private';
import { pathToFileURL } from 'node:url';
import { isAbsolute, resolve } from 'node:path';
import type { SongSourcePlugin, SourceCapabilities } from './source-types';

type LoadResult =
	| { ok: true; plugin: SongSourcePlugin }
	| { ok: false; error?: string };

let cached: LoadResult | undefined;

function resolveSpecifier(raw: string): string {
	if (/^[a-z]+:\/\//i.test(raw)) return raw;
	const abs = isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
	return pathToFileURL(abs).href;
}

async function load(): Promise<LoadResult> {
	if (cached) return cached;
	const path = env.SIDESTRUM_SOURCE;
	if (!path) return (cached = { ok: false });

	try {
		const specifier = resolveSpecifier(path);
		const mod = await import(/* @vite-ignore */ specifier);
		const plugin = (mod.default ?? mod) as SongSourcePlugin;
		if (typeof plugin.fetchSong !== 'function') {
			return (cached = {
				ok: false,
				error: 'plugin module must export a fetchSong function'
			});
		}
		return (cached = { ok: true, plugin });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error('[sidestrum] failed to load SIDESTRUM_SOURCE:', msg);
		return (cached = { ok: false, error: msg });
	}
}

export async function getSource(): Promise<SongSourcePlugin | null> {
	const r = await load();
	return r.ok ? r.plugin : null;
}

export async function sourceCapabilities(): Promise<SourceCapabilities> {
	const r = await load();
	if (!r.ok) {
		return { available: false, supportsCandidates: false, error: r.error };
	}
	return {
		available: true,
		supportsCandidates: typeof r.plugin.findCandidates === 'function'
	};
}
