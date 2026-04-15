<script module lang="ts">
	const imageLoadCache = new Map<string, Promise<HTMLImageElement>>();

	function loadPosterImage(url: string): Promise<HTMLImageElement> {
		const cached = imageLoadCache.get(url);
		if (cached) return cached;

		const pending = new Promise<HTMLImageElement>((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => resolve(img);
			img.onerror = () => {
				imageLoadCache.delete(url);
				reject(new Error(`Failed to load poster image: ${url}`));
			};
			img.src = url;
		});

		imageLoadCache.set(url, pending);
		return pending;
	}
</script>

<script lang="ts">
	let { title, posterUrl }: { title: string; posterUrl: string } = $props();

	let canvasEl = $state<HTMLCanvasElement>();
	let visible = $state(false);
	let posterImage: HTMLImageElement | null = null;

	function findOptimalFontSize(
		ctx: CanvasRenderingContext2D,
		text: string,
		maxWidth: number,
		maxHeight: number
	): { fontSize: number; lines: string[] } {
		let lo = 12;
		let hi = 200;
		let bestSize = lo;
		let bestLines: string[] = [text];

		while (lo <= hi) {
			const mid = Math.floor((lo + hi) / 2);
			ctx.font = `800 ${mid}px "Inter Variable", "Inter", sans-serif`;

			const lines = wrapText(ctx, text, maxWidth * 0.85);
			const lineHeight = mid * 1.1;
			const totalHeight = lines.length * lineHeight;

			if (totalHeight <= maxHeight * 0.9) {
				bestSize = mid;
				bestLines = lines;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}

		return { fontSize: bestSize, lines: bestLines };
	}

	function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
		const words = text.split(' ');
		const lines: string[] = [];
		let currentLine = '';

		for (const word of words) {
			const testLine = currentLine ? `${currentLine} ${word}` : word;
			const metrics = ctx.measureText(testLine);

			if (metrics.width > maxWidth && currentLine) {
				lines.push(currentLine);
				currentLine = word;
			} else {
				currentLine = testLine;
			}
		}
		if (currentLine) lines.push(currentLine);

		return lines;
	}

	function render() {
		if (!canvasEl || !posterImage) return;

		const rect = canvasEl.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		canvasEl.width = rect.width * dpr;
		canvasEl.height = rect.height * dpr;

		const ctx = canvasEl.getContext('2d');
		if (!ctx) return;
		ctx.scale(dpr, dpr);

		const w = rect.width;
		const h = rect.height;

		// Step 1: Fill with paper-white background
		ctx.fillStyle = '#f5f2eb';
		ctx.fillRect(0, 0, w, h);

		// Step 2: Draw text as mask
		const { fontSize, lines } = findOptimalFontSize(ctx, title.toUpperCase(), w, h);
		ctx.font = `800 ${fontSize}px "Inter Variable", "Inter", sans-serif`;
		ctx.fillStyle = '#000';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';

		const lineHeight = fontSize * 1.1;
		const totalTextHeight = lines.length * lineHeight;
		const startY = (h - totalTextHeight) / 2;
		const startX = w * 0.075;

		for (let i = 0; i < lines.length; i++) {
			ctx.fillText(lines[i], startX, startY + i * lineHeight);
		}

		// Step 3: Composite poster image through the text
		ctx.globalCompositeOperation = 'source-in';
		ctx.drawImage(posterImage, 0, 0, w, h);
		ctx.globalCompositeOperation = 'source-over';

		visible = true;
	}

	$effect(() => {
		// Re-run when posterUrl or title changes
		const url = posterUrl;
		void title;
		visible = false;
		posterImage = null;
		let cancelled = false;

		loadPosterImage(url)
			.then((img) => {
				if (cancelled) return;
				posterImage = img;
				render();
			})
			.catch(() => {
				if (cancelled) return;
				visible = false;
			});

		return () => {
			cancelled = true;
		};
	});
</script>

<canvas
	bind:this={canvasEl}
	class="absolute inset-0 w-full h-full transition-opacity"
	class:opacity-0={!visible}
	class:opacity-100={visible}
	style="transition-duration: var(--duration-slow);"
></canvas>
