/**
 * GET /api/flight-status
 * Fetch real flight data from AviationStack API
 */

export const config = {
  runtime: 'edge',
};

const AVIATIONSTACK_API = 'http://api.aviationstack.com/v1';

interface FlightResponse {
  flightNumber: string;
  date: string;
  status: string;
  departure: {
    airport: string;
    iata: string;
    scheduled: string;
    actual: string | null;
    delay: number | null;
  };
  arrival: {
    airport: string;
    iata: string;
    scheduled: string;
    actual: string | null;
    estimated: string | null;
    delay: number | null;
  };
  airline: string;
}

export default async function handler(request: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const flightNumber = url.searchParams.get('flight');
  const date = url.searchParams.get('date');

  if (!flightNumber) {
    return new Response(
      JSON.stringify({ error: 'Flight number is required' }),
      { status: 400, headers: corsHeaders }
    );
  }

  const apiKey = process.env.AVIATIONSTACK_API_KEY;
  
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'AviationStack API key not configured' }),
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    // Clean up flight number (remove spaces, ensure uppercase)
    const cleanFlightNumber = flightNumber.replace(/\s+/g, '').toUpperCase();
    
    // AviationStack uses IATA flight codes (e.g., FR1175)
    const apiUrl = `${AVIATIONSTACK_API}/flights?access_key=${apiKey}&flight_iata=${cleanFlightNumber}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      throw new Error(`AviationStack API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      return new Response(
        JSON.stringify({ 
          error: 'AviationStack API error', 
          details: data.error.message || data.error.info,
          code: data.error.code
        }),
        { status: 400, headers: corsHeaders }
      );
    }
    
    if (!data.data || data.data.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'Flight not found',
          flight: cleanFlightNumber,
          hint: 'Flight may have already landed or not yet departed. Try a current flight.'
        }),
        { status: 404, headers: corsHeaders }
      );
    }
    
    // Find the matching flight (if date provided, try to match)
    let flight = data.data[0];
    
    if (date && data.data.length > 1) {
      const targetDate = new Date(date).toISOString().split('T')[0];
      const matchingFlight = data.data.find((f: any) => {
        const flightDate = f.flight_date || f.departure?.scheduled?.split('T')[0];
        return flightDate === targetDate;
      });
      if (matchingFlight) {
        flight = matchingFlight;
      }
    }
    
    // Calculate delay in minutes
    const departureDelay = flight.departure?.delay || 0;
    const arrivalDelay = flight.arrival?.delay || 0;
    const totalDelay = Math.max(departureDelay, arrivalDelay);
    
    // Parse flight status
    const flightStatus = flight.flight_status || 'unknown';
    
    const result: FlightResponse = {
      flightNumber: flight.flight?.iata || cleanFlightNumber,
      date: flight.flight_date || date || new Date().toISOString().split('T')[0],
      status: flightStatus,
      departure: {
        airport: flight.departure?.airport || 'Unknown',
        iata: flight.departure?.iata || '???',
        scheduled: flight.departure?.scheduled || '',
        actual: flight.departure?.actual || null,
        delay: departureDelay,
      },
      arrival: {
        airport: flight.arrival?.airport || 'Unknown',
        iata: flight.arrival?.iata || '???',
        scheduled: flight.arrival?.scheduled || '',
        actual: flight.arrival?.actual || null,
        estimated: flight.arrival?.estimated || null,
        delay: arrivalDelay,
      },
      airline: flight.airline?.name || 'Ryanair',
    };
    
    // Add compensation calculation
    const compensation = calculateCompensation(totalDelay, flight.departure?.iata, flight.arrival?.iata);
    
    return new Response(
      JSON.stringify({
        success: true,
        flight: result,
        delay: {
          minutes: totalDelay,
          hours: Math.floor(totalDelay / 60),
          formatted: `${Math.floor(totalDelay / 60)}h ${totalDelay % 60}m`,
        },
        compensation,
        raw: flight, // Include raw data for debugging
      }),
      { status: 200, headers: corsHeaders }
    );
    
  } catch (error: any) {
    console.error('Flight status error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to fetch flight status',
        details: error?.message || String(error)
      }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// Simple compensation calculator
function calculateCompensation(delayMinutes: number, departure?: string, arrival?: string) {
  if (delayMinutes < 180) {
    return {
      eligible: false,
      reason: 'Delay under 3 hours',
      amount: 0,
      currency: 'EUR',
    };
  }
  
  // Simplified distance-based compensation
  // In reality, you'd calculate actual distance between airports
  // For now, assume short-haul (under 1500km) for most Ryanair flights
  let amount = 250; // Default for under 1500km
  let distance = 'short'; // under 1500km
  
  // Known long routes (over 1500km)
  const longRoutes = ['TFS', 'LPA', 'ACE', 'FUE', 'PMI', 'IBZ', 'MAH']; // Canary Islands, Balearics
  if (departure && arrival) {
    if (longRoutes.includes(departure) || longRoutes.includes(arrival)) {
      amount = 400;
      distance = 'medium'; // 1500-3500km
    }
  }
  
  return {
    eligible: true,
    reason: `Delay of ${Math.floor(delayMinutes / 60)}h ${delayMinutes % 60}m qualifies for EU261 compensation`,
    amount,
    currency: 'EUR',
    distance,
  };
}

