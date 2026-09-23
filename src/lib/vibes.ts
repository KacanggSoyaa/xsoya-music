import type { Preset } from './types.js';

export const DEFAULT_VIBES: Preset[] = [
	{
		name: 'Lo-fi Chill',
		tracks: [
			'Dreams - Joji',
			'Come and Get Your Love - Redbone',
			'Cigarette Daydreams - Cage the Elephant',
			'Lost in Japan - Shawn Mendes',
			'After Dark - Mr.Kitty',
			'Sunset Lover - Petit Biscuit',
			'Electric Feel - MGMT',
			'Chamber of Reflection - Mac DeMarco'
		]
	},
	{
		name: 'Workout',
		tracks: [
			'Till I Collapse - Eminem',
			'Stronger - Kanye West',
			'Eye of the Tiger - Survivor',
			'Lose Yourself - Eminem',
			'The Search - NF',
			'Power - Kanye West',
			'Remember the Name - Fort Minor',
			'Uptown Funk - Mark Ronson'
		]
	},
	{
		name: 'Deep Focus',
		tracks: [
			'Clair de Lune - Claude Debussy',
			'River Flows in You - Yiruma',
			'Experience - Ludovico Einaudi',
			'Weightless - Marconi Union',
			'Moonlight Sonata - Beethoven',
			'Nuvole Bianche - Ludovico Einaudi',
			"Comptine d'un autre été - Yann Tiersen",
			'Gymnopédie No. 1 - Erik Satie'
		]
	}
];

export function loadVibes(): Preset[] {
	try {
		const raw = localStorage.getItem('xs_music_vibes');
		if (raw) {
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed) && parsed.length) return parsed as Preset[];
		}
	} catch {
		/* ignore */
	}
	return DEFAULT_VIBES;
}