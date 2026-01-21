/**
 * POST /api/subscribe
 * Subscribe user for flight tracking notifications
 * GDPR compliant - requires explicit consent
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role for server-side operations
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
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await request.json();
    const { email, consent, marketingConsent, flight } = body;

    // Validate required fields
    if (!email || typeof consent !== 'boolean') {
      return new Response(
        JSON.stringify({ error: 'Email and consent are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate consent is explicitly true
    if (!consent) {
      return new Response(
        JSON.stringify({ error: 'Explicit consent is required to process your data' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get IP for consent record (hashed)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown';
    const ipHash = await hashForGdpr(ip);

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, deleted_at')
      .eq('email', email.toLowerCase())
      .single();

    let userId: string;

    if (existingUser && !existingUser.deleted_at) {
      // User exists, update consent
      userId = existingUser.id;
      
      await supabase
        .from('users')
        .update({
          consent_given: true,
          consent_timestamp: new Date().toISOString(),
          consent_ip_hash: ipHash,
          marketing_consent: marketingConsent || false,
        })
        .eq('id', userId);

    } else {
      // Create new user
      const verificationToken = crypto.randomUUID();
      
      const { data: newUser, error } = await supabase
        .from('users')
        .insert({
          email: email.toLowerCase(),
          consent_given: true,
          consent_timestamp: new Date().toISOString(),
          consent_ip_hash: ipHash,
          marketing_consent: marketingConsent || false,
          verification_token: verificationToken,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Error creating user:', error);
        return new Response(
          JSON.stringify({ error: 'Failed to create subscription' }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }

      userId = newUser.id;

      // Queue verification email
      await supabase.from('notifications').insert({
        user_id: userId,
        type: 'verification',
        subject: 'Verify your email for RyUnfair',
        template_used: 'email_verification',
        scheduled_for: new Date().toISOString(),
      });
    }

    // Log consent for GDPR audit
    await supabase.from('gdpr_audit_log').insert({
      action: 'consent_given',
      user_id: userId,
      user_email_hash: await hashForGdpr(email.toLowerCase()),
      ip_hash: ipHash,
      details: {
        marketing_consent: marketingConsent || false,
        timestamp: new Date().toISOString(),
      },
    });

    // If flight data provided, create tracking record
    if (flight && flight.flightNumber && flight.date) {
      const { error: flightError } = await supabase
        .from('tracked_flights')
        .upsert({
          user_id: userId,
          flight_number: flight.flightNumber.toUpperCase(),
          flight_date: flight.date,
          departure_airport: flight.departure?.toUpperCase() || 'UNK',
          arrival_airport: flight.arrival?.toUpperCase() || 'UNK',
          distance_km: flight.distance || null,
          delay_minutes: flight.delayMinutes || 0,
          compensation_eligible: flight.compensation?.eligible || false,
          compensation_amount: flight.compensation?.amount || null,
          compensation_currency: flight.compensation?.currency || 'EUR',
          status: 'tracking',
        }, {
          onConflict: 'user_id,flight_number,flight_date',
        });

      if (flightError) {
        console.error('Error tracking flight:', flightError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Subscription created. Please check your email to verify.',
        userId,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Subscribe error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

