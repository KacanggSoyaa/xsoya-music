import { json, type RequestEvent } from '@sveltejs/kit';

import {
	SESSION_COOKIE,
	SESSION_MAX_AGE,
	STATE_COOKIE,
	exchangeCode,
	isConfigured,
	redirectUri
} from '$lib/spotify.js';

function redirect(event: RequestEvent, location: string): Response {
	return new Response(null, { status: 302, headers: { location } });
}

export async function GET(event: RequestEvent) {
	const code = event.url.searchParams.get('code');
	const state = event.url.searchParams.get('state');
	const error = event.url.searchParams.get('error');
	const storedState = event.cookies.get(STATE_COOKIE);

	if (error) {
		return redirect(event, `/?authError=${encodeURIComponent(error)}`);
	}
	if (!isConfigured()) {
		return redirect(event, '/?authError=not_configured');
	}
	if (!code || !state || state !== storedState) {
		return redirect(event, '/?authError=invalid_state');
	}

	try {
		const session = await exchangeCode(code, redirectUri(event));
		const res = redirect(event, '/');
		event.cookies.set(SESSION_COOKIE, JSON.stringify(session), {
			httpOnly: true,
			path: '/',
			maxAge: SESSION_MAX_AGE,
			sameSite: 'lax'
		});
		event.cookies.delete(STATE_COOKIE, { path: '/' });
		return res;
	} catch (err) {
		return json({ error: `Login failed: ${(err as Error).message}` }, { status: 502 });
	}
}