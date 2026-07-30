import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !publicKey || !privateKey) {
      throw new Error("Driver push secrets are not configured.");
    }

    const authorization = request.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorised" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { job_id } = await request.json();
    if (!job_id) throw new Error("job_id is required.");
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: job, error: jobError } = await admin
      .from("jobs")
      .select("id,user_id,assigned_driver_id,job_number,collection_address,delivery_address,collection_date,collection_time")
      .eq("id", job_id)
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job?.assigned_driver_id) throw new Error("This job has no assigned driver.");

    const { data: driverAccount } = await admin
      .from("driver_accounts")
      .select("auth_user_id")
      .eq("driver_id", job.assigned_driver_id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let driverAuthUserId = driverAccount?.auth_user_id || null;
    if (!driverAuthUserId) {
      const { data: driver } = await admin
        .from("drivers")
        .select("user_id")
        .eq("id", job.assigned_driver_id)
        .maybeSingle();
      driverAuthUserId = driver?.user_id || null;
    }
    if (!driverAuthUserId) throw new Error("The assigned driver has no linked login.");

    const { data: subscriptions, error: subscriptionError } = await admin
      .from("driver_push_subscriptions")
      .select("id,endpoint,p256dh,auth_key")
      .eq("user_id", driverAuthUserId)
      .eq("active", true);
    if (subscriptionError) throw subscriptionError;

    webpush.setVapidDetails("mailto:info@klssameday.co.uk", publicKey, privateKey);
    const payload = JSON.stringify({
      title: `New KLS job: ${job.job_number || "Assigned job"}`,
      body: `${job.collection_address || "Collection"} → ${job.delivery_address || "Delivery"}${job.collection_date ? ` · ${job.collection_date}${job.collection_time ? ` ${job.collection_time}` : ""}` : ""}`,
      job_id: job.id,
      url: `/driver.html?job=${encodeURIComponent(job.id)}`,
    });

    let sent = 0;
    for (const subscription of subscriptions || []) {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
        }, payload);
        sent += 1;
      } catch (error) {
        const statusCode = Number(error?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("driver_push_subscriptions").delete().eq("id", subscription.id);
        } else {
          console.error("Push delivery failed", error);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || "Push failed" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
