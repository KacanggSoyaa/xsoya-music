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