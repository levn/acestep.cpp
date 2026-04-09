import type { AceRequest, AceProps } from './types.js';
import { FETCH_TIMEOUT_MS } from './config.js';

export interface LmResult {
	requests: AceRequest[];
	lmModel: string;
}

// result from synth endpoints: audio blobs + server-assigned generation ID
export interface SynthResult {
	blobs: Blob[];
	genId: string;
}

// POST lm: partial request -> enriched request(s)
export async function lmGenerate(req: AceRequest): Promise<LmResult> {
	const res = await fetch('lm', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(`${res.status} ${err.error || res.statusText}`);
	}
	return { requests: await res.json(), lmModel: res.headers.get('X-LM-Model') || '' };
}

// POST lm?mode=inspire: short caption -> metadata + lyrics (no codes)
export async function lmInspire(req: AceRequest): Promise<LmResult> {
	const res = await fetch('lm?mode=inspire', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(`${res.status} ${err.error || res.statusText}`);
	}
	return { requests: await res.json(), lmModel: res.headers.get('X-LM-Model') || '' };
}

// POST lm?mode=format: caption + lyrics -> metadata + lyrics (no codes)
export async function lmFormat(req: AceRequest): Promise<LmResult> {
	const res = await fetch('lm?mode=format', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req)
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(`${res.status} ${err.error || res.statusText}`);
	}
	return { requests: await res.json(), lmModel: res.headers.get('X-LM-Model') || '' };
}

// POST synth[?wav=1]: request(s) -> audio blob(s) + generation ID
// Metadata (seed, duration, etc) is already in the request JSON from /lm.
export async function synthGenerate(reqs: AceRequest[], format: string): Promise<SynthResult> {
	const url = format === 'wav' ? 'synth?wav=1' : 'synth';
	const body = reqs.length === 1 ? JSON.stringify(reqs[0]) : JSON.stringify(reqs);
	const res = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(`${res.status} ${err.error || res.statusText}`);
	}

	const genId = res.headers.get('X-Generation-Id') || '';
	const ct = res.headers.get('Content-Type') || '';

	// single track: raw audio body
	if (!ct.startsWith('multipart/')) {
		return { blobs: [await res.blob()], genId };
	}

	// batch: multipart/mixed, each part is raw audio
	const match = ct.match(/boundary=([^\s;]+)/);
	if (!match) throw new Error('Missing boundary in multipart response');
	const mime = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
	return { blobs: parseMultipart(new Uint8Array(await res.arrayBuffer()), match[1], mime), genId };
}

// POST synth (multipart): request(s) + source/reference audio -> audio blob(s) + generation ID.
// src_audio = source content (cover/lego/repaint), ref_audio = timbre reference.
export async function synthGenerateWithAudio(
	reqs: AceRequest[],
	srcAudio: Blob | null,
	refAudio: Blob | null,
	format: string
): Promise<SynthResult> {
	const url = format === 'wav' ? 'synth?wav=1' : 'synth';
	const body = reqs.length === 1 ? JSON.stringify(reqs[0]) : JSON.stringify(reqs);
	const form = new FormData();
	form.append('request', new Blob([body], { type: 'application/json' }), 'request.json');
	if (srcAudio) form.append('audio', srcAudio, 'src.audio');
	if (refAudio) form.append('ref_audio', refAudio, 'ref.audio');
	const res = await fetch(url, { method: 'POST', body: form });
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(`${res.status} ${err.error || res.statusText}`);
	}

	const genId = res.headers.get('X-Generation-Id') || '';
	const ct = res.headers.get('Content-Type') || '';
	if (!ct.startsWith('multipart/')) {
		return { blobs: [await res.blob()], genId };
	}
	const match = ct.match(/boundary=([^\s;]+)/);
	if (!match) throw new Error('Missing boundary in multipart response');
	const mime = format === 'wav' ? 'audio/wav' : 'audio/mpeg';
	return { blobs: parseMultipart(new Uint8Array(await res.arrayBuffer()), match[1], mime), genId };
}

// parse multipart/mixed binary response into Blob[].
// each part has only Content-Type header + raw audio body.
function parseMultipart(buf: Uint8Array, boundary: string, mime: string): Blob[] {
	const enc = new TextEncoder();
	const delim = enc.encode('--' + boundary);
	const results: Blob[] = [];

	// find all boundary positions
	const positions: number[] = [];
	for (let i = 0; i <= buf.length - delim.length; i++) {
		let ok = true;
		for (let j = 0; j < delim.length; j++) {
			if (buf[i + j] !== delim[j]) {
				ok = false;
				break;
			}
		}
		if (ok) positions.push(i);
	}

	for (let p = 0; p < positions.length - 1; p++) {
		const partStart = positions[p] + delim.length + 2;
		const partEnd = positions[p + 1] - 2;
		if (partStart >= partEnd) continue;

		// split headers from body at \r\n\r\n
		let splitAt = -1;
		for (let i = partStart; i < partEnd - 3; i++) {
			if (buf[i] === 13 && buf[i + 1] === 10 && buf[i + 2] === 13 && buf[i + 3] === 10) {
				splitAt = i;
				break;
			}
		}
		if (splitAt < 0) continue;

		const body = buf.slice(splitAt + 4, partEnd);
		results.push(new Blob([body], { type: mime }));
	}

	return results;
}

// POST /understand: audio file -> AceRequest with metadata + lyrics + codes.
// sends multipart/form-data with an "audio" part (WAV or MP3), and can
// optionally include request JSON for LM routing and sampling params.
export async function understandAudio(
	blob: Blob,
	req?: Partial<AceRequest>
): Promise<{ request: AceRequest; lmModel: string }> {
	const form = new FormData();
	form.append('audio', blob, 'input.audio');
	if (req?.lm_model) form.append('lm_model', req.lm_model);
	if (req && Object.keys(req).length > 0) {
		form.append(
			'request',
			new Blob([JSON.stringify(req)], { type: 'application/json' }),
			'request.json'
		);
	}
	const res = await fetch('understand', {
		method: 'POST',
		body: form
	});
	if (!res.ok) {
		const err = await res.json().catch(() => ({ error: res.statusText }));
		throw new Error(`${res.status} ${err.error || res.statusText}`);
	}
	return { request: await res.json(), lmModel: res.headers.get('X-LM-Model') || '' };
}

// GET props: server config, pipeline status, default request (2s timeout)
export async function props(): Promise<AceProps> {
	const res = await fetch('props', {
		signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
	});
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	return res.json();
}
