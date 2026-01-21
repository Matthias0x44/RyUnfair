/**
 * POST /api/subscribe
 * Subscribe user for flight tracking notifications
 * GDPR compliant - requires explicit consent
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Lazily initialize Supabase client (Edge Runtime requires runtime access to env vars)
let supabase: SupabaseClient;
function getSupabase() {
  if (!supabase) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error(`Missing Supabase env vars: URL=${!!supabaseUrl}, KEY=${!!supabaseKey}`);
    }
    
    supabase = createClient(supabaseUrl, supabaseKey);
  }
  return supabase;
}

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

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(request: Request) {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    const body = await request.json();
    const { email, consent, marketingConsent, flight } = body;

    // Validate required fields
    if (!email || typeof consent !== 'boolean') {
      return new Response(
        JSON.stringify({ error: 'Email and consent are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Validate consent is explicitly true
    if (!consent) {
      return new Response(
        JSON.stringify({ error: 'Explicit consent is required to process your data' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Validate email format
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

    // Get IP for consent record (hashed)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               'unknown';
    const ipHash = await hashForGdpr(ip);

    const db = getSupabase();

    // Check if user already exists
    const { data: existingUser } = await db
      .from('users')
      .select('id, deleted_at')
      .eq('email', email.toLowerCase())
      .single();

    let userId: string;

    if (existingUser && !existingUser.deleted_at) {
      // User exists, update consent
      userId = existingUser.id;
      
      await db
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
      
      const { data: newUser, error } = await db
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

      if (error || !newUser) {
        console.error('Error creating user:', error);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to create subscription',
            details: error?.message || error?.code || 'No user returned from database',
            code: error?.code,
            hint: error?.hint,
            full: error ? JSON.stringify(error) : 'error was null but no user returned'
          }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      userId = newUser.id;

      // Queue verification email
      await db.from('notifications').insert({
        user_id: userId,
        type: 'verification',
        subject: 'Verify your email for RyUnfair',
        template_used: 'email_verification',
        scheduled_for: new Date().toISOString(),
      });
    }

    // Log consent for GDPR audit
    await db.from('gdpr_audit_log').insert({
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
      const { error: flightError } = await db
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
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );

  } catch (error) {
    console.error('Subscribe error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        full: JSON.stringify(error, Object.getOwnPropertyNames(error || {}))
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

