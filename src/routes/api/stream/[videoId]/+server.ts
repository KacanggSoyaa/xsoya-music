import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

const PASSTHROUGH = [
	'content-type',
	'content-length',
	'content-range',
	'accept-ranges',
	'cache-control',
	'etag'
];

export async function GET(event: RequestEvent) {
	const videoId = event.params.videoId;
	if (!videoId || !/^[A-Za-z0-9_-]{5,20}$/.test(videoId)) {
		return new Response('bad id', { status: 400 });
	}
	const server = env.MUSIC_SERVER || 'http://127.0.0.1:8000';
	try {
		const headers: Record<string, string> = {};
		const range = event.request.headers.get('range');
		if (range) headers['range'] = range;
		const upstream = await fetch(`${server}/stream/${videoId}`, {
			headers,
			cache: 'no-store'
		});
		const outHeaders = new Headers();
		for (const name of PASSTHROUGH) {
			const value = upstream.headers.get(name);
			if (value) outHeaders.set(name, value);
		}
		return new Response(upstream.body, {
			status: upstream.status,
			headers: outHeaders
		});
	} catch {
		return new Response('Music service unreachable', { status: 502 });
	}
}