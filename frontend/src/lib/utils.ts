import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function formatTime(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
		timeZone: 'Europe/London'
	});
}

export function formatDate(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		timeZone: 'Europe/London'
	}).toUpperCase();
}

export function toLondonDateStr(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); // YYYY-MM-DD
}

export function formatScreeningDate(date: Date | string): string {
	const d = typeof date === 'string' ? new Date(date + (typeof date === 'string' && !date.includes('T') ? 'T00:00:00' : '')) : date;
	const todayStr = toLondonDateStr(new Date());
	const targetStr = typeof date === 'string' && !date.includes('T') ? date : toLondonDateStr(d);

	if (targetStr === todayStr) return 'TODAY';

	// Check tomorrow
	const tomorrow = new Date();
	tomorrow.setDate(tomorrow.getDate() + 1);
	const tomorrowStr = toLondonDateStr(tomorrow);
	if (targetStr === tomorrowStr) return 'TOMORROW';

	return formatDate(d);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => void>(
	fn: T,
	ms: number
): (...args: Parameters<T>) => void {
	let timer: ReturnType<typeof setTimeout>;
	return (...args: Parameters<T>) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};
}

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
	const groups: Record<string, T[]> = {};
	for (const item of items) {
		const key = keyFn(item);
		(groups[key] ??= []).push(item);
	}
	return groups;
}
