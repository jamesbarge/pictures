const LONDON_DATE_ISO = new Intl.DateTimeFormat('en-CA', {
	timeZone: 'Europe/London',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});

const LONDON_WEEKDAY_SHORT = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Europe/London',
	weekday: 'short'
});

const LONDON_DATE_TIME_PARTS = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Europe/London',
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hourCycle: 'h23'
});

const LONDON_CLOCK = new Intl.DateTimeFormat('en-GB', {
	timeZone: 'Europe/London',
	hour: '2-digit',
	minute: '2-digit',
	hourCycle: 'h23'
});

const DAY_BY_SHORT_NAME: Record<string, number> = {
	Sun: 0,
	Mon: 1,
	Tue: 2,
	Wed: 3,
	Thu: 4,
	Fri: 5,
	Sat: 6
};

function numericParts(
	formatter: Intl.DateTimeFormat,
	date: Date
): Record<string, number> {
	return Object.fromEntries(
		formatter
			.formatToParts(date)
			.filter((part) => part.type !== 'literal')
			.map((part) => [part.type, Number(part.value)])
	);
}

function londonOffsetMs(date: Date): number {
	const parts = numericParts(LONDON_DATE_TIME_PARTS, date);
	const londonAsUtc = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second
	);
	return londonAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function londonDateString(date: Date): string {
	return LONDON_DATE_ISO.format(date);
}

export function londonDayOfWeek(date: Date): number {
	return DAY_BY_SHORT_NAME[LONDON_WEEKDAY_SHORT.format(date)] ?? date.getUTCDay();
}

export function addDaysToDateString(yyyyMmDd: string, days: number): string {
	const date = new Date(`${yyyyMmDd}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

export function londonDateTime(
	yyyyMmDd: string,
	hour = 0,
	minute = 0
): Date {
	const [year, month, day] = yyyyMmDd.split('-').map(Number);
	const localAsUtc = Date.UTC(year, month - 1, day, hour, minute);
	const offsets = new Set([
		londonOffsetMs(new Date(localAsUtc - 12 * 60 * 60 * 1000)),
		londonOffsetMs(new Date(localAsUtc)),
		londonOffsetMs(new Date(localAsUtc + 12 * 60 * 60 * 1000))
	]);
	const matchingCandidates = [...offsets]
		.map((offset) => new Date(localAsUtc - offset))
		.filter((candidate) => {
			const parts = numericParts(LONDON_DATE_TIME_PARTS, candidate);
			return (
				parts.year === year &&
				parts.month === month &&
				parts.day === day &&
				parts.hour === hour &&
				parts.minute === minute
			);
		})
		.sort((a, b) => a.getTime() - b.getTime());

	if (matchingCandidates.length > 0) return matchingCandidates[0];

	// Non-existent civil times during the spring DST jump resolve forward.
	let candidate = new Date(localAsUtc);

	for (let attempt = 0; attempt < 2; attempt++) {
		candidate = new Date(localAsUtc - londonOffsetMs(candidate));
	}

	return candidate;
}

export function londonClock(date: Date): { hour: number; minute: number } {
	const parts = numericParts(LONDON_CLOCK, date);
	return { hour: parts.hour, minute: parts.minute };
}

export function nextLondonDateTime(
	hour: number,
	minute: number,
	now: Date = new Date(),
	forceNextDay = false
): Date {
	const today = londonDateString(now);
	const todayAtTime = londonDateTime(today, hour, minute);
	const targetDate =
		forceNextDay || todayAtTime <= now ? addDaysToDateString(today, 1) : today;
	return londonDateTime(targetDate, hour, minute);
}

export function londonWeekendRange(
	now: Date,
	offsetWeeks = 0
): { from: string; to: string } {
	const today = londonDateString(now);
	const day = londonDayOfWeek(now);
	let saturdayOffset = (6 - day + 7) % 7;
	if (offsetWeeks > 0) saturdayOffset += offsetWeeks * 7;
	if (offsetWeeks === 0 && day === 0) saturdayOffset = -1;

	const from = addDaysToDateString(today, saturdayOffset);
	return { from, to: addDaysToDateString(from, 1) };
}
