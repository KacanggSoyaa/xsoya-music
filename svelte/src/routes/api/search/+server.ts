import { json, type RequestEvent } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

const DEFAULT_MUSIC_SERVER = 'http://127.0.0.1:8000';

export async function GET(event: RequestEvent) {
	const q = event.url.searchParams.get('q') ?? '';
	if (!q.trim()) {
		return json({ error: 'missing q' }, { status: 400 });
	}
	const server = env.MUSIC_SERVER || DEFAULT_MUSIC_SERVER;
	try {
		const upstream = await fetch(`${server}/search?q=${encodeURIComponent(q)}`, {
			cache: 'no-store'
		});
		const body = await upstream.json();
		return json(body, { status: upstream.status });
	} catch (err) {
		return json(
			{ error: `Music service unreachable: ${(err as Error).message}` },
			{ status: 502 }
		);
	}
}