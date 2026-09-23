import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

export const SESSION_COOKIE = 'xsoya_spotify';
export const STATE_COOKIE = 'xsoya_oauth_state';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type SpotifySession = {
	access_token: string;
	refresh_token?: string;
	expires_at: number;
};

export const SCOPES = [
	'playlist-read-private',
	'playlist-read-collaborative',
	'user-read-private'
].join(' ');

export function clientId(): string {
	return env.SPOTIFY_CLIENT_ID ?? '';
}

export function clientSecret(): string {
	return env.SPOTIFY_CLIENT_SECRET ?? '';
}

export function isConfigured(): boolean {
	return Boolean(clientId() && clientSecret());
}

export function redirectUri(event: RequestEvent): string {
	return env.SPOTIFY_REDIRECT_URI ?? `${event.url.origin}/api/auth/callback`;
}

function basicAuth(): string {
	return btoa(`${clientId()}:${clientSecret()}`);
}

export function buildAuthUrl(event: RequestEvent, state: string): string {
	const params = new URLSearchParams({
		client_id: clientId(),
		response_type: 'code',
		redirect_uri: redirectUri(event),
		scope: SCOPES,
		state,
		show_dialog: 'false'
	});
	return `https://accounts.spotify.com/authorize?${params.toString()}`;
}

export async function exchangeCode(code: string, redirect: string): Promise<SpotifySession> {
	const res = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${basicAuth()}`
		},
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirect
		}).toString(),
		cache: 'no-store'
	});
	if (!res.ok) {
		throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
	}
	const data = await res.json();
	return {
		access_token: data.access_token,
		refresh_token: data.refresh_token,
		expires_at: Date.now() + (data.expires_in ?? 3600) * 1000
	};
}

export async function refreshSession(session: SpotifySession): Promise<SpotifySession> {
	if (!session.refresh_token) throw new Error('no refresh token');
	const res = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${basicAuth()}`
		},
		body: new URLSearchParams({
			grant_type: 'refresh_token',
			refresh_token: session.refresh_token
		}).toString(),
		cache: 'no-store'
	});
	if (!res.ok) throw new Error(`refresh failed: ${res.status}`);
	const data = await res.json();
	return {
		access_token: data.access_token,
		refresh_token: data.refresh_token ?? session.refresh_token,
		expires_at: Date.now() + (data.expires_in ?? 3600) * 1000
	};
}

export function readSession(event: RequestEvent): SpotifySession | null {
	const raw = event.cookies.get(SESSION_COOKIE);
	if (!raw) return null;
	try {
		return JSON.parse(raw) as SpotifySession;
	} catch {
		return null;
	}
}

export async function getClientToken(): Promise<string | null> {
	if (!isConfigured()) return null;
	const res = await fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			Authorization: `Basic ${basicAuth()}`
		},
		body: 'grant_type=client_credentials',
		cache: 'no-store'
	});
	if (!res.ok) return null;
	const data = await res.json();
	return data.access_token ?? null;
}