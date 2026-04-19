<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import type { SongCandidate } from '$lib/types';

	let { data }: { data: PageData } = $props();

	let chordpro = $state('');
	let filename = $state<string | undefined>(undefined);
	let importing = $state(false);
	let error = $state<string | null>(null);
	let dragging = $state(false);

	let query = $state('');
	let searching = $state(false);
	let candidates = $state<SongCandidate[] | null>(null);
	let fetchingIdx = $state<number | null>(null);

	let directTitle = $state('');
	let directArtist = $state('');
	let directFetching = $state(false);

	async function importText() {
		if (!chordpro.trim()) return;
		error = null;
		importing = true;
		try {
			const res = await fetch('/api/import', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ chordpro, filename })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? 'import failed');
			goto(`/song/${body.song.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'import failed';
			importing = false;
		}
	}

	async function handleFile(ev: Event) {
		const input = ev.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		chordpro = await file.text();
		filename = file.name;
	}

	async function handleDrop(ev: DragEvent) {
		ev.preventDefault();
		dragging = false;
		const file = ev.dataTransfer?.files?.[0];
		if (!file) return;
		chordpro = await file.text();
		filename = file.name;
	}

	async function search() {
		if (!query.trim()) return;
		error = null;
		searching = true;
		candidates = null;
		try {
			const res = await fetch('/api/source/candidates', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? 'search failed');
			candidates = body.candidates;
			if (body.candidates.length === 0) error = 'no matches found';
		} catch (e) {
			error = e instanceof Error ? e.message : 'search failed';
		} finally {
			searching = false;
		}
	}

	async function pickCandidate(c: SongCandidate, idx: number) {
		fetchingIdx = idx;
		error = null;
		try {
			const res = await fetch('/api/source/fetch', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: c.title, artist: c.artist })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? 'fetch failed');
			goto(`/song/${body.song.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'fetch failed';
			fetchingIdx = null;
		}
	}

	async function directFetch() {
		if (!directTitle.trim() || !directArtist.trim()) return;
		error = null;
		directFetching = true;
		try {
			const res = await fetch('/api/source/fetch', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: directTitle, artist: directArtist })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? 'fetch failed');
			goto(`/song/${body.song.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'fetch failed';
			directFetching = false;
		}
	}

	function closeOverlay() {
		candidates = null;
		error = null;
	}

	async function removeSong(id: string, ev: MouseEvent) {
		ev.preventDefault();
		ev.stopPropagation();
		if (!confirm('Delete this song?')) return;
		await fetch('/api/library', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id })
		});
		location.reload();
	}
</script>

<main>
	<header>
		<h1>sidestrum</h1>
		<p class="tagline">chords & lyrics, played in time</p>
	</header>

	{#if data.source.error}
		<div class="warn">Source plugin failed to load: {data.source.error}</div>
	{/if}

	{#if data.source.available && data.source.supportsCandidates}
		<form class="search" onsubmit={(e) => { e.preventDefault(); search(); }}>
			<input
				type="search"
				placeholder="Search via plugin..."
				bind:value={query}
				disabled={searching}
			/>
			<button type="submit" class="primary" disabled={searching || !query.trim()}>
				{searching ? 'Searching...' : 'Search'}
			</button>
		</form>
	{:else if data.source.available}
		<form class="direct" onsubmit={(e) => { e.preventDefault(); directFetch(); }}>
			<input placeholder="Title" bind:value={directTitle} disabled={directFetching} />
			<input placeholder="Artist" bind:value={directArtist} disabled={directFetching} />
			<button type="submit" class="primary" disabled={directFetching || !directTitle.trim() || !directArtist.trim()}>
				{directFetching ? 'Fetching...' : 'Fetch'}
			</button>
		</form>
	{/if}

	{#if data.source.available}
		<div class="sep"><span>or paste your own</span></div>
	{/if}

	<form class="entry" onsubmit={(e) => { e.preventDefault(); importText(); }}>
		<textarea
			class:dragging
			bind:value={chordpro}
			placeholder={'Paste ChordPro here, or drop a .cho file...\n\nTITLE: Example\nARTIST: You\nKEY: C\n\n# Verse\n[C]Hello [G]world, [Am]here\'s a [F]song'}
			rows="10"
			ondrop={handleDrop}
			ondragover={(e) => { e.preventDefault(); dragging = true; }}
			ondragleave={() => dragging = false}
		></textarea>
		<div class="row">
			<label class="file-btn">
				<input type="file" accept=".cho,.chordpro,.pro,.txt" onchange={handleFile} />
				<span>Choose file...</span>
			</label>
			{#if filename}
				<span class="filename">{filename}</span>
			{/if}
			<button type="submit" class="primary" disabled={!chordpro.trim() || importing}>
				{importing ? 'Importing...' : 'Add to library'}
			</button>
		</div>
	</form>

	{#if error}
		<div class="error">{error}</div>
	{/if}

	<section class="library">
		<h2>Library <span class="count">{data.songs.length}</span></h2>
		{#if data.songs.length === 0}
			<p class="empty">No songs yet. Paste or import one above.</p>
		{:else}
			<ul>
				{#each data.songs as song (song.id)}
					<li>
						<a href="/song/{song.id}">
							<div class="title">{song.title}</div>
							<div class="meta">
								<span class="artist">{song.artist}</span>
								{#if song.key}<span class="pill">{song.key}</span>{/if}
								{#if song.bpm}<span class="pill">{song.bpm} bpm</span>{/if}
							</div>
						</a>
						<button class="ghost del" onclick={(e) => removeSong(song.id, e)} title="Delete">×</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if candidates}
		<div
			class="overlay"
			onclick={closeOverlay}
			onkeydown={(e) => e.key === 'Escape' && closeOverlay()}
			role="presentation"
		>
			<div
				class="modal"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
				role="dialog"
				aria-modal="true"
				tabindex="-1"
			>
				<h3>Pick a recording</h3>
				<ul class="cands">
					{#each candidates as c, i (i)}
						<li>
							<button
								class="cand"
								onclick={() => pickCandidate(c, i)}
								disabled={fetchingIdx !== null}
							>
								<div class="cand-title">{c.title}</div>
								<div class="cand-meta">
									<span>{c.artist}</span>
									{#if c.year}<span class="pill">{c.year}</span>{/if}
									{#if c.note}<span class="note">{c.note}</span>{/if}
								</div>
								{#if fetchingIdx === i}
									<span class="loading">Fetching...</span>
								{/if}
							</button>
						</li>
					{/each}
				</ul>
				<button class="ghost" onclick={closeOverlay} disabled={fetchingIdx !== null}>Cancel</button>
			</div>
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 720px;
		margin: 0 auto;
		padding: 3rem 1.5rem 6rem;
	}
	header { margin-bottom: 2.5rem; }
	h1 {
		font-size: 2.2rem;
		margin: 0;
		letter-spacing: -0.02em;
	}
	.tagline {
		color: var(--muted);
		margin: 0.25rem 0 0;
		font-size: 0.95rem;
	}
	.search, .direct {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.search input, .direct input { flex: 1; }
	.sep {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		color: var(--muted);
		font-size: 0.8rem;
		margin: 1rem 0;
	}
	.sep::before, .sep::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.entry {
		display: grid;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}
	textarea {
		width: 100%;
		font-family: var(--mono);
		font-size: 0.9rem;
		padding: 0.8rem;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: inherit;
		resize: vertical;
		transition: border-color 0.15s;
	}
	textarea:focus { outline: none; border-color: var(--accent); }
	textarea.dragging { border-color: var(--accent); background: var(--bg-3); }
	.row {
		display: flex;
		gap: 0.6rem;
		align-items: center;
	}
	.file-btn {
		display: inline-flex;
		align-items: center;
		padding: 0.5rem 0.9rem;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		font-size: 0.9rem;
	}
	.file-btn:hover { border-color: var(--accent); }
	.file-btn input { display: none; }
	.filename {
		font-family: var(--mono);
		font-size: 0.85rem;
		color: var(--muted);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row .primary { margin-left: auto; }
	.error, .warn {
		padding: 0.6rem 0.8rem;
		border-radius: 6px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}
	.error {
		background: rgba(247, 118, 142, 0.1);
		border: 1px solid var(--danger);
		color: var(--danger);
	}
	.warn {
		background: rgba(224, 175, 104, 0.1);
		border: 1px solid #e0af68;
		color: #e0af68;
	}
	.library h2 {
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		margin: 2rem 0 0.8rem;
		font-weight: 600;
	}
	.count {
		background: var(--bg-3);
		color: var(--muted);
		padding: 0.1rem 0.5rem;
		border-radius: 10px;
		font-size: 0.75rem;
		margin-left: 0.3rem;
	}
	.library ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 0.4rem;
	}
	.library li {
		display: flex;
		align-items: stretch;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-2);
		overflow: hidden;
	}
	.library li:hover { border-color: var(--accent); }
	.library li a {
		flex: 1;
		padding: 0.8rem 1rem;
		color: inherit;
		text-decoration: none;
		display: block;
	}
	.title { font-weight: 500; }
	.meta {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.2rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.pill {
		background: var(--bg-3);
		padding: 0.1rem 0.5rem;
		border-radius: 10px;
		font-family: var(--mono);
		font-size: 0.75rem;
	}
	.del {
		border: none;
		border-left: 1px solid var(--border);
		border-radius: 0;
		color: var(--muted);
		font-size: 1.2rem;
		width: 2.5rem;
	}
	.del:hover {
		color: var(--danger);
		background: rgba(247, 118, 142, 0.1);
	}
	.empty {
		color: var(--muted);
		font-style: italic;
		padding: 2rem 0;
		text-align: center;
	}
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding: 4rem 1rem;
		z-index: 10;
	}
	.modal {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 10px;
		padding: 1.5rem;
		max-width: 520px;
		width: 100%;
	}
	.modal h3 { margin: 0 0 1rem; }
	.cands {
		list-style: none;
		padding: 0;
		margin: 0 0 1rem;
		display: grid;
		gap: 0.4rem;
	}
	.cand {
		width: 100%;
		text-align: left;
		padding: 0.8rem 1rem;
		background: var(--bg-3);
		border: 1px solid var(--border);
	}
	.cand:hover:not(:disabled) { border-color: var(--accent); }
	.cand-title { font-weight: 500; }
	.cand-meta {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.2rem;
		font-size: 0.85rem;
		color: var(--muted);
	}
	.note { font-style: italic; }
	.loading {
		display: block;
		margin-top: 0.4rem;
		font-size: 0.8rem;
		color: var(--accent);
	}
</style>
