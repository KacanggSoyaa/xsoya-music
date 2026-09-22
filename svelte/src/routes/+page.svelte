<script lang="ts">
	import { onMount } from 'svelte';
	import {
		type SearchResult,
		type Track,
		type TrackStatus,
		type HistoryEntry,
		type Preset,
		type SongEntry,
		fmt,
		fmtTotal,
		parseLine,
		statusGlyph,
		DEFAULT_VIBES,
		loadVibes,
		SONGS_KEY,
		loadSongs
	} from '$lib/player.js';

	let url = $state('');
	let query = $state('');
	let playlistName = $state<string | null>(null);
	let tracks = $state<Track[]>([]);
	let loading = $state(false);
	let searching = $state(false);
	let error = $state<string | null>(null);
	let auth = $state<{ loggedIn: boolean; configured: boolean } | null>(null);
	let history = $state<HistoryEntry[]>([]);
	let songs = $state<SongEntry[]>([]);
	let vibes = $state<Preset[]>([]);
	let vibeEditorOpen = $state(false);
	let vibeName = $state('');
	let vibeTracks = $state('');
	let editVibeKey = $state<number | null>(null);
	let confirmDel = $state<{ label: string; fn: () => void } | null>(null);

	let current = $state(-1);
	let playing = $state(false);
	let progress = $state(0);
	let duration = $state(0);
	let sessionSeconds = $state(0);
	let queue = $state<Track[]>([]);
	let queueSeq = 0;
	let dragging = $state(-1);
	let dragOver = $state(-1);

	let audioEl: HTMLAudioElement;
	let lastTime = -1;
	let sessionRef = 0;

	onMount(() => {
		const params = new URLSearchParams(window.location.search);
		const authError = params.get('authError');
		if (authError) {
			error =
				authError === 'not_configured'
					? "Spotify login isn't configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env.local."
					: authError === 'invalid_state'
						? "That login didn't complete. Make sure you're using http://127.0.0.1:3000 and try again."
						: `Spotify login failed: ${authError}`;
			window.history.replaceState({}, '', '/');
		}
		fetch('/api/auth/me')
			.then((r) => r.json())
			.then((d) => (auth = d))
			.catch(() => (auth = null));

		try {
			const raw = localStorage.getItem('xs_music_history');
			if (raw) {
				const parsed = JSON.parse(raw);
				if (Array.isArray(parsed)) history = parsed.slice(0, 5);
			}
			const total = Number(localStorage.getItem('xs_music_total') || 0);
			if (total > 0) {
				sessionRef = total;
				sessionSeconds = total;
			}
			vibes = loadVibes();
			songs = loadSongs();
		} catch {
			/* ignore */
		}
	});

	function persistSongs(list: SongEntry[]) {
		const sorted = [...list].sort((a, b) => {
			if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
			return b.savedAt - a.savedAt;
		});
		songs = sorted;
		try {
			localStorage.setItem(SONGS_KEY, JSON.stringify(sorted));
		} catch {
			/* ignore */
		}
	}

	function recordSong(entry: SongEntry) {
		const existing = songs.find((s) => s.title === entry.title && s.artist === entry.artist);
		const rest = songs.filter((s) => !(s.title === entry.title && s.artist === entry.artist));
		persistSongs(
			[
				{ ...entry, savedAt: Date.now(), pinned: existing?.pinned ?? false },
				...rest
			].slice(0, 8)
		);
	}

	function removeSong(index: number) {
		persistSongs(songs.filter((_, i) => i !== index));
	}

	function togglePin(index: number) {
		persistSongs(songs.map((s, i) => (i === index ? { ...s, pinned: !s.pinned } : s)));
	}

	function playSong(entry: SongEntry) {
		if (loading) return;
		error = null;
		playlistName = `Song: ${entry.title}`;
		const track: Track = {
			index: 0,
			title: entry.title,
			artist: entry.artist,
			duration_ms: 0,
			videoId: entry.videoId,
			status: entry.videoId ? 'ready' : 'pending'
		};
		tracks = [track];
		current = 0;
		playing = true;
		if (!entry.videoId) void resolveTrack(0, `${entry.title} ${entry.artist}`);
		recordSong(entry);
	}

	async function resolveTrack(index: number, q: string) {
		tracks = tracks.map((t) => (t.index === index ? { ...t, status: 'searching' } : t));
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			const data = (await res.json()) as SearchResult & { error?: string };
			if (!res.ok) throw new Error(data.error || 'search failed');
			tracks = tracks.map((t) =>
				t.index === index ? { ...t, videoId: data.videoId, status: 'ready' as TrackStatus } : t
			);
		} catch (err) {
			tracks = tracks.map((t) =>
				t.index === index
					? { ...t, status: 'error' as TrackStatus, error: (err as Error).message }
					: t
			);
		}
	}

	async function preload(list: Track[]) {
		let next = 0;
		const workers = [0, 1].map(async () => {
			while (next < list.length) {
				const i = next++;
				const t = list[i];
				await resolveTrack(t.index, `${t.title} ${t.artist}`.trim());
			}
		});
		await Promise.all(workers);
	}

	function enqueueTrack(entry: { title: string; artist: string; videoId?: string }) {
		const qid = queueSeq++;
		const track: Track = {
			index: -1,
			qid,
			title: entry.title,
			artist: entry.artist,
			duration_ms: 0,
			videoId: entry.videoId,
			status: entry.videoId ? 'ready' : 'pending'
		};
		queue = [...queue, track];
		if (!entry.videoId) void resolveQueueTrack(qid, `${entry.title} ${entry.artist}`.trim());
	}

	async function resolveQueueTrack(qid: number, q: string) {
		queue = queue.map((t) => (t.qid === qid ? { ...t, status: 'searching' as TrackStatus } : t));
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
			const data = (await res.json()) as SearchResult & { error?: string };
			if (!res.ok) throw new Error(data.error || 'search failed');
			queue = queue.map((t) =>
				t.qid === qid ? { ...t, videoId: data.videoId, status: 'ready' as TrackStatus } : t
			);
		} catch (err) {
			queue = queue.map((t) =>
				t.qid === qid
					? { ...t, status: 'error' as TrackStatus, error: (err as Error).message }
					: t
			);
		}
	}

	function playNextQueued() {
		const next = queue[0];
		if (!next) return;
		queue = queue.slice(1);
		const index = tracks.length;
		const track: Track = { ...next, index, status: next.videoId ? 'ready' : 'pending' };
		tracks = [...tracks, track];
		current = index;
		playing = true;
		if (!track.videoId) void resolveTrack(index, `${track.title} ${track.artist}`.trim());
	}

	function removeFromQueue(qid: number) {
		queue = queue.filter((t) => t.qid !== qid);
	}

	function reorderQueue(from: number, to: number) {
		if (from === to) return;
		const next = [...queue];
		const [moved] = next.splice(from, 1);
		next.splice(to, 0, moved);
		queue = next;
	}

	function searchAndQueue(q: string) {
		return (async () => {
			const term = q.trim();
			if (!term || searching) return;
			searching = true;
			error = null;
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
				const data = (await res.json()) as SearchResult & { error?: string };
				if (!res.ok) throw new Error(data.error || 'search failed');
				enqueueTrack({ title: data.title ?? term, artist: data.channel ?? '', videoId: data.videoId });
				query = '';
			} catch (err) {
				error = (err as Error).message;
			} finally {
				searching = false;
			}
		})();
	}

	function persistHistory(list: HistoryEntry[]) {
		const sorted = [...list].sort((a, b) => {
			if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
			return b.savedAt - a.savedAt;
		});
		history = sorted;
		try {
			localStorage.setItem('xs_music_history', JSON.stringify(sorted));
		} catch {
			/* ignore */
		}
	}

	function saveHistory(name: string, list: { title: string; artist: string; duration_ms: number }[]) {
		const existing = history.find((p) => p.name === name);
		const entry: HistoryEntry = {
			name,
			savedAt: Date.now(),
			pinned: existing?.pinned ?? false,
			tracks: list.map((t) => ({ title: t.title, artist: t.artist, duration_ms: t.duration_ms }))
		};
		persistHistory([entry, ...history.filter((p) => p.name !== name)].slice(0, 8));
	}

	function removeHistory(name: string) {
		persistHistory(history.filter((p) => p.name !== name));
	}

	function togglePinHistory(name: string) {
		persistHistory(
			history.map((p) => (p.name === name ? { ...p, pinned: !p.pinned } : p))
		);
	}

	async function applyTracks(
		name: string,
		list: { title: string; artist: string; duration_ms: number }[]
	) {
		error = null;
		playlistName = name;
		current = -1;
		playing = false;
		const built: Track[] = list.map((t, i) => ({
			index: i,
			title: t.title,
			artist: t.artist,
			duration_ms: t.duration_ms || 0,
			status: 'pending' as TrackStatus
		}));
		tracks = built;
		saveHistory(name, list);
		void preload(built);
	}

	async function loadPlaylist() {
		if (loading) return;
		error = null;
		loading = true;
		try {
			const res = await fetch(`/api/playlist?url=${encodeURIComponent(url)}`);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'load failed');
			await applyTracks(data.name, data.tracks);
		} catch (err) {
			error = (err as Error).message;
		} finally {
			loading = false;
		}
	}

	async function loadPreset(preset: Preset) {
		if (loading) return;
		await applyTracks(preset.name, preset.tracks.map(parseLine));
	}

	async function loadHistoryEntry(entry: HistoryEntry) {
		if (loading) return;
		await applyTracks(entry.name, entry.tracks);
	}

	async function searchAndPlay(q: string) {
		const term = q.trim();
		if (!term || searching) return;
		searching = true;
		error = null;
		try {
			const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
			const data = (await res.json()) as SearchResult & { error?: string };
			if (!res.ok) throw new Error(data.error || 'search failed');
			const track: Track = {
				index: 0,
				title: data.title ?? term,
				artist: data.channel ?? '',
				duration_ms: (data.duration ?? 0) * 1000,
				videoId: data.videoId,
				status: 'ready'
			};
			playlistName = `Search: ${term}`;
			tracks = [track];
			current = 0;
			playing = true;
			query = '';
			recordSong({ title: track.title, artist: track.artist, videoId: data.videoId, savedAt: Date.now() });
		} catch (err) {
			error = (err as Error).message;
		} finally {
			searching = false;
		}
	}

	function playIndex(index: number) {
		const track = tracks[index];
		if (!track || track.status !== 'ready' || !track.videoId) return;
		if (index === current) {
			if (!audioEl) return;
			if (audioEl.paused) void audioEl.play();
			else audioEl.pause();
			return;
		}
		current = index;
		playing = true;
	}

	function step(delta: number) {
		const target = current + delta;
		if (target >= 0 && target < tracks.length) {
			playIndex(target);
		}
	}

	const currentTrack = $derived(current >= 0 ? tracks[current] : undefined);
	const videoId = $derived(currentTrack?.status === 'ready' ? currentTrack?.videoId : undefined);
	const currentSource = $derived(videoId ? `/api/stream/${videoId}` : undefined);
	const totalDurationMs = $derived(tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0));

	function saveVibes(list: Preset[]) {
		vibes = list;
		try {
			localStorage.setItem('xs_music_vibes', JSON.stringify(list));
		} catch {
			/* ignore */
		}
	}

	function startAddVibe() {
		editVibeKey = null;
		vibeName = '';
		vibeTracks = '';
		vibeEditorOpen = true;
	}

	function startEditVibe(index: number) {
		const p = vibes[index];
		if (!p) return;
		editVibeKey = index;
		vibeName = p.name;
		vibeTracks = p.tracks.join('\n');
		vibeEditorOpen = true;
	}

	function saveVibe() {
		const name = vibeName.trim();
		const list = vibeTracks
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);
		if (!name || list.length === 0) return;
		if (editVibeKey !== null) {
			saveVibes(vibes.map((p, i) => (i === editVibeKey ? { name, tracks: list } : p)));
		} else {
			saveVibes([...vibes, { name, tracks: list }]);
		}
		editVibeKey = null;
		vibeName = '';
		vibeTracks = '';
		vibeEditorOpen = false;
	}

	function removeVibe(index: number) {
		saveVibes(vibes.filter((_, i) => i !== index));
		if (editVibeKey === index) {
			editVibeKey = null;
			vibeName = '';
			vibeTracks = '';
		}
	}

	$effect(() => {
		if (videoId && currentTrack) {
			progress = 0;
			duration = 0;
			lastTime = -1;
			if (audioEl && audioEl.paused) void audioEl.play().catch(() => {});
		}
	});

	$effect(() => {
		const onKey = (e: KeyboardEvent) => {
			const el = e.target as HTMLElement;
			if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable) return;
			const toggle = () => {
				if (!audioEl) return;
				if (audioEl.paused) void audioEl.play();
				else audioEl.pause();
			};
			switch (e.key) {
				case ' ':
				case 'MediaPlayPause':
					e.preventDefault();
					toggle();
					break;
				case 'ArrowUp':
				case 'MediaTrackNext':
					e.preventDefault();
					step(1);
					break;
				case 'ArrowDown':
				case 'MediaTrackPrevious':
					e.preventDefault();
					step(-1);
					break;
				case 'ArrowRight':
					if (e.ctrlKey) {
						e.preventDefault();
						step(1);
					} else if (audioEl && audioEl.duration) {
						e.preventDefault();
						audioEl.currentTime = Math.min(audioEl.duration, audioEl.currentTime + 10);
					}
					break;
				case 'ArrowLeft':
					if (e.ctrlKey) {
						e.preventDefault();
						step(-1);
					} else if (audioEl && audioEl.duration) {
						e.preventDefault();
						audioEl.currentTime = Math.max(0, audioEl.currentTime - 10);
					}
					break;
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

<main class="app" id="main" class:wide={history.length > 0 || songs.length > 0}>
	<a class="skip-link" href="#main"> Skip to content </a>

	<div class="layout-home" class:active={history.length > 0 || songs.length > 0}>
		{#if history.length > 0 || songs.length > 0}
			<aside class="home-side">
				{#if history.length > 0}
					<div class="side-group">
						<div class="section-label">Vibes</div>
						<div class="side-scroll">
							{#each history as h}
								<div class="history-card">
									<button
										class="song-main"
										disabled={loading}
										onclick={() => loadHistoryEntry(h)}
									>
										<span class="history-name">{h.name}</span>
										<span class="history-meta">
											{h.tracks.length} tracks · {fmt(h.tracks.reduce((sum, t) => sum + (t.duration_ms || 0), 0))}
										</span>
									</button>
									<div class="song-actions">
										<button
											class="song-act"
											class:pinned={h.pinned}
											title={h.pinned ? 'Unpin' : 'Pin to top'}
											onclick={() => togglePinHistory(h.name)}
										>
											{h.pinned ? 'Unpin' : 'Pin'}
										</button>
										<button
											class="song-act song-del"
											title="Delete"
											onclick={() => (confirmDel = { label: h.name, fn: () => removeHistory(h.name) })}
										>
											Delete
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
				{#if songs.length > 0}
					<div class="side-group">
						<div class="section-label">Recent Plays</div>
						<div class="side-scroll">
							{#each songs as s, i}
								<div class="history-card">
									<button class="song-main" onclick={() => playSong(s)}>
										<span class="history-name">{s.title}</span>
										<span class="history-meta">{s.artist || 'Unknown artist'}</span>
									</button>
									<div class="song-actions">
										<button
											class="song-act"
											title="Add to queue"
											onclick={() => enqueueTrack(s)}
										>
											Queue
										</button>
										<button
											class="song-act"
											class:pinned={s.pinned}
											title={s.pinned ? 'Unpin' : 'Pin to top'}
											onclick={() => togglePin(i)}
										>
											{s.pinned ? 'Unpin' : 'Pin'}
										</button>
										<button
											class="song-act song-del"
											title="Delete"
											onclick={() => (confirmDel = { label: s.title, fn: () => removeSong(i) })}
										>
											Delete
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</aside>
		{/if}

		<div class="home-main">
	<header class="header">
		<div class="header-top">
			<h1>🎧 xSoya Music</h1>
			<div class="auth">
				{#if auth?.loggedIn}
					<a class="auth-btn" href="/api/auth/logout">Log out</a>
				{:else if auth?.configured}
					<a class="auth-btn" href="/api/auth/login">Log in with Spotify</a>
				{:else}
					<span class="auth-hint">Spotify login not configured</span>
				{/if}
			</div>
		</div>

		<div class="load-row">
			<textarea
				bind:value={url}
				rows={2}
				placeholder="Paste a Spotify playlist link…&#10;…or a multi-line track list (Artist - Title per line)"
			></textarea>
			<button class="btn-primary" onclick={loadPlaylist} disabled={loading || !url.trim()}>
				{loading ? 'Loading…' : 'Load'}
			</button>
		</div>

		<div class="search-row">
			<input
				bind:value={query}
				onkeydown={(e) => {
					if (e.key === 'Enter') void searchAndPlay(query);
				}}
				placeholder="Search any song and play it instantly…"
			/>
			<button
				class="btn-primary"
				onclick={() => void searchAndPlay(query)}
				disabled={searching || !query.trim()}
			>
				{searching ? 'Searching…' : 'Play'}
			</button>
			<button
				class="btn-ghost"
				onclick={() => void searchAndQueue(query)}
				disabled={searching || !query.trim()}
				title="Add search result to queue"
			>
				+ Queue
			</button>
		</div>

		<div class="presets">
			<span class="section-label">Vibes</span>
			{#each vibes as p, i}
				<div class="preset-wrap">
					<button class="preset" disabled={loading} onclick={() => loadPreset(p)}>
						{p.name}
					</button>
					<button class="preset-del" onclick={() => removeVibe(i)} title="Remove {p.name}">
						✕
					</button>
				</div>
			{/each}
			<button class="preset preset-edit" onclick={() => (vibeEditorOpen = true)}>
				⚙ Edit vibes
			</button>
		</div>

		{#if vibeEditorOpen}
			<div class="vibe-editor">
				<div class="vibe-editor-head">
					<span class="section-label">{editVibeKey !== null ? 'Edit vibe' : 'Add a vibe'}</span>
					<button class="vibe-close" onclick={() => (vibeEditorOpen = false)} title="Close editor">
						✕
					</button>
				</div>
				<input class="vibe-name" bind:value={vibeName} placeholder="Vibe name…" />
				<textarea
					class="vibe-tracks"
					bind:value={vibeTracks}
					rows={3}
					placeholder="One track per line:&#10;Artist - Title"
				></textarea>
				<div class="vibe-actions">
					<button class="preset" onclick={saveVibe} disabled={!vibeName.trim() || !vibeTracks.trim()}>
						{editVibeKey !== null ? 'Save changes' : 'Add vibe'}
					</button>
					<span class="vibe-hint">Saved in this browser</span>
				</div>
				{#if vibes.length > 0}
					<div class="vibe-list">
						{#each vibes as p, i}
							<div class="vibe-row">
								<div class="vibe-info">
									<span class="vibe-row-name">{p.name}</span>
									<span class="vibe-row-meta">{p.tracks.length} tracks</span>
								</div>
								<div class="vibe-row-actions">
									<button class="vibe-btn" onclick={() => startEditVibe(i)}>Edit</button>
									<button class="vibe-btn vibe-del" onclick={() => removeVibe(i)}>Remove</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/if}

		{#if error}
			<p class="error">{error}</p>
		{/if}
		{#if playlistName}
			<p class="playlist-name">{playlistName}</p>
		{/if}
	</header>

	{#if tracks.length > 0}
		<div class="stats">
			<span><b>{tracks.length}</b> tracks</span>
			<span><b>{fmtTotal(totalDurationMs / 1000)}</b> total</span>
			<span class="stats-accent">Listened <b>{fmtTotal(sessionSeconds)}</b> total</span>
		</div>
	{/if}

	{#if currentTrack}
		<section class="hero">
			<div class={'disc'} class:spin={playing}>
				<span class="hero-initial">{(currentTrack.title || '?').charAt(0).toUpperCase()}</span>
			</div>
			<div class="hero-meta">
				<span class="hero-kicker">{playlistName ?? 'Now playing'}</span>
				<div class="hero-title">{currentTrack.title}</div>
				<div class="hero-artist">{currentTrack.artist || 'Unknown artist'}</div>
			</div>
		</section>
	{/if}

	{#if tracks.length === 0}
		<div class="welcome-grid">
			<section class="track-list">
			<div class="empty empty-visual">
				{#if loading}
					{#each [0, 1, 2] as n}
						<div class="skeleton">
							<span class="s-num"></span>
							<span class="s-body">
								<span class="s-title"></span>
								<span class="s-sub"></span>
							</span>
							<span class="s-dur"></span>
						</div>
					{/each}
				{:else}
					<div class="disc-empty">
						<svg width="130" height="130" viewBox="0 0 130 130" fill="none" aria-hidden="true">
							<circle cx="65" cy="65" r="60" fill="#0d1118" stroke="#242e40" stroke-width="2"></circle>
							<circle cx="65" cy="65" r="58" fill="none" stroke="#1a2030" stroke-width="1"></circle>
							<circle cx="65" cy="65" r="46" fill="#151b28"></circle>
							<circle cx="65" cy="65" r="40" fill="none" stroke="#2a3547" stroke-width="2" stroke-dasharray="2 5"></circle>
							<circle cx="65" cy="65" r="34" fill="none" stroke="#2a3547" stroke-width="2" stroke-dasharray="2 5"></circle>
							<circle cx="65" cy="65" r="28" fill="none" stroke="#2a3547" stroke-width="2" stroke-dasharray="2 5"></circle>
							<circle cx="65" cy="65" r="14" fill="#202738"></circle>
							<circle cx="65" cy="65" r="6" fill="#b48cff"></circle>
							<circle cx="65" cy="65" r="2.5" fill="#0b0e14"></circle>
							<path d="M98 76v10M98 76l-9 4m9-26v10M89 54l9 4" stroke="#b48cff" stroke-width="2.4" stroke-linecap="round"></path>
						</svg>
					</div>
					<p>Paste a Spotify playlist, pick a vibe above, or search any song to start.</p>
				{/if}
			</div>
			</section>
		</div>
	{:else}
		<section class="track-list">
			{#each tracks as t}
			<div
				class={'track' + (current === t.index ? ' current' : '') + (t.status === 'error' ? ' failed' : '')}
				role="button"
				tabindex="0"
				style={`animation-delay: ${Math.min(t.index, 12) * 40}ms`}
				onclick={() => playIndex(t.index)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						playIndex(t.index);
					}
				}}
			>
				<span class="index">
					{#if current === t.index}
						<span class={'eq'} class:paused={!playing}>
							<i></i>
							<i></i>
							<i></i>
						</span>
					{:else}
						{String(t.index + 1).padStart(2, '0')}
					{/if}
				</span>
				<div class="meta">
					<div class="title">{t.title}</div>
					<div class="artist">{t.artist}</div>
				</div>
				{#if t.status === 'error'}
					<span class="badge error-badge" title={t.error}>! unfound</span>
				{:else}
					<span class="duration">{fmt(t.duration_ms)}</span>
				{/if}
				<span class={`badge st-${t.status}`} title={`status: ${t.status}`}>
					{statusGlyph[t.status]}
				</span>
			</div>
		{/each}
		</section>
	{/if}

	{#if queue.length > 0}
		<section class="queue-list">
			<div class="queue-head">
				<span class="section-label">Up Next · {queue.length}</span>
				<button class="queue-clear" onclick={() => (queue = [])}>
					Clear
				</button>
			</div>
			{#each queue as q, qi}
				<div
					class={'queue-track' + (q.status === 'error' ? ' failed' : '') + (dragOver === qi ? ' drag-over' : '') + (dragging === qi ? ' dragging' : '')}
					draggable="true"
					role="listitem"
					ondragstart={(e) => {
						dragging = qi;
						e.dataTransfer?.setData('text/plain', String(qi));
					}}
					ondragover={(e) => {
						e.preventDefault();
						dragOver = qi;
					}}
					ondragleave={() => {
						if (dragOver === qi) dragOver = -1;
					}}
					ondrop={(e) => {
						e.preventDefault();
						const from = Number(e.dataTransfer?.getData('text/plain') ?? dragging);
						if (from >= 0 && from !== qi) reorderQueue(from, qi);
						dragging = -1;
						dragOver = -1;
					}}
					ondragend={() => {
						dragging = -1;
						dragOver = -1;
					}}
				>
					<span class="drag-handle" title="Drag to reorder">⠿</span>
					<span class="index">{String(qi + 1).padStart(2, '0')}</span>
					<div class="meta">
						<div class="title">{q.title}</div>
						<div class="artist">{q.artist}</div>
					</div>
					{#if q.status === 'error'}
						<span class="badge error-badge" title={q.error}>! unfound</span>
					{/if}
					<button class="queue-x" onclick={() => q.qid !== undefined && removeFromQueue(q.qid)} title="Remove from queue">
						✕
					</button>
				</div>
			{/each}
		</section>
	{/if}
		</div>
	</div>

	<footer class="player">
		<audio
			bind:this={audioEl}
			src={currentSource}
			autoplay
			onplay={() => (playing = true)}
			onpause={() => (playing = false)}
			onended={() => (queue.length > 0 ? playNextQueued() : step(1))}
			ontimeupdate={(e) => {
				const el = e.currentTarget;
				progress = (el.currentTime / el.duration) * 100 || 0;
				const t = el.currentTime;
				if (lastTime >= 0 && t > lastTime) {
					const delta = t - lastTime;
					if (delta < 10) {
						sessionRef += delta;
						sessionSeconds = sessionRef;
						try {
							localStorage.setItem('xs_music_total', String(sessionRef));
						} catch {
							/* ignore */
						}
					}
				}
				lastTime = t;
			}}
			onloadedmetadata={(e) => {
				duration = e.currentTarget.duration;
				lastTime = 0;
			}}
		></audio>
		<div class="player-controls">
			<div class={'disc'} class:spin={playing} class:idle={!currentTrack} title={currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : 'Nothing playing'}></div>
			<button onclick={() => step(-1)} disabled={current <= 0} class="ctl" title="Previous (Ctrl+← / ↓)">
				⏮
			</button>
			<button onclick={() => playIndex(current)} disabled={!videoId} class="ctl play" title={playing ? 'Pause (Space)' : 'Play (Space)'}>
				{playing ? '⏸' : '▶'}
			</button>
			<button
				onclick={() => step(1)}
				disabled={current < 0 || current >= tracks.length - 1}
				class="ctl"
				title="Next (Ctrl+→ / ↑)"
			>
				⏭
			</button>
			{#if videoId && currentTrack}
				<a
					class="ctl"
					href={`/api/download/${videoId}?name=${encodeURIComponent(`${currentTrack.artist} - ${currentTrack.title}`)}`}
					title="Download"
				>
					⤓
				</a>
			{/if}
			<div class="now-playing">
				{currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : 'Nothing playing'}
			</div>
		</div>
		<div class="seek">
			<span>{fmt((progress / 100) * duration * 1000)}</span>
			<input
				type="range"
				min="0"
				max="1000"
				value={Math.round(progress * 10)}
				class="seekbar"
				style={`background: linear-gradient(to right, var(--accent) ${progress}%, var(--border) ${progress}%)`}
				oninput={(e) => {
					if (audioEl && duration) {
						audioEl.currentTime = (Number(e.currentTarget.value) / 10 / 100) * duration;
					}
				}}
				disabled={!videoId}
				title="Seek (←/→ ±10s)"
			/>
			<span>{fmt(duration * 1000)}</span>
		</div>
		<p class="keys-hint">Space: play/pause · ←/→: seek ±10s · Ctrl+←/→ : prev/next track</p>
	</footer>

	{#if confirmDel}
		<div class="toast" role="dialog" aria-live="polite">
			<p class="toast-text">
				Delete <b>“{confirmDel.label}”</b>? This can't be undone.
			</p>
			<div class="toast-actions">
				<button class="toast-btn" onclick={() => (confirmDel = null)}>Cancel</button>
				<button
					class="toast-btn toast-confirm"
					onclick={() => {
						confirmDel?.fn();
						confirmDel = null;
					}}
				>
					Delete
				</button>
			</div>
		</div>
	{/if}
</main>