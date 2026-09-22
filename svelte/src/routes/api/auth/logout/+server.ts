import type { RequestEvent } from '@sveltejs/kit';

import { SESSION_COOKIE } from '$lib/spotify.js';

export async function GET(event: RequestEvent) {
	event.cookies.delete(SESSION_COOKIE, { path: '/' });
	return new Response(null, {
		status: 302,
		headers: { location: '/' }
	});
}