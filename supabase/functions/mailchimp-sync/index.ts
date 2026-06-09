// Supabase Edge Function: mailchimp-sync
// Deploy: supabase functions deploy mailchimp-sync
// Secrets needed:
// MAILCHIMP_API_KEY, MAILCHIMP_AUDIENCE_ID, MAILCHIMP_SERVER_PREFIX, MAILCHIMP_DEFAULT_STATUS=subscribed

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

async function md5Hex(message: string) {
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("MD5", msgUint8);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders() });
  }

  try {
    const { customer } = await req.json();
    if (!customer?.email) throw new Error("Missing customer.email");

    const apiKey = Deno.env.get("MAILCHIMP_API_KEY");
    const audienceId = Deno.env.get("MAILCHIMP_AUDIENCE_ID");
    const serverPrefix = Deno.env.get("MAILCHIMP_SERVER_PREFIX");
    const status = Deno.env.get("MAILCHIMP_DEFAULT_STATUS") || "subscribed";

    if (!apiKey || !audienceId || !serverPrefix) {
      return json({ ok: false, skipped: true, message: "Mailchimp secrets are not configured." }, 200);
    }

    const email = String(customer.email).trim().toLowerCase();
    const subscriberHash = await md5Hex(email);

    const names = String(customer.contact_name || "").trim().split(/\s+/);
    const firstName = names[0] || "";
    const lastName = names.slice(1).join(" ");

    const memberBody = {
      email_address: email,
      status_if_new: customer.marketing_consent === false ? "pending" : status,
      merge_fields: {
        FNAME: firstName,
        LNAME: lastName,
        ORG: customer.organization_name || "",
        PHONE: customer.phone || "",
        CITY: customer.city || "",
        STATE: customer.state || "",
        TYPE: customer.customer_type || "",
        HOURS: customer.monthly_hours || ""
      }
    };

    const auth = "Basic " + btoa("anystring:" + apiKey);
    const memberUrl = `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`;

    const memberRes = await fetch(memberUrl, {
      method: "PUT",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify(memberBody)
    });

    const memberJson = await memberRes.json().catch(() => ({}));
    if (!memberRes.ok) return json({ ok: false, mailchimp: memberJson }, 400);

    const tags = [
      customer.customer_type || "Website Lead",
      "Skyhawk Leasing",
      customer.state ? `State: ${customer.state}` : null
    ].filter(Boolean).map((name) => ({ name, status: "active" }));

    await fetch(`${memberUrl}/tags`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({ tags })
    });

    return json({ ok: true, mailchimp_id: memberJson.id || null }, 200);
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }
});

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}
