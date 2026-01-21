/**
 * GET /api/user/data - Export all user data (GDPR Article 20 - Right to data portability)
 * DELETE /api/user/data - Delete all user data (GDPR Article 17 - Right to erasure)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Hash function for GDPR compliance (don't store raw IPs)
// Uses Web Crypto API for Edge Runtime compatibility
async function hashForGdpr(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email');

  if (!email) {
    return new Response(
      JSON.stringify({ error: 'Email is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get IP for audit log
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
             request.headers.get('x-real-ip') || 
             'unknown';
  const ipHash = await hashForGdpr(ip);
  const userAgentHash = await hashForGdpr(request.headers.get('user-agent') || 'unknown');

  // Find user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('email', email.toLowerCase())
    .is('deleted_at', null)
    .single();

  if (userError || !user) {
    return new Response(
      JSON.stringify({ error: 'User not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // =============================================
  // GET - Export user data
  // =============================================
  if (request.method === 'GET') {
    // Get all related data
    const { data: flights } = await supabase
      .from('tracked_flights')
      .select('*')
      .eq('user_id', user.id);

    const { data: notifications } = await supabase
      .from('notifications')
      .select('type, subject, sent_at, status, created_at')
      .eq('user_id', user.id);

    // Format data export (GDPR compliant format)
    const exportData = {
      exportDate: new Date().toISOString(),
      dataController: 'RyUnfair',
      dataSubject: {
        email: user.email,
        accountCreated: user.created_at,
      },
      consent: {
        given: user.consent_given,
        timestamp: user.consent_timestamp,
        marketingConsent: user.marketing_consent,
      },
      trackedFlights: flights?.map(f => ({
        flightNumber: f.flight_number,
        date: f.flight_date,
        route: `${f.departure_airport} → ${f.arrival_airport}`,
        delayMinutes: f.delay_minutes,
        compensationEligible: f.compensation_eligible,
        compensationAmount: f.compensation_amount ? `${f.compensation_currency}${f.compensation_amount}` : null,
        trackedAt: f.created_at,
      })) || [],
      emailsSent: notifications?.map(n => ({
        type: n.type,
        subject: n.subject,
        sentAt: n.sent_at,
        status: n.status,
      })) || [],
    };

    // Log the export for GDPR audit
    await supabase.from('gdpr_audit_log').insert({
      action: 'data_exported',
      user_id: user.id,
      user_email_hash: await hashForGdpr(email.toLowerCase()),
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
      details: { timestamp: new Date().toISOString() },
    });

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="ryunfair-data-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  }

  // =============================================
  // DELETE - Erase user data
  // =============================================
  if (request.method === 'DELETE') {
    const emailHash = await hashForGdpr(email.toLowerCase());

    // Log deletion BEFORE deleting (for audit trail)
    await supabase.from('gdpr_audit_log').insert({
      action: 'data_deleted',
      user_id: user.id,
      user_email_hash: emailHash,
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
      details: {
        timestamp: new Date().toISOString(),
        reason: 'User requested deletion under GDPR Article 17',
      },
    });

    // Soft delete the user (keeps audit trail, actual deletion after 30 days)
    const { error: deleteError } = await supabase
      .from('users')
      .update({ 
        deleted_at: new Date().toISOString(),
        email: `deleted_${user.id}@deleted.local`, // Anonymize email
        consent_given: false,
      })
      .eq('id', user.id);

    if (deleteError) {
      console.error('Error deleting user:', deleteError);
      return new Response(
        JSON.stringify({ error: 'Failed to delete user data' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Cancel any pending notifications
    await supabase
      .from('notifications')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id)
      .eq('status', 'pending');

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Your data has been marked for deletion. All data will be permanently removed within 30 days as required for audit compliance.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers: { 'Content-Type': 'application/json' } }
  );
}

