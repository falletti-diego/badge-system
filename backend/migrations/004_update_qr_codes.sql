-- Migration 004: Update QR code content to structured format
-- Replaces placeholder strings (QR_BADGE_*) with proper deep-link format
-- Format: badge://checkin?site_id=<uuid>&client_id=<uuid>&v=1
-- v=1 is the version field — used for future rotation support

UPDATE sites
SET
  qr_code_content = 'badge://checkin?site_id=' || id::text || '&client_id=' || client_id::text || '&v=1',
  updated_at = NOW()
WHERE qr_code_content LIKE 'QR_BADGE_%';
