/**
 * POST /api/subscribe
 * Subscribe user for flight tracking notifications
 * GDPR compliant - requires explicit consent
 * Sends verification email directly via Resend (no cron needed)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Lazily initialize clients (Edge Runtime requires runtime access to env vars)
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

let resend: Resend;
function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'RyUnfair <noreply@notifications.ryunfair.com>';
const APP_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://ryunfair.com';

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

    // Test database connection first
    const { error: testError } = await db
      .from('users')
      .select('id')
      .limit(1);
    
    if (testError) {
      return new Response(
        JSON.stringify({ 
          error: 'Database connection failed',
          details: testError.message || testError.code || 'Connection test failed',
          code: testError.code,
          hint: testError.hint,
          full: JSON.stringify(testError)
        }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      );
    }

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
      
      const userData = {
        email: email.toLowerCase(),
        consent_given: true,
        consent_timestamp: new Date().toISOString(),
        consent_ip_hash: ipHash,
        marketing_consent: marketingConsent || false,
        verification_token: verificationToken,
      };
      
      // Insert without .select() to avoid RLS issues on return
      const { error: insertError, status, statusText } = await db
        .from('users')
        .insert(userData);

      if (insertError || status >= 400) {
        console.error('Error creating user:', insertError, status, statusText);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to create subscription',
            details: insertError?.message || insertError?.code || `Insert failed with status ${status}`,
            code: insertError?.code,
            hint: insertError?.hint,
            status,
            statusText,
            full: JSON.stringify(insertError),
            attemptedData: { ...userData, consent_ip_hash: '[redacted]' }
          }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      // Fetch the newly created user
      const { data: newUser, error: fetchError } = await db
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase())
        .single();

      if (fetchError || !newUser) {
        console.error('Error fetching new user:', fetchError);
        return new Response(
          JSON.stringify({ 
            error: 'User created but failed to retrieve',
            details: fetchError?.message || 'Could not fetch user after insert',
            code: fetchError?.code,
            full: fetchError ? JSON.stringify(fetchError) : 'fetch returned null'
          }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
        );
      }

      userId = newUser.id;

      // Send verification email directly via Resend
      try {
        const emailClient = getResend();
        const verifyUrl = `${APP_URL}/api/verify?token=${verificationToken}`;
        
        const { data: emailResult, error: emailError } = await emailClient.emails.send({
          from: FROM_EMAIL,
          to: email.toLowerCase(),
          subject: '✈️ Verify your email to track flight delays',
          html: `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="margin: 0; padding: 0; background-color: #f5f7fa; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f7fa; padding: 40px 20px;">
                <tr>
                  <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px; width: 100%;">
                      <!-- Header -->
                      <tr>
                        <td style="background: linear-gradient(135deg, #073590 0%, #0a4bc4 100%); padding: 32px; text-align: center; border-radius: 12px 12px 0 0;">
                          <h1 style="margin: 0; font-size: 32px; font-weight: 900; letter-spacing: -0.5px;">
                            <span style="color: #f1c933;">Ry</span><span style="color: white;">Unfair</span>
                          </h1>
                          <p style="margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">Know your rights. Get your money.</p>
                        </td>
                      </tr>
                      
                      <!-- Body -->
                      <tr>
                        <td style="background: white; padding: 40px 32px;">
                          <div style="text-align: center; margin-bottom: 24px;">
                            <span style="font-size: 48px;">📧</span>
                          </div>
                          
                          <h2 style="color: #073590; margin: 0 0 16px; font-size: 24px; text-align: center;">One click to start tracking</h2>
                          
                          <p style="color: #4a5568; line-height: 1.7; font-size: 16px; text-align: center; margin: 0 0 32px;">
                            Thanks for signing up! Verify your email to receive instant notifications when your Ryanair flight is delayed enough for compensation.
                          </p>
                          
                          <div style="text-align: center; margin: 32px 0;">
                            <a href="${verifyUrl}" 
                               style="background: #f1c933; color: #073590; padding: 18px 48px; text-decoration: none; font-weight: 700; border-radius: 8px; display: inline-block; font-size: 16px; box-shadow: 0 4px 14px rgba(241, 201, 51, 0.4);">
                              Verify My Email →
                            </a>
                          </div>
                          
                          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-top: 32px;">
                            <p style="color: #64748b; font-size: 14px; margin: 0; text-align: center;">
                              <strong>What happens next?</strong><br>
                              We'll monitor your tracked flights and email you the moment a delay qualifies for EU261/UK261 compensation.
                            </p>
                          </div>
                        </td>
                      </tr>
                      
                      <!-- Footer -->
                      <tr>
                        <td style="background: #f8fafc; padding: 24px 32px; border-radius: 0 0 12px 12px; text-align: center;">
                          <p style="color: #94a3b8; font-size: 12px; margin: 0 0 8px;">
                            Didn't sign up for RyUnfair? Just ignore this email.
                          </p>
                          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                            <a href="${APP_URL}/privacy.html" style="color: #073590;">Privacy Policy</a>
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
          `,
        });

        if (emailError) {
          console.error('Failed to send verification email:', emailError);
          // Don't fail the request - user is created, just log the email error
        } else {
          console.log('Verification email sent:', emailResult?.id);
        }
      } catch (emailErr) {
        console.error('Email sending error:', emailErr);
        // Don't fail the request - user is created
      }
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

