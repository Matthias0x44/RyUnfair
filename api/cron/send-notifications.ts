/**
 * Cron job to send pending notifications
 * Run every hour via Vercel cron
 * 
 * Handles:
 * - Flight result notifications
 * - 15-day follow-up (donation ask)
 * - 30-day follow-up (final donation ask)
 * - Email verification
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Lazily initialize clients (Edge Runtime requires runtime access to env vars)
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

let resend: Resend;
function getResend() {
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

const FROM_EMAIL = process.env.FROM_EMAIL || 'RyUnfair <notifications@ryunfair.com>';
const APP_URL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://ryunfair.com';

export const config = {
  runtime: 'edge',
};

// Email templates - all receive the full notification object from pending_notifications view
const templates = {
  // ============================================
  // 1. VERIFICATION EMAIL - Sent immediately on signup
  // ============================================
  verification: (data: any) => ({
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
                      <a href="${APP_URL}/api/verify?token=${data.verification_token}" 
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
  }),

  // ============================================
  // 2. DELAY CONFIRMED - Compensation eligible notification
  // ============================================
  flight_result_eligible: (data: any) => ({
    subject: `💰 ${data.flight_number}: You're owed ${data.compensation_currency}${data.compensation_amount} compensation!`,
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
                  </td>
                </tr>
                
                <!-- Celebration Banner -->
                <tr>
                  <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 24px; text-align: center;">
                    <span style="font-size: 40px;">🎉</span>
                    <h2 style="color: white; margin: 12px 0 0; font-size: 22px;">Great news! You're owed money!</h2>
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="background: white; padding: 40px 32px;">
                    <!-- Flight Details Card -->
                    <div style="background: #f8fafc; border-radius: 12px; padding: 24px; margin-bottom: 24px; border: 2px solid #e2e8f0;">
                      <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Flight</td>
                          <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #1e293b; font-size: 16px;">${data.flight_number}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Date</td>
                          <td style="padding: 8px 0; text-align: right; color: #1e293b; font-size: 14px;">${data.flight_date ? new Date(data.flight_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}</td>
                        </tr>
                        <tr>
                          <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Delay</td>
                          <td style="padding: 8px 0; text-align: right; font-weight: 700; color: #dc2626; font-size: 16px;">${data.delay_minutes ? `${Math.floor(data.delay_minutes / 60)}h ${data.delay_minutes % 60}m` : '3+ hours'}</td>
                        </tr>
                      </table>
                      
                      <div style="border-top: 2px dashed #e2e8f0; margin: 16px 0; padding-top: 16px;">
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="color: #073590; font-weight: 700; font-size: 18px;">You're owed</td>
                            <td style="text-align: right; color: #073590; font-weight: 900; font-size: 32px;">${data.compensation_currency}${data.compensation_amount}</td>
                          </tr>
                        </table>
                      </div>
                    </div>
                    
                    <p style="color: #4a5568; line-height: 1.7; font-size: 16px; text-align: center; margin: 0 0 24px;">
                      Under <strong>EU261/UK261 law</strong>, Ryanair is legally required to pay you this compensation. It's not optional!
                    </p>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="https://www.ryanair.com/ee/en/myryanair/requests/new/eu-261" 
                         style="background: #f1c933; color: #073590; padding: 18px 40px; text-decoration: none; font-weight: 700; border-radius: 8px; display: inline-block; font-size: 18px; box-shadow: 0 4px 14px rgba(241, 201, 51, 0.4);">
                        Claim My ${data.compensation_currency}${data.compensation_amount} Now →
                      </a>
                    </div>
                    
                    <!-- Tips Box -->
                    <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 20px; margin-top: 32px;">
                      <p style="color: #92400e; font-size: 14px; margin: 0 0 12px; font-weight: 700;">💡 Claim Tips:</p>
                      <ul style="color: #92400e; font-size: 14px; margin: 0; padding-left: 20px; line-height: 1.8;">
                        <li>Have your booking reference ready</li>
                        <li><strong>Never accept vouchers</strong> - insist on cash</li>
                        <li>Each passenger can claim separately</li>
                      </ul>
                    </div>
                    
                    <p style="color: #64748b; font-size: 14px; margin: 24px 0 0; text-align: center;">
                      Need help? Check our <a href="${APP_URL}/#guide" style="color: #073590; font-weight: 600;">step-by-step guide</a> or <a href="${APP_URL}/#cheatsheet" style="color: #073590; font-weight: 600;">cheat sheet</a>.
                    </p>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background: #f8fafc; padding: 24px 32px; border-radius: 0 0 12px 12px; text-align: center;">
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                      <a href="${APP_URL}/privacy.html" style="color: #64748b;">Privacy</a> · 
                      <a href="${APP_URL}/api/unsubscribe?email=${encodeURIComponent(data.email || '')}" style="color: #64748b;">Unsubscribe</a>
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
  }),

  // ============================================
  // 3. 15-DAY FOLLOW-UP - First donation ask
  // ============================================
  followup_donation: (data: any) => ({
    subject: `Did you claim your ${data.compensation_currency}${data.compensation_amount}? Quick question...`,
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
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="background: white; padding: 40px 32px;">
                    <h2 style="color: #073590; margin: 0 0 24px; font-size: 24px; text-align: center;">Did we help you get paid? 🤔</h2>
                    
                    <p style="color: #4a5568; line-height: 1.7; font-size: 16px; margin: 0 0 16px;">
                      Hi! Two weeks ago, we notified you that your flight <strong>${data.flight_number}</strong> qualified for <strong>${data.compensation_currency}${data.compensation_amount}</strong> in compensation.
                    </p>
                    
                    <p style="color: #4a5568; line-height: 1.7; font-size: 16px; margin: 0 0 24px;">
                      If RyUnfair helped you successfully claim your money, would you consider paying it forward with a small donation?
                    </p>
                    
                    <!-- Donation Ask -->
                    <div style="background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center; border: 2px solid #fde047;">
                      <p style="color: #854d0e; font-size: 14px; margin: 0 0 8px;">Suggested: 5% of your compensation</p>
                      <p style="color: #073590; font-size: 36px; font-weight: 900; margin: 0;">${data.compensation_currency}${data.compensation_amount ? (data.compensation_amount * 0.05).toFixed(2) : '12.50'}</p>
                    </div>
                    
                    <div style="text-align: center; margin: 24px 0;">
                      <a href="${APP_URL}/donate?amount=${data.compensation_amount ? (data.compensation_amount * 0.05).toFixed(2) : '12.50'}&currency=${data.compensation_currency || 'EUR'}&flight=${data.flight_number || ''}" 
                         style="background: #f1c933; color: #073590; padding: 16px 40px; text-decoration: none; font-weight: 700; border-radius: 8px; display: inline-block; font-size: 16px; box-shadow: 0 4px 14px rgba(241, 201, 51, 0.4);">
                        Donate & Support RyUnfair ❤️
                      </a>
                    </div>
                    
                    <p style="color: #64748b; font-size: 14px; text-align: center; margin: 24px 0 0;">
                      100% of donations go towards keeping RyUnfair free for everyone.
                    </p>
                    
                    <!-- Divider -->
                    <div style="border-top: 1px solid #e2e8f0; margin: 32px 0;"></div>
                    
                    <!-- Haven't Claimed Yet -->
                    <div style="background: #f8fafc; border-radius: 8px; padding: 20px;">
                      <p style="color: #475569; font-size: 14px; margin: 0; text-align: center;">
                        <strong>Haven't claimed yet?</strong> No worries - you still have time!<br>
                        <a href="https://www.ryanair.com/ee/en/myryanair/requests/new/eu-261" style="color: #073590; font-weight: 600;">Claim your ${data.compensation_currency}${data.compensation_amount} now →</a>
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background: #f8fafc; padding: 24px 32px; border-radius: 0 0 12px 12px; text-align: center;">
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                      <a href="${APP_URL}/privacy.html" style="color: #64748b;">Privacy</a> · 
                      <a href="${APP_URL}/api/unsubscribe?email=${encodeURIComponent(data.email || '')}" style="color: #64748b;">Unsubscribe</a>
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
  }),

  // ============================================
  // 4. 30-DAY FOLLOW-UP - Final donation ask
  // ============================================
  followup_donation_final: (data: any) => ({
    subject: `Final reminder: ${data.flight_number} compensation follow-up`,
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
                  </td>
                </tr>
                
                <!-- Body -->
                <tr>
                  <td style="background: white; padding: 40px 32px;">
                    <div style="text-align: center; margin-bottom: 24px;">
                      <span style="font-size: 48px;">🙏</span>
                    </div>
                    
                    <h2 style="color: #073590; margin: 0 0 24px; font-size: 24px; text-align: center;">One last ask</h2>
                    
                    <p style="color: #4a5568; line-height: 1.7; font-size: 16px; margin: 0 0 16px;">
                      A month ago, we helped you discover that flight <strong>${data.flight_number}</strong> qualified for <strong>${data.compensation_currency}${data.compensation_amount}</strong> compensation.
                    </p>
                    
                    <p style="color: #4a5568; line-height: 1.7; font-size: 16px; margin: 0 0 24px;">
                      RyUnfair is a passion project that costs real money to run. If we helped you get compensated, a small donation would help us keep fighting for passengers' rights.
                    </p>
                    
                    <!-- Impact Stats -->
                    <div style="display: table; width: 100%; margin: 24px 0;">
                      <div style="display: table-cell; width: 50%; text-align: center; padding: 16px; background: #f8fafc; border-radius: 8px 0 0 8px;">
                        <p style="color: #073590; font-size: 24px; font-weight: 900; margin: 0;">€250-600</p>
                        <p style="color: #64748b; font-size: 12px; margin: 4px 0 0;">Average claim value</p>
                      </div>
                      <div style="display: table-cell; width: 50%; text-align: center; padding: 16px; background: #f8fafc; border-radius: 0 8px 8px 0;">
                        <p style="color: #073590; font-size: 24px; font-weight: 900; margin: 0;">6 years</p>
                        <p style="color: #64748b; font-size: 12px; margin: 4px 0 0;">UK claim window</p>
                      </div>
                    </div>
                    
                    <div style="text-align: center; margin: 32px 0;">
                      <a href="${APP_URL}/donate?amount=${data.compensation_amount ? (data.compensation_amount * 0.05).toFixed(2) : '12.50'}&currency=${data.compensation_currency || 'EUR'}&flight=${data.flight_number || ''}" 
                         style="background: #f1c933; color: #073590; padding: 16px 40px; text-decoration: none; font-weight: 700; border-radius: 8px; display: inline-block; font-size: 16px; box-shadow: 0 4px 14px rgba(241, 201, 51, 0.4);">
                        Support RyUnfair
                      </a>
                      <p style="margin: 16px 0 0;">
                        <a href="${APP_URL}/donate" style="color: #073590; font-size: 14px;">Or donate any amount →</a>
                      </p>
                    </div>
                    
                    <div style="background: #fef2f2; border-radius: 8px; padding: 16px; margin-top: 24px; text-align: center;">
                      <p style="color: #991b1b; font-size: 13px; margin: 0;">
                        📬 This is our final email about this flight. Thanks for using RyUnfair!
                      </p>
                    </div>
                  </td>
                </tr>
                
                <!-- Footer -->
                <tr>
                  <td style="background: #f8fafc; padding: 24px 32px; border-radius: 0 0 12px 12px; text-align: center;">
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                      <a href="${APP_URL}/privacy.html" style="color: #64748b;">Privacy</a> · 
                      <a href="${APP_URL}/api/unsubscribe?email=${encodeURIComponent(data.email || '')}" style="color: #64748b;">Unsubscribe</a>
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
  }),

};

export default async function handler(request: Request) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  // Verify cron secret (prevents unauthorized calls)
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (!cronSecret) {
    return new Response(
      JSON.stringify({ error: 'CRON_SECRET not configured' }),
      { status: 500, headers: corsHeaders }
    );
  }
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', hint: 'Check Authorization header format: Bearer YOUR_SECRET' }),
      { status: 401, headers: corsHeaders }
    );
  }

  // Check required env vars
  const envCheck = {
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    FROM_EMAIL: FROM_EMAIL,
  };

  if (!envCheck.SUPABASE_URL || !envCheck.SUPABASE_SERVICE_ROLE_KEY || !envCheck.RESEND_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'Missing environment variables', envCheck }),
      { status: 500, headers: corsHeaders }
    );
  }

  try {
    const db = getSupabase();
    const emailClient = getResend();

    // Get pending notifications that are due
    const { data: notifications, error } = await db
      .from('pending_notifications')
      .select('*')
      .limit(50);

    if (error) {
      console.error('Error fetching notifications:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch notifications', details: error.message, code: error.code }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (!notifications || notifications.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending notifications in view', envCheck }),
        { status: 200, headers: corsHeaders }
      );
    }

    let sent = 0;
    let failed = 0;
    const results: any[] = [];

    let skipped = 0;
    
    for (const notification of notifications) {
      try {
        // Get template (handle legacy alias)
        let templateName = notification.template_used as string;
        if (templateName === 'email_verification') {
          templateName = 'verification';
        }
        
        const templateKey = templateName as keyof typeof templates;
        const templateFn = templates[templateKey];
        if (!templateFn) {
          results.push({ id: notification.id, error: `Unknown template: ${notification.template_used}` });
          skipped++;
          continue;
        }

        // Generate email content
        const emailContent = typeof templateFn === 'function' 
          ? templateFn(notification)
          : templateFn;

        // Send via Resend
        const { data: emailResult, error: emailError } = await emailClient.emails.send({
          from: FROM_EMAIL,
          to: notification.email,
          subject: emailContent.subject,
          html: emailContent.html,
        });

        if (emailError) {
          throw emailError;
        }

        // Mark as sent
        await db
          .from('notifications')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            external_id: emailResult?.id,
          })
          .eq('id', notification.id);

        sent++;
        results.push({ id: notification.id, status: 'sent', resendId: emailResult?.id });
      } catch (err: any) {
        console.error(`Failed to send notification ${notification.id}:`, err);
        
        // Mark as failed
        await db
          .from('notifications')
          .update({ status: 'failed' })
          .eq('id', notification.id);

        failed++;
        results.push({ 
          id: notification.id, 
          status: 'failed', 
          error: err?.message || String(err),
          to: notification.email,
          from: FROM_EMAIL
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: notifications.length,
        sent,
        failed,
        skipped,
        results,
        config: { from: FROM_EMAIL }
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error: any) {
    console.error('Cron error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error?.message || String(error) }),
      { status: 500, headers: corsHeaders }
    );
  }
}

