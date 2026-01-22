/**
 * GET /api/test-email?to=your@email.com
 * Simple test endpoint to verify Resend is working
 * No database, no templates - just sends a test email
 */

import { Resend } from 'resend';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const to = url.searchParams.get('to');
  const secret = url.searchParams.get('secret');
  
  // Basic auth to prevent abuse
  if (secret !== process.env.CRON_SECRET) {
    return new Response(
      JSON.stringify({ error: 'Add ?secret=YOUR_CRON_SECRET' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  if (!to) {
    return new Response(
      JSON.stringify({ error: 'Add ?to=your@email.com' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.FROM_EMAIL || 'RyUnfair <onboarding@resend.dev>';
  
  if (!apiKey) {
    return new Response(
      JSON.stringify({ 
        error: 'RESEND_API_KEY not configured',
        hint: 'Add RESEND_API_KEY to Vercel environment variables'
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
  
  try {
    const resend = new Resend(apiKey);
    
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: to,
      subject: '✅ RyUnfair Test Email - It Works!',
      html: `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #073590;">🎉 Email is working!</h1>
          <p>This is a test email from RyUnfair.</p>
          <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
          <p><strong>From:</strong> ${fromEmail}</p>
          <hr>
          <p style="color: #666; font-size: 14px;">If you received this, your Resend configuration is correct.</p>
        </div>
      `,
    });
    
    if (error) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: error.message,
          name: error.name,
          from: fromEmail,
          to: to
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Email sent!',
        id: data?.id,
        from: fromEmail,
        to: to
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (err: any) {
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: err?.message || String(err),
        from: fromEmail,
        to: to
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

