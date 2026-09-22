export type SearchResult = {
	videoId: string;
	title: string;
	duration: number | null;
	channel?: string;
};

export type TrackStatus = 'pending' | 'searching' | 'ready' | 'error';

export type Track = {
	index: number;
	title: string;
	artist: string;
	duration_ms: number;
	videoId?: string;
	status: TrackStatus;
	error?: string;
	qid?: number;
};

export type HistoryEntry = {
	name: string;
	savedAt: number;
	pinned?: boolean;
	tracks: { title: string; artist: string; duration_ms: number }[];
};

export type Preset = { name: string; tracks: string[] };

export type SongEntry = {
	title: string;
	artist: string;
	videoId?: string;
	savedAt: number;
	pinned?: boolean;
};

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

export function fmt(ms: number): string {
	if (!ms || ms <= 0) return '0:00';
	const total = Math.floor(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}

export function fmtTotal(sec: number): string {
	if (!isFinite(sec) || sec <= 0) return '0:00';
	const total = Math.floor(sec);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
	const ss = String(s).padStart(2, '0');
	return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}

export function parseLine(line: string) {
	const parts = line.split(/\s+[-–—]\s+|\t+/);
	if (parts.length >= 2) {
		return { title: parts[0].trim(), artist: parts.slice(1).join(' ').trim(), duration_ms: 0 };
	}
	return { title: line.trim(), artist: '', duration_ms: 0 };
}

export const statusGlyph: Record<TrackStatus, string> = {
	pending: '•',
	searching: '…',
	ready: '✔',
	error: '!'
};

export const DEFAULT_VIBES: Preset[] = [
	{
		name: 'Lo-fi Chill',
		tracks: [
			'Dreams - Joji',
			'Come and Get Your Love - Redbone',
			'Cigarette Daydreams - Cage the Elephant',
			'Lost in Japan - Shawn Mendes',
			'After Dark - Mr.Kitty',
			'Sunset Lover - Petit Biscuit',
			'Electric Feel - MGMT',
			'Chamber of Reflection - Mac DeMarco'
		]
	},
	{
		name: 'Workout',
		tracks: [
			'Till I Collapse - Eminem',
			'Stronger - Kanye West',
			'Eye of the Tiger - Survivor',
			'Lose Yourself - Eminem',
			'The Search - NF',
			'Power - Kanye West',
			'Remember the Name - Fort Minor',
			'Uptown Funk - Mark Ronson'
		]
	},
	{
		name: 'Deep Focus',
		tracks: [
			'Clair de Lune - Claude Debussy',
			'River Flows in You - Yiruma',
			'Experience - Ludovico Einaudi',
			'Weightless - Marconi Union',
			'Moonlight Sonata - Beethoven',
			'Nuvole Bianche - Ludovico Einaudi',
			"Comptine d'un autre été - Yann Tiersen",
			'Gymnopédie No. 1 - Erik Satie'
		]
	}
];

export function loadVibes(): Preset[] {
	try {
		const raw = localStorage.getItem('xs_music_vibes');
		if (raw) {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed) && parsed.length) return parsed as Preset[];
		}
	} catch {
		/* ignore */
	}
	return DEFAULT_VIBES;
}