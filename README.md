# Skyhawk Leasing Website v6 — Pricing, Customer Database, Mailchimp

This version adds:

- Future aircraft added in admin automatically show on the website when `Public` is selected.
- Aircraft-level pricing tiers:
  - Unlimited hours for $X/month
  - 50-hour minimum for $X/month + hourly overages
  - Custom / call-for-quote tiers
- Aircraft file database:
  - Photos
  - Videos
  - Logbook scans
  - Maintenance records
  - Other PDFs/documents
- Customer database:
  - Website signup form writes contacts to Supabase
  - Admin can manually add customers
  - Admin can paste/import a flight school CSV
  - Admin can export customers to CSV
- Mailchimp-ready Edge Function:
  - `supabase/functions/mailchimp-sync/index.ts`

## 1. Run setup.sql

Open Supabase SQL Editor and run `setup.sql`.

## 2. Create your admin user

Supabase Dashboard → Authentication → Users → Add user.

Copy the user UUID and run:

```sql
insert into public.admin_users (user_id)
values ('PASTE-YOUR-AUTH-USER-UUID-HERE');
```

## 3. Preview locally

```bash
python -m http.server 8000
```

Open:

```text
http://localhost:8000
http://localhost:8000/admin.html
```

## 4. Mailchimp setup

Do not put your Mailchimp API key in browser code.

Deploy the Edge Function and set secrets:

```bash
supabase functions deploy mailchimp-sync

supabase secrets set MAILCHIMP_API_KEY="YOUR_KEY"
supabase secrets set MAILCHIMP_AUDIENCE_ID="YOUR_AUDIENCE_ID"
supabase secrets set MAILCHIMP_SERVER_PREFIX="usXX"
supabase secrets set MAILCHIMP_DEFAULT_STATUS="subscribed"
```

Your server prefix is the `usXX` part of your Mailchimp API key or API endpoint.

## 5. Customer CSV import format

Paste rows into the Admin bulk import box:

```csv
organization,email,contact,phone,city,state,type
ABC Flight School,info@example.com,John Smith,555-555-5555,Phoenix,AZ,Flight School
```

The importer expects no complex embedded commas. For a large list, use a real CSV import script later.

## Important privacy note

The `customers` table contains contact data. Add a privacy policy before sending marketing emails and only email contacts where you have appropriate permission or a legitimate basis.
