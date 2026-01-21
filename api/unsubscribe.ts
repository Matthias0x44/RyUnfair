/**
 * GET /api/unsubscribe
 * Unsubscribe user from emails (GDPR compliant)
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
    return new Response(renderPage('Error', 'Email is required'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Find user
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('email', email.toLowerCase())
    .is('deleted_at', null)
    .single();

  if (!user) {
    return new Response(renderPage('Not Found', 'Email not found in our system.'), {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Withdraw consent
  await supabase
    .from('users')
    .update({
      consent_given: false,
      marketing_consent: false,
    })
    .eq('id', user.id);

  // Cancel pending notifications
  await supabase
    .from('notifications')
    .update({ status: 'cancelled' })
    .eq('user_id', user.id)
    .eq('status', 'pending');

  // Log for GDPR audit
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown';
  await supabase.from('gdpr_audit_log').insert({
    action: 'consent_withdrawn',
    user_id: user.id,
    user_email_hash: await hashForGdpr(email.toLowerCase()),
    ip_hash: await hashForGdpr(ip),
    details: { 
      timestamp: new Date().toISOString(),
      method: 'unsubscribe_link',
    },
  });

  return new Response(renderPage('Unsubscribed', `
    <p>You've been successfully unsubscribed from RyUnfair emails.</p>
    <p>We will no longer send you notifications about flight delays or compensation.</p>
    <p style="margin-top: 24px;">
      <strong>Want to delete all your data?</strong><br>
      <a href="/api/user/data?email=${encodeURIComponent(email)}" style="color: #073590;">Request full data deletion →</a>
    </p>
  `), {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
}

function renderPage(title: string, content: string): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} - RyUnfair</title>
      <style>
        body {
          font-family: 'Roboto', Arial, sans-serif;
          background: #f5f7fa;
          margin: 0;
          padding: 40px 20px;
          min-height: 100vh;
        }
        .container {
          max-width: 500px;
          margin: 0 auto;
          background: white;
          border-radius: 12px;
          padding: 40px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 {
          color: #073590;
          margin-top: 0;
        }
        p {
          color: #333;
          line-height: 1.6;
        }
        a {
          color: #073590;
        }
        .logo {
          text-align: center;
          margin-bottom: 24px;
        }
        .logo span:first-child {
          color: #f1c933;
          font-weight: 900;
          font-size: 24px;
        }
        .logo span:last-child {
          color: #073590;
          font-weight: 900;
          font-size: 24px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">
          <span>Ry</span><span>Unfair</span>
        </div>
        <h1>${title}</h1>
        ${content}
      </div>
    </body>
    </html>
  `;
}

