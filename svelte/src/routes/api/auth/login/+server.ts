import type { RequestEvent } from '@sveltejs/kit';

import { STATE_COOKIE, buildAuthUrl, isConfigured } from '$lib/spotify.js';

export async function GET(event: RequestEvent) {
	if (!isConfigured()) {
		return new Response(null, {
			status: 302,
			headers: { location: '/?authError=not_configured' }
		});
	}
	const state = crypto.randomUUID().replace(/-/g, '');
	event.cookies.set(STATE_COOKIE, state, {
		httpOnly: true,
		path: '/',
		maxAge: 600,
		sameSite: 'lax'
	});
	return new Response(null, {
		status: 302,
		headers: { location: buildAuthUrl(event, state) }
	});
}