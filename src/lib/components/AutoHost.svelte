<script lang="ts">
	import { onMount } from 'svelte';

	onMount(() => {
		if (window.location.hostname === 'localhost') {
			window.location.replace(
				`http://127.0.0.1:3000${window.location.pathname}${window.location.search}`
			);
		}
	});
</script>