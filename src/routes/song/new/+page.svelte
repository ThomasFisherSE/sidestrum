<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { parseChordPro } from '$lib/chordpro';

	let chordpro = $state('');
	let saving = $state(false);
	let error = $state<string | null>(null);
	let sourceUrl = $state<string | undefined>(undefined);

	const STORAGE_KEY = 'sidestrum:pendingChordPro';

	onMount(() => {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (raw) {
			try {
				const payload = JSON.parse(raw) as { chordpro: string; sourceUrl?: string };
				chordpro = payload.chordpro ?? '';
				sourceUrl = payload.sourceUrl;
			} catch {
				chordpro = raw;
			}
			sessionStorage.removeItem(STORAGE_KEY);
		}
	});

	const parsed = $derived(parseChordPro(chordpro));
	const sectionCount = $derived(parsed.sections.length);
	const chordSet = $derived.by(() => {
		const s = new Set<string>();
		for (const section of parsed.sections) {
			for (const line of section.lines) {
				for (const c of line.chords) s.add(c.chord);
			}
		}
		return Array.from(s);
	});

	async function save() {
		if (!chordpro.trim()) return;
		if (sectionCount === 0) {
			error = 'No parseable sections. Add at least one "# Section" heading with chord/lyric lines.';
			return;
		}
		saving = true;
		error = null;
		try {
			const res = await fetch('/api/import', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ chordpro })
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.error ?? 'save failed');
			goto(`/song/${body.song.id}`);
		} catch (e) {
			error = e instanceof Error ? e.message : 'save failed';
			saving = false;
		}
	}

	function cancel() {
		if (chordpro.trim() && !confirm('Discard this chart?')) return;
		goto('/');
	}
</script>

<main>
	<header>
		<h1>Review chart</h1>
		<p class="hint">
			Edit as needed, then save. Fetched charts are a first draft; always check against a reference.
		</p>
		{#if sourceUrl}
			<p class="hint">Source: <a href={sourceUrl} target="_blank" rel="noopener">{sourceUrl}</a></p>
		{/if}
	</header>

	<div class="panes">
		<section class="editor">
			<div class="pane-head">
				<h2>ChordPro</h2>
				<span class="stats">
					{sectionCount} section{sectionCount === 1 ? '' : 's'}
					· {chordSet.length} unique chord{chordSet.length === 1 ? '' : 's'}
				</span>
			</div>
			<textarea bind:value={chordpro} spellcheck="false"></textarea>
		</section>

		<section class="preview">
			<div class="pane-head">
				<h2>Preview</h2>
				{#if parsed.title || parsed.artist || parsed.key}
					<span class="stats">
						{parsed.title ?? ''}{parsed.title && parsed.artist ? ' · ' : ''}{parsed.artist ?? ''}
						{#if parsed.key}<span class="pill">{parsed.key}</span>{/if}
						{#if parsed.bpm}<span class="pill">{parsed.bpm} bpm</span>{/if}
					</span>
				{/if}
			</div>
			<div class="sheet">
				{#if parsed.sections.length === 0}
					<p class="empty">Preview will appear as you type.</p>
				{:else}
					{#each parsed.sections as section, si (si)}
						<div class="section">
							<h3 class="section-name">{section.name}</h3>
							{#each section.lines as line, li (li)}
								<div class="line">
									<div class="chord-row">
										{#each line.chords as c, ci (ci)}
											<span class="chord" style="left: {c.pos}ch">{c.chord}</span>
										{/each}
									</div>
									<div class="lyric">{line.lyric || '\u00A0'}</div>
								</div>
							{/each}
						</div>
					{/each}
				{/if}
			</div>
		</section>
	</div>

	{#if error}
		<div class="error">{error}</div>
	{/if}

	<div class="actions">
		<button class="ghost" onclick={cancel} disabled={saving}>Cancel</button>
		<button class="primary" onclick={save} disabled={saving || !chordpro.trim() || sectionCount === 0}>
			{saving ? 'Saving...' : 'Save to library'}
		</button>
	</div>
</main>

<style>
	main {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem 1.5rem 5rem;
	}
	header {
		margin-bottom: 1.5rem;
	}
	h1 {
		margin: 0;
		font-size: 1.6rem;
		letter-spacing: -0.02em;
	}
	.hint {
		color: var(--muted);
		margin: 0.25rem 0 0;
		font-size: 0.9rem;
	}
	.hint a {
		color: var(--accent);
	}
	.panes {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	@media (min-width: 900px) {
		.panes {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		}
	}
	.pane-head {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.4rem;
	}
	.pane-head h2 {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--muted);
		margin: 0;
		font-weight: 600;
	}
	.stats {
		font-size: 0.8rem;
		color: var(--muted);
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	.pill {
		background: var(--bg-3);
		padding: 0.1rem 0.5rem;
		border-radius: 10px;
		font-family: var(--mono);
		font-size: 0.7rem;
	}
	textarea {
		width: 100%;
		min-height: 60vh;
		font-family: var(--mono);
		font-size: 0.9rem;
		padding: 0.8rem;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		color: inherit;
		resize: vertical;
	}
	textarea:focus {
		outline: none;
		border-color: var(--accent);
	}
	.sheet {
		min-height: 60vh;
		max-height: 70vh;
		overflow: auto;
		padding: 0.8rem;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		font-family: var(--mono);
		font-size: 0.9rem;
	}
	.section {
		margin-bottom: 1.2rem;
	}
	.section-name {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--muted);
		margin: 0 0 0.3rem;
		font-weight: 600;
	}
	.line {
		margin-bottom: 0.3rem;
	}
	.chord-row {
		position: relative;
		height: 1.2em;
	}
	.chord {
		position: absolute;
		color: var(--accent);
		font-weight: 500;
		white-space: nowrap;
	}
	.lyric {
		white-space: pre;
	}
	.empty {
		color: var(--muted);
		font-style: italic;
		text-align: center;
		padding: 2rem 0;
	}
	.error {
		background: rgba(247, 118, 142, 0.1);
		border: 1px solid var(--danger);
		color: var(--danger);
		padding: 0.6rem 0.8rem;
		border-radius: 6px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}
	.actions {
		display: flex;
		gap: 0.6rem;
		justify-content: flex-end;
	}
</style>
