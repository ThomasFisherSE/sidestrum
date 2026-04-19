<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let chordpro = $state('');
	let filename = $state<string | undefined>(undefined);
	let importing = $state(false);
	let error = $state<string | null>(null);
	let dragging = $state(false);

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
		const text = await file.text();
		chordpro = text;
		filename = file.name;
	}

	async function handleDrop(ev: DragEvent) {
		ev.preventDefault();
		dragging = false;
		const file = ev.dataTransfer?.files?.[0];
		if (!file) return;
		const text = await file.text();
		chordpro = text;
		filename = file.name;
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

	<form class="entry" onsubmit={(e) => { e.preventDefault(); importText(); }}>
		<textarea
			class:dragging
			bind:value={chordpro}
			placeholder={'Paste ChordPro here, or drop a .cho file…\n\nTITLE: Example\nARTIST: You\nKEY: C\n\n# Verse\n[C]Hello [G]world, [Am]here\'s a [F]song'}
			rows="10"
			ondrop={handleDrop}
			ondragover={(e) => { e.preventDefault(); dragging = true; }}
			ondragleave={() => dragging = false}
		></textarea>
		<div class="row">
			<label class="file-btn">
				<input type="file" accept=".cho,.chordpro,.pro,.txt" onchange={handleFile} />
				<span>Choose file…</span>
			</label>
			{#if filename}
				<span class="filename">{filename}</span>
			{/if}
			<button type="submit" class="primary" disabled={!chordpro.trim() || importing}>
				{importing ? 'Importing…' : 'Add to library'}
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
	.error {
		background: rgba(247, 118, 142, 0.1);
		border: 1px solid var(--danger);
		color: var(--danger);
		padding: 0.6rem 0.8rem;
		border-radius: 6px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
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
</style>
