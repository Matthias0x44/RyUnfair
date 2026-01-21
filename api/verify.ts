/**
 * GET /api/verify
 * Verify user email address
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazily initialize Supabase client (Edge Runtime requires runtime access to env vars)
let supabase: SupabaseClient;
function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return supabase;
}

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return Response.redirect(`${url.origin}/?error=missing_token`);
  }

  const db = getSupabase();

  // Find user with this verification token
  const { data: user, error } = await db
    .from('users')
    .select('id, email, email_verified')
    .eq('verification_token', token)
    .is('deleted_at', null)
    .single();

  if (error || !user) {
    return Response.redirect(`${url.origin}/?error=invalid_token`);
  }

  if (user.email_verified) {
    return Response.redirect(`${url.origin}/?verified=already`);
  }

  // Mark as verified
  await db
    .from('users')
    .update({
      email_verified: true,
      verification_token: null,
    })
    .eq('id', user.id);

  // Log for GDPR audit
  await db.from('gdpr_audit_log').insert({
    action: 'email_verified',
    user_id: user.id,
    details: { timestamp: new Date().toISOString() },
  });

  return Response.redirect(`${url.origin}/?verified=success`);
}

