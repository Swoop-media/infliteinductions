
-- Set up webhook configuration for notifications
-- Replace with your actual webhook URL and secret
ALTER DATABASE postgres SET app.webhook_url = 'https://dacb1217-61ed-4cb0-a794-a7b3ae30caf4-00-2mqfcku6rv7d6.worf.replit.dev';
ALTER DATABASE postgres SET app.webhook_secret = 'e8S0Ge2hdbwFT8M91NMG';

-- Reload configuration
SELECT pg_reload_conf();
