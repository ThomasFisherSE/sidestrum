<script lang="ts">
	import { lookupChordPositions, type Position } from './chord-lookup';
	import type { ChordDef } from './types';

	let {
		chord,
		customDefs,
		variation = 0
	}: { chord: string; customDefs?: ChordDef[] | null; variation?: number } = $props();

	const custom = $derived.by<Position | null>(() => {
		if (!customDefs) return null;
		const hit = customDefs.find((d) => d.name === chord);
		if (!hit) return null;
		return {
			frets: hit.frets,
			fingers: hit.fingers,
			barres: hit.barres,
			baseFret: hit.baseFret
		};
	});
	const positions = $derived<Position[]>(custom ? [custom] : lookupChordPositions(chord));
	const position = $derived(
		positions.length > 0
			? positions[Math.max(0, Math.min(variation, positions.length - 1))]
			: null
	);

	const STRINGS = 6;
	const FRETS = 4;
	const W = 90;
	const H = 110;
	const PAD_X = 12;
	const PAD_TOP = 20;
	const PAD_BOT = 12;

	const stringGap = $derived((W - 2 * PAD_X) / (STRINGS - 1));
	const fretGap = $derived((H - PAD_TOP - PAD_BOT) / FRETS);
</script>

{#if position}
	<svg width={W} height={H} viewBox="0 0 {W} {H}" class="chord-diagram">
		<!-- nut / baseFret indicator -->
		{#if position.baseFret === 1}
			<rect x={PAD_X - 1} y={PAD_TOP - 3} width={W - 2 * PAD_X + 2} height={3} fill="currentColor" />
		{:else}
			<text x={PAD_X - 4} y={PAD_TOP + 4} text-anchor="end" font-size="9" fill="currentColor">
				{position.baseFret}fr
			</text>
		{/if}

		<!-- frets -->
		{#each [0, 1, 2, 3, 4] as f (f)}
			<line
				x1={PAD_X}
				y1={PAD_TOP + f * fretGap}
				x2={W - PAD_X}
				y2={PAD_TOP + f * fretGap}
				stroke="currentColor"
				stroke-width={f === 0 && position.baseFret === 1 ? 0 : 1}
				opacity={0.5}
			/>
		{/each}

		<!-- strings -->
		{#each Array(STRINGS) as _, s (s)}
			<line
				x1={PAD_X + s * stringGap}
				y1={PAD_TOP}
				x2={PAD_X + s * stringGap}
				y2={H - PAD_BOT}
				stroke="currentColor"
				stroke-width={1}
				opacity={0.5}
			/>
		{/each}

		<!-- barres -->
		{#each position.barres as barre (barre)}
			{@const fretIdx = barre}
			{@const fretPositions = position.frets
				.map((f, i) => ({ f, i }))
				.filter((x) => x.f === fretIdx)
				.map((x) => x.i)}
			{#if fretPositions.length > 1}
				<line
					x1={PAD_X + fretPositions[0] * stringGap}
					y1={PAD_TOP + (fretIdx - 0.5) * fretGap}
					x2={PAD_X + fretPositions[fretPositions.length - 1] * stringGap}
					y2={PAD_TOP + (fretIdx - 0.5) * fretGap}
					stroke="currentColor"
					stroke-width={6}
					stroke-linecap="round"
				/>
			{/if}
		{/each}

		<!-- finger dots, X for muted, O for open -->
		{#each position.frets as fret, s (s)}
			{#if fret === -1}
				<text
					x={PAD_X + s * stringGap}
					y={PAD_TOP - 6}
					text-anchor="middle"
					font-size="10"
					fill="currentColor"
					opacity="0.7"
				>×</text>
			{:else if fret === 0}
				<circle
					cx={PAD_X + s * stringGap}
					cy={PAD_TOP - 7}
					r="3"
					fill="none"
					stroke="currentColor"
					stroke-width="1"
				/>
			{:else}
				<circle
					cx={PAD_X + s * stringGap}
					cy={PAD_TOP + (fret - 0.5) * fretGap}
					r="5"
					fill="currentColor"
				/>
				{#if position.fingers[s] > 0}
					<text
						x={PAD_X + s * stringGap}
						y={PAD_TOP + (fret - 0.5) * fretGap + 3}
						text-anchor="middle"
						font-size="8"
						fill="var(--bg)"
						font-weight="bold"
					>{position.fingers[s]}</text>
				{/if}
			{/if}
		{/each}
	</svg>
{:else}
	<div class="no-diagram">{chord}</div>
{/if}

<style>
	.chord-diagram {
		color: var(--text);
	}
	.no-diagram {
		font-family: var(--mono);
		font-size: 0.8rem;
		color: var(--muted);
		padding: 1rem;
	}
</style>
