import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const statusCopy: Record<string, { heading: string; message: string }> = {
  "En Route to Collection": {
    heading: "Your driver is heading to the collection",
    message: "Your dedicated KLS SameDay driver is now travelling to the collection address.",
  },
  "Arrived at Collection": {
    heading: "Driver has arrived at collection",
    message: "Your driver has arrived at the collection address.",
  },
  Collected: {
    heading: "Your goods have been collected",
    message: "Your goods have been checked and collected by the KLS SameDay driver.",
  },
  "In Transit": {
    heading: "Your delivery is in transit",
    message: "Your dedicated vehicle is now travelling to the delivery address.",
  },
  "Arrived at Delivery": {
    heading: "Driver has arrived at delivery",
    message: "Your driver has arrived at the delivery address.",
  },
  Delivered: {
    heading: "Your delivery is complete",
    message: "Your delivery has been completed. Proof of delivery is now available from KLS SameDay.",
  },
};

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[character] || character));

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const smtpUser = Deno.env.get("GMAIL_USER") || Deno.env.get("SMTP_USER") || "";
    const smtpPass = Deno.env.get("GMAIL_APP_PASSWORD") || Deno.env.get("SMTP_PASS") || "";
    const smtpHost = Deno.env.get("SMTP_HOST") || "smtp.gmail.com";
    const smtpPort = Number(Deno.env.get("SMTP_PORT") || "465");

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !smtpUser || !smtpPass) {
      throw new Error("Customer email secrets are not configured.");
    }

    const authorization = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorised" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { job_id, status } = await request.json();
    const copy = statusCopy[String(status || "")];
    if (!job_id || !copy) throw new Error("A valid job_id and status are required.");

    const { data: driverId, error: driverError } = await userClient.rpc("current_driver_id");
    if (driverError || !driverId) throw new Error("Driver account is not linked.");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select("id,assigned_driver_id,job_number,customer_id,customer_name,contact_name,customer_email,contact_email,collection_address,delivery_address")
      .eq("id", job_id)
      .eq("assigned_driver_id", driverId)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) throw new Error("Assigned job not found.");

    let recipient = job.customer_email || job.contact_email || "";
    if (!recipient && job.customer_id) {
      const { data: customer } = await admin
        .from("customers")
        .select("email")
        .eq("id", job.customer_id)
        .maybeSingle();
      recipient = customer?.email || "";
    }

    if (!recipient) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "No customer email saved" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const customerName = job.contact_name || job.customer_name || "Customer";
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPass.replace(/\s+/g, "") },
    });

    await transporter.sendMail({
      from: `"KLS SameDay" <${smtpUser}>`,
      to: recipient,
      replyTo: smtpUser,
      subject: `${job.job_number || "Your delivery"} — ${copy.heading}`,
      text: `Hello ${customerName},

${copy.message}

Job: ${job.job_number || "KLS delivery"}
Collection: ${job.collection_address || "—"}
Delivery: ${job.delivery_address || "—"}
Current status: ${status}

Kind regards,
KLS SameDay
0330 043 5237
info@klssameday.co.uk`,
      html: `<!doctype html><html><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:28px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;margin:auto;background:#fff;border-radius:14px;overflow:hidden"><tr><td style="background:#111;padding:22px 28px;color:#fff"><b style="font-size:26px">KLS SameDay</b><div style="font-size:12px;letter-spacing:.12em;margin-top:4px">DEDICATED SAME-DAY LOGISTICS</div></td></tr><tr><td style="padding:30px 28px"><p>Hello ${escapeHtml(customerName)},</p><h1 style="font-size:24px;margin:18px 0 10px">${escapeHtml(copy.heading)}</h1><p style="font-size:16px;line-height:1.6">${escapeHtml(copy.message)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="8" style="margin:22px 0;background:#f7f7f7;border-radius:10px"><tr><td><b>Job</b></td><td>${escapeHtml(job.job_number || "KLS delivery")}</td></tr><tr><td><b>Collection</b></td><td>${escapeHtml(job.collection_address || "—")}</td></tr><tr><td><b>Delivery</b></td><td>${escapeHtml(job.delivery_address || "—")}</td></tr><tr><td><b>Status</b></td><td><b>${escapeHtml(status)}</b></td></tr></table><p style="margin-top:25px">Kind regards,<br><b>KLS SameDay</b><br>0330 043 5237<br>info@klssameday.co.uk</p></td></tr></table></td></tr></table></body></html>`,
    });

    return new Response(JSON.stringify({ ok: true, sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Customer status email failed", error);
    return new Response(JSON.stringify({ error: error?.message || "Customer email failed" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
