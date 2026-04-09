import type { AceRequest, AceProps, Song } from './types.js';

const STORAGE_KEY = 'ace';

interface Saved {
	name: string;
	volume: number;
	format: string;
	dark: boolean;
	logsOpen: boolean;
	composeLmModel: string;
	currentGenId: string;
	request: AceRequest;
}

function load(): Saved {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw);
			return {
				name: parsed.name || '',
				volume: parsed.volume ?? 0.5,
				format: parsed.format === 'wav' ? 'wav' : 'mp3',
				dark: parsed.dark ?? true,
				logsOpen: parsed.logsOpen ?? true,
				composeLmModel: parsed.composeLmModel || parsed.request?.lm_model || '',
				currentGenId: parsed.currentGenId || '',
				request: parsed.request || { caption: '' }
			};
		}
	} catch {
		// corrupt or unavailable
	}
	return {
		name: '',
		volume: 0.5,
		format: 'mp3',
		dark: false,
		logsOpen: true,
		composeLmModel: '',
		currentGenId: '',
		request: { caption: '' }
	};
}

const saved = load();

export const app = $state({
	name: saved.name,
	volume: saved.volume,
	format: saved.format,
	dark: saved.dark,
	logsOpen: saved.logsOpen,
	composeLmModel: saved.composeLmModel,
	currentGenId: saved.currentGenId,
	request: saved.request as AceRequest,
	songs: [] as Song[],
	props: null as AceProps | null,
	toast: '' as string,
	toastOk: false,
	pendingRequests: [] as AceRequest[],
	pendingIndex: 0,
	refSongId: null as number | null,
	srcSongId: null as number | null,
	srcRangeStart: -1,
	srcRangeEnd: -1
});

let toastTimer = 0;

export function toast(msg: string, ms = 4000, ok = false) {
	clearTimeout(toastTimer);
	app.toast = msg;
	app.toastOk = ok;
	toastTimer = setTimeout(() => {
		app.toast = '';
	}, ms) as unknown as number;
}

// overwrite app.request, preserving model routing fields unless the
// incoming request provides them (non-empty string / non-null number).
export function setRequest(incoming: AceRequest) {
	if (!incoming.synth_model) incoming.synth_model = app.request.synth_model;
	if (!incoming.lm_model) incoming.lm_model = app.request.lm_model;
	if (!incoming.lora) incoming.lora = app.request.lora;
	if (incoming.lora_scale == null) incoming.lora_scale = app.request.lora_scale;
	app.request = incoming;
}

// persist on every change
$effect.root(() => {
	$effect(() => {
		const data: Saved = {
			name: app.name,
			volume: app.volume,
			format: app.format,
			dark: app.dark,
			logsOpen: app.logsOpen,
			composeLmModel: app.composeLmModel,
			currentGenId: app.currentGenId,
			request: app.request
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
	});
});
