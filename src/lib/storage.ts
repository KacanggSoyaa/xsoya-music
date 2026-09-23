import type { SongEntry } from './types.js';

export const SONGS_KEY = 'xs_music_songs';

export function loadSongs(): SongEntry[] {
	try {
		const raw = localStorage.getItem(SONGS_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed)) return (parsed as SongEntry[]).slice(0, 5);
		}
	} catch {
		/* ignore */
	}
	return [];
}