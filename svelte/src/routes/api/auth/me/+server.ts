import { json, type RequestEvent } from '@sveltejs/kit';

import { isConfigured, readSession } from '$lib/spotify.js';

export async function GET(event: RequestEvent) {
	const session = readSession(event);
	return json({
		loggedIn: Boolean(session),
		configured: isConfigured()
	});
}