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
 *
 * Every request must also carry a Supabase `Authorization: Bearer <token>`
 * header identifying a signed-in, *approved* user (see isApprovedCaller
 * below). Origin-allowlisting alone only stops other websites from calling
 * this Worker -- it does nothing to stop a signed-up-but-not-yet-approved
 * account from opening devtools on our own app and hitting this Worker
 * directly, bypassing the app's UI gate entirely. Checking approval here,
 * server-side, is what actually protects the shared Gemini quota.
 */

interface Env {
	GEMINI_API_KEY: string;
	SUPABASE_URL: string;
	SUPABASE_SERVICE_ROLE_KEY: string;
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
		'Access-Control-Allow-Headers': 'Content-Type, Authorization',
		Vary: 'Origin',
	};
}

type ApprovalResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * Verifies the caller's Supabase access token and checks their `profiles`
 * row for `is_approved`. Two calls to Supabase's own APIs: one to validate
 * the token (Auth), one to read the approval flag (REST, using the service
 * role key so it isn't limited by that user's own row-level-security scope).
 */
async function isApprovedCaller(request: Request, env: Env): Promise<ApprovalResult> {
	const authHeader = request.headers.get('Authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		return { ok: false, status: 401, message: 'You must be signed in to use this feature.' };
	}
	const token = authHeader.slice('Bearer '.length);

	const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
		headers: {
			Authorization: `Bearer ${token}`,
			apikey: env.SUPABASE_SERVICE_ROLE_KEY,
		},
	});
	if (!userResponse.ok) {
		return { ok: false, status: 401, message: 'Your session has expired. Please sign in again.' };
	}

	const user = (await userResponse.json()) as { id?: string };
	if (!user.id) {
		return { ok: false, status: 401, message: 'Your session has expired. Please sign in again.' };
	}

	const profileResponse = await fetch(
		`${env.SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=is_approved`,
		{
			headers: {
				apikey: env.SUPABASE_SERVICE_ROLE_KEY,
				Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
			},
		}
	);
	if (!profileResponse.ok) {
		return { ok: false, status: 500, message: 'Could not verify account approval status.' };
	}

	const profiles = (await profileResponse.json()) as Array<{ is_approved?: boolean }>;
	if (!profiles[0]?.is_approved) {
		return { ok: false, status: 403, message: 'Your account is awaiting approval from the app owner.' };
	}

	return { ok: true };
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

		const approval = await isApprovedCaller(request, env);
		if (!approval.ok) {
			return new Response(JSON.stringify({ error: { message: approval.message } }), {
				status: approval.status,
				headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
			});
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
