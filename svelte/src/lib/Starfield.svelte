<script lang="ts">
	let canvas: HTMLCanvasElement;

	type Star = {
		x: number;
		y: number;
		radius: number;
		speed: number;
		phase: number;
		brightness: number;
		parallax: number;
	};

	type Meteor = {
		x: number;
		y: number;
		length: number;
		speed: number;
		angle: number;
		opacity: number;
		trail: { x: number; y: number; opacity: number }[];
	};

	const STAR = '255,255,255';
	const NEBULA = '142,100,255';
	const NEBULA2 = '0,160,255';
	const METEOR = '160,220,255';
	const MOON = '226,230,238';
	const MOON_SHADE = '160,168,182';
	const MARS = '226,94,66';
	const MARS_DARK = '156,52,36';

	$effect(() => {
		const el = canvas;
		if (!el) return;
		const ctx = el.getContext('2d');
		if (!ctx) return;

		let dpr = Math.min(window.devicePixelRatio || 1, 2);
		let w = 0;
		let h = 0;
		let stars: Star[] = [];
		let meteors: Meteor[] = [];
		let frame = 0;
		let scroll = 0;
		let reduced = false;
		let raf: number | null = null;

		const glow = (x: number, y: number, r: number, color: string, alpha: number) => {
			const g = ctx.createRadialGradient(x, y, 0, x, y, r);
			g.addColorStop(0, `rgba(${color}, ${alpha})`);
			g.addColorStop(1, `rgba(${color}, 0)`);
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();
		};

		const buildStars = () => {
			const count = Math.min(300, Math.floor((w * h) / 5500));
			stars = Array.from({ length: count }, (_, i) => {
				const layer = i % 3;
				const parallax = layer === 0 ? 0.03 : layer === 1 ? 0.08 : 0.16;
				return {
					x: Math.random() * w,
					y: Math.random() * h,
					radius: Math.random() * 1.4 + 0.4,
					speed: Math.random() * 0.02 + 0.005,
					phase: Math.random() * Math.PI * 2,
					brightness: Math.random() < 0.08 ? 0.9 : 0.35,
					parallax
				};
			});
		};

		const drawMoon = (x: number, y: number, r: number) => {
			glow(x, y, r * 2, MOON, 0.07);
			const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
			g.addColorStop(0, 'rgba(245,247,252,1)');
			g.addColorStop(0.7, `rgba(${MOON},1)`);
			g.addColorStop(1, `rgba(${MOON_SHADE},1)`);
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();

			const craters = [
				{ dx: -0.28, dy: -0.18, r: 0.13 },
				{ dx: 0.24, dy: -0.3, r: 0.1 },
				{ dx: 0.34, dy: 0.12, r: 0.17 },
				{ dx: -0.12, dy: 0.32, r: 0.11 },
				{ dx: -0.4, dy: 0.06, r: 0.08 },
				{ dx: 0.05, dy: 0.02, r: 0.06 }
			];
			for (const c of craters) {
				ctx.fillStyle = `rgba(${MOON_SHADE}, 0.45)`;
				ctx.beginPath();
				ctx.arc(x + c.dx * r, y + c.dy * r, c.r * r, 0, Math.PI * 2);
				ctx.fill();
				ctx.fillStyle = 'rgba(200,208,220,0.5)';
				ctx.beginPath();
				ctx.arc(x + c.dx * r - c.r * r * 0.25, y + c.dy * r - c.r * r * 0.25, c.r * r * 0.55, 0, Math.PI * 2);
				ctx.fill();
			}
		};

		const drawMars = (x: number, y: number, r: number) => {
			glow(x, y, r * 2.2, MARS, 0.08);
			const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
			g.addColorStop(0, 'rgba(255,165,120,1)');
			g.addColorStop(0.55, `rgba(${MARS},1)`);
			g.addColorStop(1, `rgba(${MARS_DARK},1)`);
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.fill();

			ctx.fillStyle = 'rgba(255,214,190,0.7)';
			ctx.beginPath();
			ctx.arc(x - r * 0.42, y - r * 0.48, r * 0.35, 0, Math.PI * 2);
			ctx.fill();

			const patches = [
				{ dx: 0.2, dy: 0.1, r: 0.3, a: 0.25 },
				{ dx: -0.05, dy: 0.3, r: 0.22, a: 0.2 },
				{ dx: 0.3, dy: -0.28, r: 0.18, a: 0.22 }
			];
			for (const p of patches) {
				ctx.fillStyle = `rgba(${MARS_DARK}, ${p.a})`;
				ctx.beginPath();
				ctx.arc(x + p.dx * r, y + p.dy * r, p.r * r, 0, Math.PI * 2);
				ctx.fill();
			}
		};

		const spawnMeteor = (): Meteor => ({
			x: Math.random() * w * 0.8 + w * 0.1,
			y: Math.random() * h * 0.4,
			length: Math.random() * 130 + 80,
			speed: Math.random() * 9 + 4,
			angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
			opacity: Math.random() * 0.7 + 0.3,
			trail: []
		});

		const resize = () => {
			dpr = Math.min(window.devicePixelRatio || 1, 2);
			w = window.innerWidth;
			h = window.innerHeight;
			el.width = Math.floor(w * dpr);
			el.height = Math.floor(h * dpr);
			el.style.width = `${w}px`;
			el.style.height = `${h}px`;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			buildStars();
		};

		const onScroll = () => {
			scroll = window.scrollY || window.pageYOffset || 0;
		};

		const draw = () => {
			frame += 1;
			ctx.clearRect(0, 0, w, h);

			const drift = scroll * 0.02;
			glow(w * 0.75, h * 0.72 - drift, Math.min(w, h) * 0.5, NEBULA, 0.05);
			glow(w * 0.2, h * 0.18 - drift, Math.min(w, h) * 0.4, NEBULA2, 0.04);

			drawMoon(w * 0.82, h * 0.16 - drift, Math.min(w, h) * 0.06);
			drawMars(w * 0.12, h * 0.22 - drift, Math.min(w, h) * 0.04);

			for (const s of stars) {
				const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(s.phase + frame * s.speed));
				const alpha = s.brightness * twinkle;
				const y = s.y - scroll * s.parallax;
				const wrapped = y < -10 ? h + 10 : y > h + 10 ? -10 : y;
				ctx.fillStyle = `rgba(${STAR}, ${alpha})`;
				ctx.beginPath();
				ctx.arc(s.x, wrapped, s.radius, 0, Math.PI * 2);
				ctx.fill();
			}

			if (Math.random() < 0.008 && meteors.length < 4) {
				meteors.push(spawnMeteor());
			}

			for (let i = meteors.length - 1; i >= 0; i--) {
				const m = meteors[i];
				m.x += Math.cos(m.angle) * m.speed;
				m.y += Math.sin(m.angle) * m.speed;
				m.trail.unshift({ x: m.x, y: m.y, opacity: m.opacity });
				if (m.trail.length > 20) m.trail.pop();

				for (let j = 0; j < m.trail.length; j++) {
					const t = m.trail[j];
					const fade = 1 - j / m.trail.length;
					ctx.lineWidth = 2 * fade;
					ctx.strokeStyle = `rgba(${METEOR}, ${fade * m.opacity * 0.7})`;
					ctx.beginPath();
					ctx.moveTo(t.x, t.y);
					ctx.lineTo(t.x + Math.cos(m.angle) * 4, t.y + Math.sin(m.angle) * 4);
					ctx.stroke();
				}

				glow(m.x, m.y, m.length * 0.045, METEOR, m.opacity * 0.35);
				ctx.fillStyle = `rgba(${METEOR}, ${m.opacity})`;
				ctx.beginPath();
				ctx.arc(m.x, m.y, 2, 0, Math.PI * 2);
				ctx.fill();

				if (m.x > w + 120 || m.y > h + 120) meteors.splice(i, 1);
			}
		};

		const loop = () => {
			draw();
			raf = requestAnimationFrame(loop);
		};

		reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		resize();
		window.addEventListener('resize', resize);
		window.addEventListener('scroll', onScroll, { passive: true });
		if (reduced) draw();
		else raf = requestAnimationFrame(loop);

		return () => {
			if (raf) cancelAnimationFrame(raf);
			window.removeEventListener('resize', resize);
			window.removeEventListener('scroll', onScroll);
		};
	});
</script>

<canvas bind:this={canvas} aria-hidden="true" class="starfield"></canvas>