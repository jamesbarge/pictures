export type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'late_night';
export type FilterProgrammingType = 'repertory' | 'new_release' | 'special_event' | 'preview';

export const DECADES = [
	'Pre-1950', '1950s', '1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s'
] as const;

export const COMMON_GENRES = [
	'Drama', 'Comedy', 'Horror', 'Documentary', 'Sci-Fi',
	'Action', 'Thriller', 'Romance', 'Animation'
] as const;

export const FORMAT_OPTIONS = [
	{ value: '35mm', label: '35MM' },
	{ value: '70mm', label: '70MM' },
	{ value: '70mm_imax', label: '70MM IMAX' },
	{ value: 'imax', label: 'IMAX' },
	{ value: 'imax_laser', label: 'IMAX LASER' },
	{ value: 'dolby_cinema', label: 'DOLBY CINEMA' },
	{ value: '4dx', label: '4DX' }
] as const;

export const TIME_PRESETS = [
	{ label: 'MORNING', from: 0, to: 11, description: 'Before 12pm' },
	{ label: 'AFTERNOON', from: 12, to: 16, description: '12pm – 5pm' },
	{ label: 'EVENING', from: 17, to: 20, description: '5pm – 9pm' },
	{ label: 'LATE', from: 21, to: 23, description: 'After 9pm' }
] as const;

export function formatHour(hour: number): string {
	if (hour === 0) return '12am';
	if (hour < 12) return `${hour}am`;
	if (hour === 12) return '12pm';
	return `${hour - 12}pm`;
}

export function formatTimeRange(from: number, to: number): string {
	return `${formatHour(from)}–${formatHour(to)}`;
}
