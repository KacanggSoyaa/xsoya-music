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

export const statusGlyph: Record<TrackStatus, string> = {
	pending: '•',
	searching: '…',
	ready: '✔',
	error: '!'
};