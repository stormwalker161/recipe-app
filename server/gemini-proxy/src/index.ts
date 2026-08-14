/**
 * Gemini API proxy.
 *
 * The Recipe App's client (web + mobile) calls this Worker instead of Google's
 * Generative Language API directly. The real GEMINI_API_KEY lives only here,
 * as a Cloudflare secret -- it is never bundled into client-side JS, so it
 * can't leak through view-source, GitHub secret scanning, or APK decompiling.
 *
 * The client sends requests shaped exactly like Gemini's REST API
 * (e.g. POST /v1beta/models/gemini-3.6-flash:generateContent), minus the
 * `key` query param. This Worker re-attaches the real key and forwards the
 * request to Google, then relays the response back unchanged.
 */

interface Env {
	GEMINI_API_KEY: string;
}

const GOOGLE_HOST = 'https://generativelanguage.googleapis.com';

// Restrict which origins may call this proxy so a scraped Worker URL alone
// isn't enough to ride on our Gemini quota from an arbitrary website.
const ALLOWED_ORIGINS = new Set([
	'https://stormwalker161.github.io',
	'http://localhost:8081',
	'http://localhost:19006',
]);

function corsHeaders(origin: string | null): HeadersInit {
	const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : '';
	return {
		'Access-Control-Allow-Origin': allowOrigin,
		'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type',
		Vary: 'Origin',
	};
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const origin = request.headers.get('Origin');
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: corsHeaders(origin) });
		}

		// Native apps (iOS/Android) send no Origin header at all -- only
		// enforce the allow-list for browser requests that do send one.
		if (origin && !ALLOWED_ORIGINS.has(origin)) {
			return new Response('Forbidden', { status: 403 });
		}

		if (!url.pathname.startsWith('/v1beta/')) {
			return new Response('Not Found', { status: 404 });
		}

		if (!env.GEMINI_API_KEY) {
			return new Response('Proxy is not configured with an API key.', { status: 500 });
		}

		const targetUrl = new URL(GOOGLE_HOST + url.pathname + url.search);
		targetUrl.searchParams.set('key', env.GEMINI_API_KEY);

		const googleResponse = await fetch(targetUrl.toString(), {
			method: request.method,
			headers: { 'Content-Type': 'application/json' },
			body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.text(),
		});

		const responseHeaders = new Headers(corsHeaders(origin));
		responseHeaders.set('Content-Type', googleResponse.headers.get('Content-Type') ?? 'application/json');

		return new Response(googleResponse.body, {
			status: googleResponse.status,
			headers: responseHeaders,
		});
	},
} satisfies ExportedHandler<Env>;
