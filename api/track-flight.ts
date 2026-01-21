/**
 * POST /api/track-flight
 * Track a flight and store delay information
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

interface FlightData {
  userId?: string;
  email?: string;
  flightNumber: string;
  date: string;
  departure: string;
  arrival: string;
  delayMinutes?: number;
  distance?: number;
  compensation?: {
    eligible: boolean;
    amount: number;
    currency: string;
  };
  status?: string;
}

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body: FlightData = await request.json();
    const { userId, email, flightNumber, date, departure, arrival, delayMinutes, distance, compensation, status } = body;

    // Need either userId or email to track
    if (!userId && !email) {
      return new Response(
        JSON.stringify({ error: 'User ID or email required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!flightNumber || !date) {
      return new Response(
        JSON.stringify({ error: 'Flight number and date are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const db = getSupabase();

    // Get user ID from email if needed
    let resolvedUserId = userId;
    if (!resolvedUserId && email) {
      const { data: user } = await db
        .from('users')
        .select('id')
        .eq('email', email.toLowerCase())
        .is('deleted_at', null)
        .single();

      if (!user) {
        return new Response(
          JSON.stringify({ error: 'User not found. Please subscribe first.' }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      resolvedUserId = user.id;
    }

    // Upsert flight tracking data
    const { data: flight, error } = await db
      .from('tracked_flights')
      .upsert({
        user_id: resolvedUserId,
        flight_number: flightNumber.toUpperCase(),
        flight_date: date,
        departure_airport: departure?.toUpperCase() || 'UNK',
        arrival_airport: arrival?.toUpperCase() || 'UNK',
        distance_km: distance || null,
        delay_minutes: delayMinutes || 0,
        compensation_eligible: compensation?.eligible || false,
        compensation_amount: compensation?.amount || null,
        compensation_currency: compensation?.currency || 'EUR',
        status: status || 'tracking',
      }, {
        onConflict: 'user_id,flight_number,flight_date',
      })
      .select()
      .single();

    if (error) {
      console.error('Error tracking flight:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to track flight' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // If flight is now completed and eligible, queue result notification
    if (status === 'completed' && compensation?.eligible) {
      await db.from('notifications').insert({
        user_id: resolvedUserId,
        flight_id: flight.id,
        type: 'flight_result',
        subject: `Your ${flightNumber} flight qualifies for ${compensation.currency}${compensation.amount} compensation!`,
        template_used: 'flight_result_eligible',
        scheduled_for: new Date().toISOString(),
      });
    }

    return new Response(
      JSON.stringify({ success: true, flight }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Track flight error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

