<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import type { Song, LyricLine } from '$lib/types';
	import { isLyricLine } from '$lib/types';
	import { displayChord, beatsPerLine } from '$lib/music';
	import ChordDiagram from '$lib/ChordDiagram.svelte';
	import { lookupChordPositions } from '$lib/chord-lookup';

	let { data }: { data: PageData } = $props();
	let song = $state<Song>(data.song);

	// UI state
	let transpose = $state(0);
	let capo = $state(song.capo ?? 0);
	let playing = $state(false);
	let tapSyncMode = $state(false);
	let refetching = $state(false);
	let scrollSpeed = $state(10); // px/sec for autoscroll-only mode

	// Flatten lyric lines only — these are the cursor/timing units. Comments, tabs,
	// and chorus references render inline but the tap-sync cursor skips over them.
	type FlatLine = { sectionIdx: number; lineIdx: number; section: string; line: LyricLine; absIdx: number };
	const flatLines = $derived.by<FlatLine[]>(() => {
		const out: FlatLine[] = [];
		song.sections.forEach((section, sectionIdx) => {
			section.lines.forEach((line, lineIdx) => {
				if (!isLyricLine(line)) return;
				out.push({ sectionIdx, lineIdx, section: section.name, line, absIdx: out.length });
			});
		});
		return out;
	});

	// Playback cursor
	let currentIdx = $state(0);
	let tapStartTime = $state<number | null>(null);
	let tapDurations = $state<number[]>([]);
	let timerHandle: ReturnType<typeof setTimeout> | null = null;
	let rafHandle: number | null = null;
	let lastFrameTime = 0;
	let scrollAccum = 0;

	// Unique chords used in the song, in first-appearance order, post transpose+capo
	const uniqueChords = $derived.by<string[]>(() => {
		const seen = new Set<string>();
		const out: string[] = [];
		for (const section of song.sections) {
			for (const line of section.lines) {
				if (!isLyricLine(line)) continue;
				for (const c of line.chords) {
					const d = displayChord(c.chord, capo, transpose);
					if (!seen.has(d)) {
						seen.add(d);
						out.push(d);
					}
				}
			}
		}
		return out;
	});

	let chordsOpen = $state(false);
	let pinnedChords = $state<Set<string>>(new Set());

	function togglePin(chord: string) {
		const next = new Set(pinnedChords);
		if (next.has(chord)) next.delete(chord);
		else next.add(chord);
		pinnedChords = next;
	}

	const pinnedList = $derived(uniqueChords.filter((c) => pinnedChords.has(c)));

	let variationByChord = $state<Record<string, number>>({});

	function variationCount(chord: string): number {
		if (song.chord_defs?.some((d) => d.name === chord)) return 1;
		return lookupChordPositions(chord).length;
	}

	function cycleVariation(chord: string, delta: number) {
		const count = variationCount(chord);
		if (count <= 1) return;
		const cur = variationByChord[chord] ?? 0;
		variationByChord = { ...variationByChord, [chord]: (cur + delta + count) % count };
	}

	const effectiveBpm = $derived(song.bpm ?? 100);
	const beatsPerBar = $derived(beatsPerLine(song.time_signature));
	const hasTiming = $derived(
		flatLines.length > 0 && flatLines.every((f) => typeof f.line.duration_beats === 'number')
	);

	function msForLine(line: FlatLine | undefined): number {
		if (!line) return 0;
		const beats = line.line.duration_beats ?? 8;
		return (beats / effectiveBpm) * 60_000;
	}

	function scheduleNext() {
		if (!playing || tapSyncMode) return;
		if (timerHandle) clearTimeout(timerHandle);
		const ms = msForLine(flatLines[currentIdx]);
		timerHandle = setTimeout(() => {
			if (currentIdx < flatLines.length - 1) {
				currentIdx += 1;
				scheduleNext();
			} else {
				playing = false;
				playMode = 'idle';
			}
		}, ms);
	}

	function autoScrollTick(t: number) {
		if (!playing || tapSyncMode) {
			rafHandle = null;
			return;
		}
		const dt = lastFrameTime ? (t - lastFrameTime) / 1000 : 0;
		lastFrameTime = t;
		scrollAccum += scrollSpeed * dt;
		if (scrollAccum >= 1) {
			const px = Math.floor(scrollAccum);
			window.scrollBy(0, px);
			scrollAccum -= px;
		}
		const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 2;
		if (atBottom) {
			playing = false;
			playMode = 'idle';
			rafHandle = null;
			return;
		}
		rafHandle = requestAnimationFrame(autoScrollTick);
	}

	type PlayMode = 'idle' | 'along' | 'scroll';
	let playMode = $state<PlayMode>('idle');

	function playAlong() {
		if (!hasTiming || tapSyncMode) return;
		pause();
		playing = true;
		playMode = 'along';
		if (currentIdx >= flatLines.length - 1) currentIdx = 0;
		scheduleNext();
	}
	function autoScroll() {
		if (tapSyncMode) return;
		pause();
		playing = true;
		playMode = 'scroll';
		lastFrameTime = 0;
		scrollAccum = 0;
		rafHandle = requestAnimationFrame(autoScrollTick);
	}
	function pause() {
		playing = false;
		playMode = 'idle';
		if (timerHandle) clearTimeout(timerHandle);
		timerHandle = null;
		if (rafHandle) cancelAnimationFrame(rafHandle);
		rafHandle = null;
	}
	function toggleDefault() {
		if (tapSyncMode) return;
		if (playing) {
			pause();
		} else if (hasTiming) {
			playAlong();
		} else {
			autoScroll();
		}
	}
	function restart() {
		pause();
		currentIdx = 0;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	function onTap() {
		const now = performance.now();
		if (tapStartTime === null) {
			tapStartTime = now;
			tapDurations = [];
			currentIdx = 0;
			return;
		}
		const elapsed = now - tapStartTime;
		tapDurations = [...tapDurations, elapsed];
		tapStartTime = now;
		if (currentIdx < flatLines.length - 1) {
			currentIdx += 1;
		} else {
			finishTapSync();
		}
	}

	function finishTapSync() {
		// Convert ms durations to beats per line
		const msPerBeat = 60_000 / effectiveBpm;
		const updated: Song = {
			...song,
			sections: song.sections.map((section, si) => ({
				...section,
				lines: section.lines.map((line, li) => {
					if (!isLyricLine(line)) return line;
					const absIdx = flatLines.findIndex((f) => f.sectionIdx === si && f.lineIdx === li);
					const dur = tapDurations[absIdx];
					if (dur === undefined) return line;
					const beats = Math.max(0.05, dur / msPerBeat);
					return { ...line, duration_beats: beats };
				})
			}))
		};
		song = updated;
		persistSong(updated);
		tapSyncMode = false;
		tapStartTime = null;
		tapDurations = [];
		currentIdx = 0;
	}

	function toggleTapSync() {
		if (tapSyncMode) {
			tapSyncMode = false;
			tapStartTime = null;
			tapDurations = [];
		} else {
			pause();
			tapSyncMode = true;
			tapStartTime = null;
			tapDurations = [];
			currentIdx = 0;
		}
	}

	// Global keyboard
	function onKey(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
		if (e.code === 'Space') {
			e.preventDefault();
			if (tapSyncMode) onTap();
			else toggleDefault();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (currentIdx < flatLines.length - 1) currentIdx += 1;
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			if (currentIdx > 0) currentIdx -= 1;
		} else if (e.key === 'r' || e.key === 'R') {
			restart();
		}
	}

	// Auto-scroll current line into view
	let linesEl = $state<HTMLElement | null>(null);
	$effect(() => {
		if (!linesEl) return;
		const _ = currentIdx;
		const el = linesEl.querySelector<HTMLElement>(`[data-abs="${currentIdx}"]`);
		if (!el) return;
		const rect = el.getBoundingClientRect();
		if (rect.top < 120 || rect.top > window.innerHeight * 0.6) {
			el.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	});

	// Edit state
	let editing = $state<{ si: number; li: number; ci: number } | null>(null);
	let editValue = $state('');
	let editInputEl = $state<HTMLInputElement | null>(null);

	async function startEdit(si: number, li: number, ci: number, current: string) {
		editing = { si, li, ci };
		editValue = current;
		await tick();
		editInputEl?.focus();
		editInputEl?.select();
	}

	async function saveEdit() {
		if (!editing) return;
		const { si, li, ci } = editing;
		const updated: Song = {
			...song,
			sections: song.sections.map((s, i) =>
				i !== si
					? s
					: {
							...s,
							lines: s.lines.map((ln, j) => {
								if (j !== li || !isLyricLine(ln)) return ln;
								return {
									...ln,
									chords: ln.chords.map((c, k) => (k !== ci ? c : { ...c, chord: editValue.trim() }))
								};
							})
						}
			)
		};
		song = updated;
		editing = null;
		await persistSong(updated);
	}

	function cancelEdit() {
		editing = null;
	}

	async function persistSong(s: Song) {
		await fetch(`/api/song/${s.id}`, {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(s)
		});
	}

	async function refetch() {
		if (!confirm('Re-fetch this song from the web? You will review the new version before saving.')) return;
		refetching = true;
		try {
			const res = await fetch('/api/source/fetch', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ title: song.title, artist: song.artist })
			});
			const body = await res.json();
			if (!res.ok) {
				alert(`Refetch failed: ${body?.error ?? res.statusText}`);
				return;
			}
			sessionStorage.setItem(
				'sidestrum:pendingChordPro',
				JSON.stringify({ chordpro: body.chordpro, sourceUrl: body.sourceUrl })
			);
			goto('/song/new');
		} finally {
			refetching = false;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// Hover chord diagram
	let hoverChord = $state<{ chord: string; x: number; y: number } | null>(null);
	function onChordEnter(e: MouseEvent, chord: string) {
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		hoverChord = { chord, x: rect.left + rect.width / 2, y: rect.top };
	}
	function onChordLeave() {
		hoverChord = null;
	}
</script>

<div class="page">
	<header class="topbar">
		<a href="/" class="back">← Library</a>
		<div class="meta">
			<h1>{song.title}</h1>
			{#if song.subtitle}
				<div class="subtitle">{song.subtitle}</div>
			{/if}
			<div class="sub">
				<span>{song.artist}</span>
				{#if song.album}<span class="album">· {song.album}{song.year ? ` (${song.year})` : ''}</span>{/if}
				{#if song.key}<span class="pill">Key: {song.key}</span>{/if}
				<span class="pill">{effectiveBpm} bpm</span>
				<span class="pill">{song.time_signature}</span>
			</div>
		</div>
	</header>

	<div class="sticky-top">
	<div class="controls">
		<div class="group">
			{#if playing}
				<button class="primary" onclick={pause}>⏸ Pause</button>
			{:else}
				<button
					class="primary"
					onclick={playAlong}
					disabled={!hasTiming || tapSyncMode}
					title={hasTiming ? 'Play along using tap-synced timing' : 'Tap-sync the song first to enable Play Along'}
				>▶ Play Along</button>
				<button
					onclick={autoScroll}
					disabled={tapSyncMode}
					title="Smooth scroll the page"
				>↓ Autoscroll</button>
			{/if}
			<button onclick={restart} title="Restart (r)">↺</button>
		</div>

		<div class="group">
			<label>Transpose</label>
			<button onclick={() => (transpose -= 1)}>−</button>
			<span class="val mono">{transpose > 0 ? `+${transpose}` : transpose}</span>
			<button onclick={() => (transpose += 1)}>+</button>
		</div>

		<div class="group">
			<label>Capo</label>
			<button onclick={() => (capo = Math.max(0, capo - 1))}>−</button>
			<span class="val mono">{capo}</span>
			<button onclick={() => (capo = Math.min(11, capo + 1))}>+</button>
		</div>

		<div class="group">
			<label>BPM</label>
			<input
				type="number"
				min="30"
				max="300"
				value={effectiveBpm}
				onchange={(e) => {
					const n = Number((e.target as HTMLInputElement).value);
					song = { ...song, bpm: n };
					persistSong(song);
				}}
				class="bpm-input"
			/>
		</div>

		{#if !hasTiming}
			<div class="group">
				<label>Scroll</label>
				<button onclick={() => (scrollSpeed = Math.max(1, scrollSpeed - 1))}>−</button>
				<span class="val mono">{scrollSpeed}</span>
				<button onclick={() => (scrollSpeed = Math.min(100, scrollSpeed + 1))}>+</button>
			</div>
		{/if}

		<div class="group end">
			<button class:active={tapSyncMode} onclick={toggleTapSync}>
				{tapSyncMode ? 'Tapping… (spacebar)' : 'Tap-sync'}
			</button>
			<button onclick={refetch} disabled={refetching} title="Re-fetch from web">
				{refetching ? 'Fetching…' : '↻ Refetch'}
			</button>
		</div>
	</div>

	{#if pinnedList.length > 0}
		<div class="pinned-bar">
			{#each pinnedList as c (c)}
				{@const count = variationCount(c)}
				{@const v = variationByChord[c] ?? 0}
				<div class="chord-card">
					<button
						class="pin-btn pinned"
						onclick={() => togglePin(c)}
						title="Unpin"
						aria-label="Unpin {c}"
					>
						<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
							<path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
						</svg>
					</button>
					<ChordDiagram chord={c} customDefs={song.chord_defs ?? null} variation={v} />
					<div class="chord-card-name-row">
						{#if count > 1}
							<button
								class="var-btn"
								onclick={() => cycleVariation(c, -1)}
								title="Previous voicing ({v + 1}/{count})"
								aria-label="Previous voicing of {c}"
							>‹</button>
						{/if}
						<div class="chord-card-name mono">{c}</div>
						{#if count > 1}
							<button
								class="var-btn"
								onclick={() => cycleVariation(c, 1)}
								title="Next voicing ({v + 1}/{count})"
								aria-label="Next voicing of {c}"
							>›</button>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
	</div>

	{#if uniqueChords.length > 0}
		<details class="chords-panel" bind:open={chordsOpen}>
			<summary>
				<span class="chords-panel-title">Chord charts</span>
				<span class="chords-panel-count">{uniqueChords.length}</span>
			</summary>
			<div class="chords-grid">
				{#each uniqueChords as c (c)}
					{@const isPinned = pinnedChords.has(c)}
					{@const count = variationCount(c)}
					{@const v = variationByChord[c] ?? 0}
					<div class="chord-card">
						<button
							class="pin-btn"
							class:pinned={isPinned}
							onclick={() => togglePin(c)}
							title={isPinned ? 'Unpin' : 'Pin to top'}
							aria-label={isPinned ? `Unpin ${c}` : `Pin ${c} to top`}
						>
							<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="currentColor">
								<path d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z" />
							</svg>
						</button>
						<ChordDiagram chord={c} customDefs={song.chord_defs ?? null} variation={v} />
						<div class="chord-card-name-row">
							{#if count > 1}
								<button
									class="var-btn"
									onclick={() => cycleVariation(c, -1)}
									title="Previous voicing ({v + 1}/{count})"
									aria-label="Previous voicing of {c}"
								>‹</button>
							{/if}
							<div class="chord-card-name mono">{c}</div>
							{#if count > 1}
								<button
									class="var-btn"
									onclick={() => cycleVariation(c, 1)}
									title="Next voicing ({v + 1}/{count})"
									aria-label="Next voicing of {c}"
								>›</button>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</details>
	{/if}

	{#if tapSyncMode}
		<div class="banner">
			Tap <kbd>space</kbd> on the beat of each line change. Line {currentIdx + 1} / {flatLines.length}.
		</div>
	{/if}

	<div class="sheet" bind:this={linesEl}>
		{#each song.sections as section, si (si)}
			<section class="section" class:tab-section={section.kind === 'tab' || section.kind === 'grid'}>
				<h2 class="section-name">{section.name}</h2>
				{#each section.lines as line, li (li)}
					{#if isLyricLine(line)}
						{@const absIdx = flatLines.findIndex((f) => f.sectionIdx === si && f.lineIdx === li)}
						{@const isCurrent = (hasTiming && playing) || tapSyncMode ? absIdx === currentIdx : false}
						<div class="line" class:current={isCurrent} data-abs={absIdx}>
							<div class="chord-row">
								{#each line.chords as c, ci (ci)}
									{@const displayed = displayChord(c.chord, capo, transpose)}
									<span
										class="chord"
										style="left: {c.pos}ch"
										onmouseenter={(e) => onChordEnter(e, displayed)}
										onmouseleave={onChordLeave}
										role="button"
										tabindex="0"
									>
										{#if editing && editing.si === si && editing.li === li && editing.ci === ci}
											<input
												bind:this={editInputEl}
												bind:value={editValue}
												onblur={saveEdit}
												onkeydown={(e) => {
													if (e.key === 'Enter') saveEdit();
													else if (e.key === 'Escape') cancelEdit();
												}}
												class="chord-input"
											/>
										{:else}
											<button
												class="chord-btn"
												onclick={() => startEdit(si, li, ci, displayed)}
											>{displayed}</button>
										{/if}
									</span>
								{/each}
							</div>
							<div class="lyric">{line.lyric || '\u00A0'}</div>
						</div>
					{:else if line.type === 'comment'}
						<div
							class="comment"
							class:italic={line.style === 'italic'}
							class:boxed={line.style === 'box'}
						>{line.text}</div>
					{:else if line.type === 'tab'}
						<pre class="tab-line">{line.text || '\u00A0'}</pre>
					{:else if line.type === 'chorus_ref'}
						<div class="chorus-ref">↻ {line.label ?? 'Chorus'}</div>
					{/if}
				{/each}
			</section>
		{/each}
	</div>

	{#if hoverChord}
		<div class="chord-tooltip" style="left: {hoverChord.x}px; top: {hoverChord.y - 130}px;">
			<ChordDiagram
				chord={hoverChord.chord}
				customDefs={song.chord_defs ?? null}
				variation={variationByChord[hoverChord.chord] ?? 0}
			/>
			<div class="chord-tooltip-name mono">{hoverChord.chord}</div>
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 900px;
		margin: 0 auto;
		padding: 1.5rem 1.5rem 10rem;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}
	.back {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.back:hover { color: var(--accent); text-decoration: none; }
	.meta h1 {
		margin: 0;
		font-size: 1.6rem;
		letter-spacing: -0.01em;
	}
	.sub {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		color: var(--muted);
		font-size: 0.9rem;
		margin-top: 0.2rem;
	}
	.pill {
		background: var(--bg-3);
		padding: 0.1rem 0.5rem;
		border-radius: 10px;
		font-family: var(--mono);
		font-size: 0.75rem;
	}
	.sticky-top {
		position: sticky;
		top: 0.5rem;
		z-index: 5;
		margin-bottom: 1rem;
	}
	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 0.8rem 1rem;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		align-items: center;
	}
	.group {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		font-size: 0.85rem;
	}
	.group label {
		color: var(--muted);
		font-size: 0.8rem;
		margin-right: 0.2rem;
	}
	.group.end {
		margin-left: auto;
	}
	.val {
		min-width: 2ch;
		text-align: center;
		color: var(--accent);
	}
	.mono { font-family: var(--mono); }
	.bpm-input {
		width: 4rem;
		padding: 0.3rem 0.4rem;
		font-size: 0.85rem;
	}
	button.active {
		background: var(--accent);
		color: #1a1510;
		border-color: var(--accent);
	}
	.banner {
		background: rgba(255, 180, 84, 0.1);
		border: 1px solid var(--accent);
		color: var(--accent);
		padding: 0.6rem 1rem;
		border-radius: 6px;
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}
	kbd {
		background: var(--bg-3);
		padding: 0.05rem 0.4rem;
		border-radius: 3px;
		font-family: var(--mono);
		font-size: 0.8rem;
	}
	.sheet {
		font-family: var(--mono);
		font-size: 1.05rem;
		line-height: 1.5;
	}
	.section {
		margin-bottom: 1.8rem;
	}
	.section-name {
		font-family: var(--sans);
		color: var(--muted);
		font-size: 0.75rem;
		letter-spacing: 0.15em;
		text-transform: uppercase;
		margin: 0 0 0.4rem;
		font-weight: 600;
	}
	.line {
		padding: 0.15rem 0.6rem;
		border-radius: 4px;
		margin-bottom: 0.2rem;
		transition: background 0.15s;
	}
	.line.current {
		background: var(--highlight);
		box-shadow: inset 3px 0 0 var(--accent);
	}
	.chord-row {
		position: relative;
		height: 1.4em;
		white-space: pre;
	}
	.chord {
		position: absolute;
		color: var(--chord);
		font-weight: inherit;
		top: 0;
	}
	.chord-btn {
		background: transparent;
		border: none;
		color: inherit;
		font-family: inherit;
		font-weight: 600;
		font-size: inherit;
		padding: 0;
		margin: 0;
		cursor: pointer;
		border-radius: 3px;
		line-height: 1;
	}
	.chord-btn:hover {
		background: var(--bg-3);
	}
	.chord-input {
		font-family: var(--mono);
		font-size: 1rem;
		width: 5rem;
		padding: 0 0.2rem;
		background: var(--bg-3);
		border: 1px solid var(--accent);
		border-radius: 3px;
		color: var(--chord);
	}
	.lyric {
		white-space: pre;
	}
	.comment {
		padding: 0.3rem 0.6rem;
		margin: 0.3rem 0;
		color: var(--muted);
		font-size: 0.95rem;
	}
	.comment.italic {
		font-style: italic;
	}
	.comment.boxed {
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--bg-2);
		padding: 0.4rem 0.7rem;
	}
	.chorus-ref {
		padding: 0.3rem 0.6rem;
		margin: 0.4rem 0;
		color: var(--accent);
		font-size: 0.9rem;
		font-family: var(--sans);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.tab-line {
		margin: 0;
		padding: 0.1rem 0.6rem;
		white-space: pre;
		font-family: var(--mono);
		font-size: 0.95rem;
	}
	.tab-section {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.6rem;
		margin-bottom: 1.8rem;
	}
	.subtitle {
		color: var(--muted);
		font-size: 0.95rem;
		margin-top: 0.15rem;
	}
	.album {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.chord-tooltip {
		position: fixed;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		padding: 0.4rem;
		pointer-events: none;
		z-index: 20;
		transform: translateX(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
	}
	.chord-tooltip-name {
		color: var(--chord);
		font-size: 0.85rem;
		font-weight: 600;
		margin-top: 0.2rem;
	}
	.chords-panel {
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		margin-bottom: 1rem;
		overflow: hidden;
	}
	.chords-panel > summary {
		list-style: none;
		cursor: pointer;
		padding: 0.6rem 1rem;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		user-select: none;
	}
	.chords-panel > summary::-webkit-details-marker {
		display: none;
	}
	.chords-panel > summary::before {
		content: '▸';
		color: var(--muted);
		font-size: 0.75rem;
		transition: transform 0.15s;
	}
	.chords-panel[open] > summary::before {
		transform: rotate(90deg);
	}
	.chords-panel-title {
		font-size: 0.85rem;
		font-weight: 600;
	}
	.chords-panel-count {
		background: var(--bg-3);
		color: var(--muted);
		font-family: var(--mono);
		font-size: 0.72rem;
		padding: 0.05rem 0.45rem;
		border-radius: 10px;
	}
	.chords-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
		gap: 0.75rem;
		padding: 0 1rem 1rem;
	}
	.chord-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.25rem 0.4rem 0.4rem;
		background: var(--bg-3);
		border-radius: 6px;
	}
	.chord-card-name-row {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		margin-top: 0.2rem;
	}
	.chord-card-name {
		color: var(--chord);
		font-size: 0.85rem;
		font-weight: 600;
	}
	.var-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.1rem;
		height: 1.1rem;
		padding: 0;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 3px;
		color: var(--muted);
		font-family: var(--sans);
		font-size: 0.95rem;
		line-height: 1;
		cursor: pointer;
		transition: color 0.12s, border-color 0.12s, background 0.12s;
	}
	.var-btn:hover {
		color: var(--accent);
		border-color: var(--accent);
		background: var(--bg-2);
	}
	.pin-btn {
		align-self: flex-end;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		padding: 0;
		margin-bottom: 0.1rem;
		background: transparent;
		border: none;
		color: var(--muted);
		opacity: 0.4;
		border-radius: 3px;
		cursor: pointer;
		transition: opacity 0.12s, color 0.12s, background 0.12s;
	}
	.chord-card:hover .pin-btn {
		opacity: 1;
	}
	.pin-btn:hover {
		color: var(--accent);
		background: var(--bg-2);
	}
	.pin-btn.pinned {
		color: var(--accent);
		opacity: 1;
	}
	.pinned-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		padding: 0.6rem 0.8rem;
		margin-top: 0.5rem;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
	}
	.pinned-bar .chord-card {
		min-width: 90px;
	}
</style>
