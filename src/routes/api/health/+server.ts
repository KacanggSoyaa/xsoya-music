import { env } from '$env/dynamic/private';
import { json } from '@sveltejs/kit';

export async function GET() {
	const server = env.MUSIC_SERVER || 'http://127.0.0.1:8000';
	try {
		const upstream = await fetch(`${server}/health`, {
			cache: 'no-store',
			signal: AbortSignal.timeout(3000)
		});
		if (!upstream.ok) return json({ ok: false }, { status: 503 });
		return json({ ok: true });
	} catch {
		return json({ ok: false }, { status: 503 });
	}
}
