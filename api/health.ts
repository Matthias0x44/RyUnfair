/**
 * GET /api/health
 * Simple health check endpoint
 */

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  return new Response(
    JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      env: {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        hasResendKey: !!process.env.RESEND_API_KEY,
        hasAviationStackKey: !!process.env.AVIATIONSTACK_API_KEY,
        hasCronSecret: !!process.env.CRON_SECRET,
        hasFromEmail: !!process.env.FROM_EMAIL,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

