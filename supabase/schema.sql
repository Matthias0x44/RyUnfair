-- =============================================
-- RyUnfair Supabase Schema
-- UK GDPR Compliant Database Structure
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS TABLE
-- Stores email and consent information only
-- =============================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    
    -- GDPR Consent tracking
    consent_given BOOLEAN NOT NULL DEFAULT FALSE,
    consent_timestamp TIMESTAMPTZ,
    consent_ip_hash VARCHAR(64), -- Hashed IP, not raw (GDPR compliant)
    
    -- Marketing consent (separate from service emails)
    marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Data management
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ, -- Soft delete for audit trail
    
    -- Verification
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verification_token UUID,
    verification_sent_at TIMESTAMPTZ,
    
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Index for email lookups
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- =============================================
-- TRACKED FLIGHTS TABLE
-- Flight data linked to users
-- =============================================
CREATE TABLE tracked_flights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Flight details
    flight_number VARCHAR(10) NOT NULL,
    flight_date DATE NOT NULL,
    departure_airport VARCHAR(4) NOT NULL,
    arrival_airport VARCHAR(4) NOT NULL,
    
    -- Calculated data
    distance_km INTEGER,
    
    -- Delay tracking
    delay_minutes INTEGER DEFAULT 0,
    delay_confirmed BOOLEAN DEFAULT FALSE,
    doors_open_time TIMESTAMPTZ,
    
    -- Compensation
    compensation_eligible BOOLEAN DEFAULT FALSE,
    compensation_amount DECIMAL(10, 2),
    compensation_currency VARCHAR(3) DEFAULT 'EUR',
    
    -- Status
    status VARCHAR(20) DEFAULT 'tracking', -- tracking, completed, claimed, expired
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Prevent duplicate tracking
    UNIQUE(user_id, flight_number, flight_date)
);

-- Indexes for queries
CREATE INDEX idx_flights_user ON tracked_flights(user_id);
CREATE INDEX idx_flights_status ON tracked_flights(status);
CREATE INDEX idx_flights_date ON tracked_flights(flight_date);

-- =============================================
-- NOTIFICATIONS TABLE
-- Track all emails sent (for GDPR audit)
-- =============================================
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    flight_id UUID REFERENCES tracked_flights(id) ON DELETE SET NULL,
    
    -- Notification details
    type VARCHAR(50) NOT NULL, -- 'flight_result', 'followup_15d', 'followup_30d', 'verification'
    
    -- Email content (stored for audit)
    subject VARCHAR(255) NOT NULL,
    template_used VARCHAR(100),
    
    -- Delivery tracking
    status VARCHAR(20) DEFAULT 'pending', -- pending, sent, delivered, failed, bounced
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    
    -- External service tracking
    external_id VARCHAR(255), -- Resend message ID
    
    -- Scheduling
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_status ON notifications(status);
CREATE INDEX idx_notifications_scheduled ON notifications(scheduled_for) WHERE status = 'pending';

-- =============================================
-- GDPR AUDIT LOG
-- Required for demonstrating compliance
-- =============================================
CREATE TABLE gdpr_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- What happened
    action VARCHAR(50) NOT NULL, -- 'consent_given', 'consent_withdrawn', 'data_exported', 'data_deleted', 'data_accessed'
    
    -- Who (nullable for deleted users)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_email_hash VARCHAR(64), -- Keep hashed email even after deletion
    
    -- Details
    details JSONB,
    
    -- Request metadata (hashed/anonymized)
    ip_hash VARCHAR(64),
    user_agent_hash VARCHAR(64),
    
    -- Timestamp
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for compliance queries
CREATE INDEX idx_audit_user ON gdpr_audit_log(user_id);
CREATE INDEX idx_audit_action ON gdpr_audit_log(action);
CREATE INDEX idx_audit_date ON gdpr_audit_log(created_at);

-- =============================================
-- DONATION TRACKING (Optional)
-- Track if users donate after successful claims
-- =============================================
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    flight_id UUID REFERENCES tracked_flights(id) ON DELETE SET NULL,
    
    -- Donation details
    amount DECIMAL(10, 2),
    currency VARCHAR(3) DEFAULT 'GBP',
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending', -- pending, completed, failed
    
    -- External reference (Stripe, etc.)
    external_id VARCHAR(255),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- Users can only access their own data
-- =============================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own data
CREATE POLICY users_own_data ON users
    FOR ALL USING (id = auth.uid());

CREATE POLICY flights_own_data ON tracked_flights
    FOR ALL USING (user_id = auth.uid());

CREATE POLICY notifications_own_data ON notifications
    FOR ALL USING (user_id = auth.uid());

-- Service role bypasses RLS for API operations
-- (Vercel functions use service role key)

-- =============================================
-- FUNCTIONS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER flights_updated_at
    BEFORE UPDATE ON tracked_flights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function to hash IP/email for GDPR compliance
CREATE OR REPLACE FUNCTION hash_for_gdpr(input TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    RETURN encode(sha256(input::bytea), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to schedule follow-up notifications
CREATE OR REPLACE FUNCTION schedule_followup_notifications()
RETURNS TRIGGER AS $$
BEGIN
    -- Only schedule if flight is completed and eligible
    IF NEW.status = 'completed' AND NEW.compensation_eligible = TRUE THEN
        -- Schedule 15-day follow-up
        INSERT INTO notifications (user_id, flight_id, type, subject, template_used, scheduled_for)
        VALUES (
            NEW.user_id,
            NEW.id,
            'followup_15d',
            'Did RyUnfair help you get compensation?',
            'followup_donation',
            NOW() + INTERVAL '15 days'
        );
        
        -- Schedule 30-day follow-up
        INSERT INTO notifications (user_id, flight_id, type, subject, template_used, scheduled_for)
        VALUES (
            NEW.user_id,
            NEW.id,
            'followup_30d',
            'Last chance: Help us help others',
            'followup_donation_final',
            NOW() + INTERVAL '30 days'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for follow-up scheduling
CREATE TRIGGER schedule_followups
    AFTER UPDATE ON tracked_flights
    FOR EACH ROW
    WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'completed')
    EXECUTE FUNCTION schedule_followup_notifications();

-- =============================================
-- VIEWS FOR COMMON QUERIES
-- =============================================

-- View: Pending notifications to send
CREATE VIEW pending_notifications AS
SELECT 
    n.*,
    u.email,
    f.flight_number,
    f.flight_date,
    f.compensation_amount,
    f.compensation_currency
FROM notifications n
JOIN users u ON n.user_id = u.id
LEFT JOIN tracked_flights f ON n.flight_id = f.id
WHERE n.status = 'pending'
    AND n.scheduled_for <= NOW()
    AND u.deleted_at IS NULL
    AND u.email_verified = TRUE;

-- View: User data export (GDPR compliance)
CREATE VIEW user_data_export AS
SELECT 
    u.id,
    u.email,
    u.consent_given,
    u.consent_timestamp,
    u.marketing_consent,
    u.created_at,
    json_agg(DISTINCT jsonb_build_object(
        'flight_number', f.flight_number,
        'flight_date', f.flight_date,
        'departure', f.departure_airport,
        'arrival', f.arrival_airport,
        'delay_minutes', f.delay_minutes,
        'compensation_eligible', f.compensation_eligible,
        'compensation_amount', f.compensation_amount,
        'created_at', f.created_at
    )) FILTER (WHERE f.id IS NOT NULL) as flights,
    json_agg(DISTINCT jsonb_build_object(
        'type', n.type,
        'sent_at', n.sent_at,
        'status', n.status
    )) FILTER (WHERE n.id IS NOT NULL) as notifications
FROM users u
LEFT JOIN tracked_flights f ON u.id = f.user_id
LEFT JOIN notifications n ON u.id = n.user_id
WHERE u.deleted_at IS NULL
GROUP BY u.id;

-- =============================================
-- DATA RETENTION POLICY
-- Auto-delete old data per GDPR requirements
-- Run this as a scheduled function (pg_cron or Supabase)
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete soft-deleted users after 30 days
    DELETE FROM users 
    WHERE deleted_at IS NOT NULL 
    AND deleted_at < NOW() - INTERVAL '30 days';
    
    -- Delete old audit logs after 7 years (UK legal requirement)
    DELETE FROM gdpr_audit_log 
    WHERE created_at < NOW() - INTERVAL '7 years';
    
    -- Delete old notifications after 2 years
    DELETE FROM notifications 
    WHERE created_at < NOW() - INTERVAL '2 years';
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- SAMPLE DATA (for testing - remove in production)
-- =============================================

-- Uncomment to add test data:
-- INSERT INTO users (email, consent_given, consent_timestamp, email_verified)
-- VALUES ('test@example.com', true, NOW(), true);

