<script lang="ts">
	import '../lib/styles/global.css';
	import '@fontsource/space-grotesk/400.css';
	import '@fontsource/space-grotesk/500.css';
	import '@fontsource/space-grotesk/600.css';
	import '@fontsource/space-grotesk/700.css';
	import AutoHost from '$lib/components/AutoHost.svelte';
	import Starfield from '$lib/components/Starfield.svelte';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<title>xSoya Music</title>
	<meta name="description" content="Free music streaming from your Spotify playlists" />
	<meta name="theme-color" content="#05070d" />
	<link rel="icon" href={favicon} />
</svelte:head>

<AutoHost />
<Starfield />
{@render children()}