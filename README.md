# RyUnfair ✈️💰

Track your Ryanair flight delays and claim the compensation you're legally entitled to under EU261/UK261 law.

## Features

- 🛫 **Real-time flight tracking** - Track delays as they happen
- 💰 **Compensation calculator** - Know exactly how much you're owed (€250-€600)
- 📧 **Email notifications** - Get notified when your delay qualifies
- 📅 **Calendar export** - Add claim reminders to your calendar
- 📚 **Claim guide** - Step-by-step instructions to get your money
- 🎯 **Cheat sheet** - Insider tips for dealing with Ryanair's claim system
- ⚖️ **Know the law** - Full EU261/UK261 explanation with key court cases
- 🔒 **UK GDPR compliant** - Only collects email, full data export/delete

## Quick Start

### Prerequisites

- Node.js 18+
- [Supabase](https://supabase.com) project
- [Resend](https://resend.com) account for emails
- [Vercel](https://vercel.com) account for deployment

### 1. Clone & Install

```bash
git clone https://github.com/Matthias0x44/RyUnfair.git
cd RyUnfair
npm install
```

### 2. Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the contents of `supabase/schema.sql`
3. Copy your project URL and service role key

### 3. Configure Environment

Copy `env.template` to `.env.local` and fill in:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
RESEND_API_KEY=re_xxxxxxxxxxxxx
FROM_EMAIL=RyUnfair <notifications@yourdomain.com>
CRON_SECRET=your-random-secret
```

### 4. Deploy to Vercel

```bash
npm run deploy
# Or connect your GitHub repo to Vercel for auto-deploys
```

Add the same environment variables in Vercel project settings.

### 5. Set Up Email Domain (Resend)

1. Go to [Resend](https://resend.com) and add your domain
2. Verify DNS records as instructed
3. Update `FROM_EMAIL` to use your verified domain

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Frontend      │────▶│   Vercel API    │────▶│    Supabase     │
│   (Static)      │     │   (Edge Funcs)  │     │   (Database)    │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              ▼
                        ┌─────────────────┐
                        │                 │
                        │     Resend      │
                        │    (Emails)     │
                        │                 │
                        └─────────────────┘
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/subscribe` | POST | Subscribe for flight notifications |
| `/api/track-flight` | POST | Track a flight |
| `/api/verify` | GET | Verify email address |
| `/api/unsubscribe` | GET | Unsubscribe from emails |
| `/api/user/data` | GET | Export all user data (GDPR) |
| `/api/user/data` | DELETE | Delete all user data (GDPR) |
| `/api/cron/send-notifications` | GET | Send pending emails (cron) |

## GDPR Compliance

This app is designed to be fully UK GDPR compliant:

### Data Collected
- ✅ Email address (only)
- ✅ Flight tracking data (number, date, airports)
- ❌ No names, addresses, or payment info collected

### User Rights Implemented
- ✅ Right to access (data export)
- ✅ Right to erasure (data deletion)
- ✅ Right to withdraw consent (unsubscribe)
- ✅ Explicit consent before processing
- ✅ Privacy policy

### Technical Measures
- ✅ IP addresses hashed (not stored raw)
- ✅ Audit logging
- ✅ Soft delete with 30-day retention
- ✅ Row-level security in database
- ✅ Encryption in transit (HTTPS)

### ICO Registration

Before going live, register with the [ICO](https://ico.org.uk/for-organisations/register/).

## Email Schedule

When a user subscribes and tracks a flight:

1. **Immediately**: Verification email sent
2. **When delay confirmed**: Result notification with claim link
3. **15 days later**: Follow-up asking if they claimed (with donation link)
4. **30 days later**: Final follow-up (with donation link)

## Local Development

```bash
# Start development server
npm run dev

# For static frontend only (no API)
python3 -m http.server 8080
```

## Updating the Privacy Policy

Edit `privacy.html` and update:
- Company name and address
- ICO registration number
- Contact email
- Data Protection Officer details

## Support the Project

If RyUnfair helped you claim compensation, consider donating 5% back to help cover hosting costs and keep this free for others.

## Legal Disclaimer

RyUnfair is not affiliated with Ryanair. This tool helps passengers understand and exercise their legal rights under EU Regulation 261/2004 and UK261. Always verify delay times with official sources before claiming.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Made with ✈️ by passengers, for passengers.
