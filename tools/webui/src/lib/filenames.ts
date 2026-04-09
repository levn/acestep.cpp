export function sanitizeFilenamePart(name: string, fallback = 'file'): string {
	const cleaned = name
		.normalize('NFC')
		.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/[. ]+$/g, '');
	return cleaned || fallback;
}

export function buildDownloadBaseName(
	name: string,
	opts: { genId?: string; seed?: number; fallback?: string } = {}
): string {
	const parts = [sanitizeFilenamePart(name, opts.fallback ?? 'file')];
	if (opts.genId) parts.push(opts.genId);
	if (opts.seed != null) parts.push(String(opts.seed));
	return parts.join('_');
}
