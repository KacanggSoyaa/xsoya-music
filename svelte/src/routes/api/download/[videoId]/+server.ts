import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

const PASSTHROUGH = ['content-type', 'content-length', 'content-disposition'];

export async function GET(event: RequestEvent) {
	const videoId = event.params.videoId;
	if (!videoId || !/^[A-Za-z0-9_-]{5,20}$/.test(videoId)) {
		return new Response('bad id', { status: 400 });
	}
	const name = event.url.searchParams.get('name') ?? 'track';
	const server = env.MUSIC_SERVER || 'http://127.0.0.1:8000';
	try {
		const upstream = await fetch(
			`${server}/download/${videoId}?name=${encodeURIComponent(name)}`,
			{ cache: 'no-store' }
		);
		const headers = new Headers();
		for (const h of PASSTHROUGH) {
			const value = upstream.headers.get(h);
			if (value) headers.set(h, value);
		}
		return new Response(upstream.body, {
			status: upstream.status,
			headers
		});
	} catch {
		return new Response('Music service unreachable', { status: 502 });
	}
}