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
  verification: (data: any) => ({
    subject: 'Verify your email for RyUnfair',
    html: `
      <div style="font-family: 'Roboto', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
        <div style="background: #073590; padding: 24px; text-align: center;">
          <h1 style="color: #f1c933; margin: 0; font-size: 28px;">
            <span style="color: #f1c933;">Ry</span><span style="color: white;">Unfair</span>
          </h1>
        </div>
        <div style="padding: 32px; background: white;">
          <h2 style="color: #073590; margin-top: 0;">Verify your email</h2>
          <p style="color: #333; line-height: 1.6;">
            Thanks for signing up to track your Ryanair flights! Please verify your email to receive notifications about delays and compensation.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${APP_URL}/api/verify?token=${data.verification_token}" 
               style="background: #f1c933; color: #073590; padding: 16px 32px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block;">
              Verify Email
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            If you didn't sign up for RyUnfair, you can ignore this email.
          </p>
        </div>
        <div style="padding: 16px; text-align: center; color: #666; font-size: 12px;">
          <p>RyUnfair - Know your rights. Get your money.</p>
          <p><a href="${APP_URL}/privacy" style="color: #073590;">Privacy Policy</a> | <a href="${APP_URL}/api/unsubscribe?email=${encodeURIComponent(data.email)}" style="color: #073590;">Unsubscribe</a></p>
        </div>
      </div>
    `,
  }),

  flight_result_eligible: (data: any) => ({
    subject: `Great news! Your ${data.flight_number} flight qualifies for ${data.compensation_currency}${data.compensation_amount}`,
    html: `
      <div style="font-family: 'Roboto', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
        <div style="background: #073590; padding: 24px; text-align: center;">
          <h1 style="color: #f1c933; margin: 0; font-size: 28px;">
            <span style="color: #f1c933;">Ry</span><span style="color: white;">Unfair</span>
          </h1>
        </div>
        <div style="padding: 32px; background: white;">
          <h2 style="color: #073590; margin-top: 0;">🎉 You're owed compensation!</h2>
          
          <div style="background: #f5f7fa; border-radius: 8px; padding: 24px; margin: 24px 0;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666;">Flight</td>
                <td style="padding: 8px 0; font-weight: bold; text-align: right;">${data.flight_number}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Date</td>
                <td style="padding: 8px 0; text-align: right;">${new Date(data.flight_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666;">Delay</td>
                <td style="padding: 8px 0; color: #dc3545; font-weight: bold; text-align: right;">${Math.floor(data.delay_minutes / 60)}h ${data.delay_minutes % 60}m</td>
              </tr>
              <tr style="border-top: 2px solid #073590;">
                <td style="padding: 16px 0 8px; color: #073590; font-weight: bold; font-size: 18px;">You're owed</td>
                <td style="padding: 16px 0 8px; color: #073590; font-weight: bold; font-size: 24px; text-align: right;">${data.compensation_currency}${data.compensation_amount}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="https://www.ryanair.com/ee/en/myryanair/requests/new/eu-261" 
               style="background: #f1c933; color: #073590; padding: 16px 32px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block; font-size: 16px;">
              Claim Your ${data.compensation_currency}${data.compensation_amount} Now →
            </a>
          </div>

          <p style="color: #333; line-height: 1.6;">
            Under EU261/UK261 law, you're legally entitled to this compensation. Ryanair MUST pay you - it's not optional!
          </p>
          
          <p style="color: #666; font-size: 14px; margin-top: 24px;">
            Need help with your claim? Visit <a href="${APP_URL}" style="color: #073590;">RyUnfair</a> for our step-by-step guide and cheat sheet.
          </p>
        </div>
        <div style="padding: 16px; text-align: center; color: #666; font-size: 12px;">
          <p>RyUnfair - Know your rights. Get your money.</p>
          <p><a href="${APP_URL}/privacy" style="color: #073590;">Privacy Policy</a> | <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(data.email)}" style="color: #073590;">Unsubscribe</a></p>
        </div>
      </div>
    `,
  }),

  followup_donation: (data: any) => ({
    subject: 'Did RyUnfair help you get compensation?',
    html: `
      <div style="font-family: 'Roboto', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
        <div style="background: #073590; padding: 24px; text-align: center;">
          <h1 style="color: #f1c933; margin: 0; font-size: 28px;">
            <span style="color: #f1c933;">Ry</span><span style="color: white;">Unfair</span>
          </h1>
        </div>
        <div style="padding: 32px; background: white;">
          <h2 style="color: #073590; margin-top: 0;">Did we help you get your money back?</h2>
          
          <p style="color: #333; line-height: 1.6;">
            Hi! About two weeks ago, we notified you that your flight <strong>${data.flight_number}</strong> was delayed enough to qualify for <strong>${data.compensation_currency}${data.compensation_amount}</strong> compensation.
          </p>
          
          <p style="color: #333; line-height: 1.6;">
            If RyUnfair helped you successfully claim your compensation, we'd be incredibly grateful if you could donate <strong>5% of your compensation</strong> (${data.compensation_currency}${(data.compensation_amount * 0.05).toFixed(2)}) to help us cover server costs and keep this free service running for others.
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${APP_URL}/donate?amount=${(data.compensation_amount * 0.05).toFixed(2)}&currency=${data.compensation_currency}&flight=${data.flight_number}" 
               style="background: #f1c933; color: #073590; padding: 16px 32px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block; font-size: 16px;">
              Donate ${data.compensation_currency}${(data.compensation_amount * 0.05).toFixed(2)}
            </a>
          </div>

          <p style="color: #666; font-size: 14px;">
            💡 <em>100% of donations go towards keeping RyUnfair free and helping more passengers claim what they're owed.</em>
          </p>
          
          <hr style="border: none; border-top: 1px solid #e0e4e8; margin: 24px 0;">
          
          <p style="color: #333; line-height: 1.6;">
            <strong>Haven't claimed yet?</strong> You still have time! Visit Ryanair's claim portal or check our <a href="${APP_URL}/#guide" style="color: #073590;">step-by-step guide</a>.
          </p>
        </div>
        <div style="padding: 16px; text-align: center; color: #666; font-size: 12px;">
          <p>RyUnfair - Know your rights. Get your money.</p>
          <p><a href="${APP_URL}/privacy" style="color: #073590;">Privacy Policy</a> | <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(data.email)}" style="color: #073590;">Unsubscribe</a></p>
        </div>
      </div>
    `,
  }),

  followup_donation_final: (data: any) => ({
    subject: 'Last chance: Help us help others',
    html: `
      <div style="font-family: 'Roboto', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa;">
        <div style="background: #073590; padding: 24px; text-align: center;">
          <h1 style="color: #f1c933; margin: 0; font-size: 28px;">
            <span style="color: #f1c933;">Ry</span><span style="color: white;">Unfair</span>
          </h1>
        </div>
        <div style="padding: 32px; background: white;">
          <h2 style="color: #073590; margin-top: 0;">One last ask 🙏</h2>
          
          <p style="color: #333; line-height: 1.6;">
            A month ago, we helped identify that your flight <strong>${data.flight_number}</strong> qualified for <strong>${data.compensation_currency}${data.compensation_amount}</strong> in compensation.
          </p>
          
          <p style="color: #333; line-height: 1.6;">
            If you successfully claimed (or plan to), please consider a small donation to keep RyUnfair running. Every contribution helps us fight for passengers' rights against airlines that make claiming deliberately difficult.
          </p>

          <div style="background: #f5f7fa; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 16px; color: #666;">Suggested donation (5% of compensation):</p>
            <p style="margin: 0; font-size: 32px; font-weight: bold; color: #073590;">${data.compensation_currency}${(data.compensation_amount * 0.05).toFixed(2)}</p>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${APP_URL}/donate?amount=${(data.compensation_amount * 0.05).toFixed(2)}&currency=${data.compensation_currency}&flight=${data.flight_number}" 
               style="background: #f1c933; color: #073590; padding: 16px 32px; text-decoration: none; font-weight: bold; border-radius: 4px; display: inline-block; font-size: 16px;">
              Support RyUnfair
            </a>
            <p style="margin-top: 16px;">
              <a href="${APP_URL}/donate?amount=5&currency=GBP" style="color: #073590; text-decoration: underline;">Or donate any amount →</a>
            </p>
          </div>

          <p style="color: #666; font-size: 14px; text-align: center;">
            This is our final follow-up email about this flight. Thank you! ✈️
          </p>
        </div>
        <div style="padding: 16px; text-align: center; color: #666; font-size: 12px;">
          <p>RyUnfair - Know your rights. Get your money.</p>
          <p><a href="${APP_URL}/privacy" style="color: #073590;">Privacy Policy</a> | <a href="${APP_URL}/unsubscribe?email=${encodeURIComponent(data.email)}" style="color: #073590;">Unsubscribe</a></p>
        </div>
      </div>
    `,
  }),
};

export default async function handler(request: Request) {
  // Verify cron secret (prevents unauthorized calls)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const db = getSupabase();
    const emailClient = getResend();

    // Get pending notifications that are due
    const { data: notifications, error } = await db
      .from('pending_notifications')
      .select('*')
      .limit(50); // Process in batches

    if (error) {
      console.error('Error fetching notifications:', error);
      return new Response(JSON.stringify({ error: 'Failed to fetch notifications' }), { status: 500 });
    }

    if (!notifications || notifications.length === 0) {
      return new Response(JSON.stringify({ message: 'No pending notifications' }), { status: 200 });
    }

    let sent = 0;
    let failed = 0;

    for (const notification of notifications) {
      try {
        // Get template
        const templateFn = templates[notification.template_used as keyof typeof templates];
        if (!templateFn) {
          console.error(`Unknown template: ${notification.template_used}`);
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
      } catch (err) {
        console.error(`Failed to send notification ${notification.id}:`, err);
        
        // Mark as failed
        await db
          .from('notifications')
          .update({ status: 'failed' })
          .eq('id', notification.id);

        failed++;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: notifications.length,
        sent,
        failed,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Cron error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

