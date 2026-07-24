(() => {
  const vehicles = {
    'Small Van': { minimum: 85, ppm: 1.50 },
    'Medium Van': { minimum: 100, ppm: 1.75 },
    'LWB': { minimum: 125, ppm: 2.00 },
    'Luton Tail Lift': { minimum: 150, ppm: 2.40 }
  };

  const rawConfig = window.KLS_CONFIG || {};

  function normaliseSupabaseUrl(value) {
    const raw = String(value || '').trim().replace(/^['"]|['"]$/g, '');
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if (!/^https?:$/.test(parsed.protocol)) return '';
      // Vercel must contain the Supabase PROJECT URL, not the REST endpoint.
      // This safely converts URLs such as https://project.supabase.co/rest/v1/
      // back to https://project.supabase.co.
      return parsed.origin;
    } catch (_error) {
      return '';
    }
  }

  const config = {
    supabaseUrl: normaliseSupabaseUrl(rawConfig.supabaseUrl),
    supabaseAnonKey: String(rawConfig.supabaseAnonKey || '').trim().replace(/^['"]|['"]$/g, '')
  };
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey && window.supabase);
  const db = configured ? window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey) : null;

  const defaults = {
    trading_name: 'KLS SameDay',
    legal_name: 'Kings Logistics Services Ltd',
    phone: '0330 043 5237',
    whatsapp: '07361 854157',
    email: 'info@klssameday.co.uk',
    website: 'www.klssameday.co.uk',
    address_line: 'Essex – Nationwide coverage',
    bank_name: '',
    sort_code: '',
    account_number: '',
    default_terms: 7
  };

  let state = {
    page: 'dashboard',
    user: null,
    customers: [],
    drivers: [],
    fleet: [],
    fuelLogs: [],
    maintenance: [],
    recurringJobs: [],
    scheduleMonth: new Date().toISOString().slice(0,7),
    quotes: [],
    jobs: [],
    invoices: [],
    expenses: [],
    settings: { ...defaults },
    notice: null,
    loading: true,
    authMode: 'signin',
    selectedCustomerId: null,
    quoteCustomerId: null,
    selectedDriverJobId: null,
    publicTracking: null
  };

  let locationWatchId = null;
  let trackingPollId = null;

  const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value || 0));
  const fmtDate = value => value ? new Date(value).toLocaleDateString('en-GB') : '—';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const numberCode = prefix => `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const showNotice = (text, type = 'ok') => { state.notice = { text, type }; };
  const invoicePaid = inv => Number(inv.amount_paid || (inv.status === 'Paid' ? inv.total : 0) || 0);
  const invoiceBalance = inv => Math.max(0, Number(inv.total || 0) - invoicePaid(inv));
  const invoiceDisplayStatus = inv => invoiceBalance(inv) <= 0 && inv.status !== 'Cancelled' ? 'Paid' : invoicePaid(inv) > 0 ? 'Part-paid' : (inv.status || 'Unpaid');

  function authView() {
    const signUp = state.authMode === 'signup';
    return `<div class="authwrap"><section class="authcard">
      <div class="authbrand"><b>KLS</b><div><strong>SameDay Office</strong><br><small>Secure business system</small></div></div>
      <h1>${signUp ? 'Create your login' : 'Sign in'}</h1>
      <p>${configured ? 'Your records will be stored securely online.' : 'Supabase settings are missing in Vercel.'}</p>
      ${!configured ? '<div class="authmsg error">The VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variable is missing.</div>' : ''}
      <form id="auth-form">
        <label>Email address<input name="email" type="email" autocomplete="email" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
        <button class="primary" style="width:100%" ${configured ? '' : 'disabled'}>${signUp ? 'Create Account' : 'Sign In'}</button>
      </form>
      <div id="auth-message"></div>
      <div class="authswitch">${signUp ? 'Already registered?' : 'First time using the system?'} <button data-auth-mode="${signUp ? 'signin' : 'signup'}">${signUp ? 'Sign in' : 'Create account'}</button></div>
    </section></div>`;
  }

  const navItems = [['dashboard','Dashboard'],['operations','Today’s Planner'],['dispatch','Dispatch Centre'],['driver','Driver App'],['fleet','Fleet Management'],['schedule','Booking Calendar'],['newquote','New Quote'],['quotes','Quotes'],['jobs','Jobs'],['invoices','Invoices'],['accounts','Accounts & Payments'],['customers','CRM / Customers'],['settings','Settings']];

  function layout(content) {
    const title = navItems.find(([key]) => key === state.page)?.[1] || 'Dashboard';
    return `<div class="shell"><aside id="side" class="side">
      <div class="logo"><b>KLS</b><span>SameDay Office</span></div>
      <button class="close" data-action="menu-close">×</button>
      <div class="account">${esc(state.user?.email || '')}</div>
      <nav>${navItems.map(([key,label]) => `<button class="${state.page === key ? 'active' : ''}" data-page="${key}">${label}</button>`).join('')}</nav>
      <div class="sidefooter"><span class="connection"><span class="dot"></span> Supabase connected</span><button data-action="signout">Sign out</button></div>
    </aside><main>
      <header><button class="hamb" data-action="menu-open">☰</button><div><h1>${title}</h1><p>KLS SameDay business control centre</p></div><button class="primary" data-page="newquote">＋ New Quote</button></header>
      ${state.notice ? `<div class="notice ${state.notice.type}">${esc(state.notice.text)}<button data-action="notice-close">×</button></div>` : ''}
      ${content}
    </main></div>`;
  }

  const panel = (title, body, sub = '', right = '') => `<section class="panel"><div class="panelhead"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>${body}</section>`;
  const card = (title, value, note = '', page = '') => `<button class="card dashboard-card" ${page ? `data-page="${page}"` : ''}><span>◆</span><div><small>${title}</small><b>${value}</b>${note ? `<em>${note}</em>` : ''}</div></button>`;

  function dashboard() {
    const now = new Date();
    const today = todayISO();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const validJobs = state.jobs.filter(job => job.job_status !== 'Cancelled');
    const monthJobs = validJobs.filter(job => {
      const raw = job.collection_date || job.created_at;
      const date = raw ? new Date(raw) : null;
      return date && !Number.isNaN(date.getTime()) && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    });
    const todayJobs = validJobs.filter(job => String(job.collection_date || '').slice(0,10) === today);
    const activeJobs = validJobs.filter(job => !['Delivered'].includes(job.job_status));
    const deliveredJobs = validJobs.filter(job => job.job_status === 'Delivered');
    const revenue = monthJobs.reduce((sum, job) => sum + Number(job.total_price || 0), 0);
    const paidThisMonth = state.invoices.filter(inv => {
      if (inv.status !== 'Paid') return false;
      const raw = inv.paid_date || inv.issue_date || inv.created_at;
      const date = raw ? new Date(raw) : null;
      return date && !Number.isNaN(date.getTime()) && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
    }).reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const unpaid = state.invoices.filter(inv => !['Paid','Cancelled'].includes(inv.status));
    const outstanding = unpaid.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const overdue = unpaid.filter(inv => inv.due_date && String(inv.due_date).slice(0,10) < today);
    const overdueTotal = overdue.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const pendingQuotes = state.quotes.filter(q => q.status === 'Pending');
    const totalMiles = monthJobs.reduce((sum, job) => sum + Number(job.miles || 0), 0);
    const averageJob = monthJobs.length ? revenue / monthJobs.length : 0;

    const monthLabels = [];
    const monthValues = [];
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(currentYear, currentMonth - offset, 1);
      monthLabels.push(date.toLocaleDateString('en-GB', { month: 'short' }));
      monthValues.push(validJobs.filter(job => {
        const raw = job.collection_date || job.created_at;
        const d = raw ? new Date(raw) : null;
        return d && !Number.isNaN(d.getTime()) && d.getMonth() === date.getMonth() && d.getFullYear() === date.getFullYear();
      }).reduce((sum, job) => sum + Number(job.total_price || 0), 0));
    }
    const maxValue = Math.max(...monthValues, 1);
    const chart = `<div class="revenue-chart">${monthValues.map((value, index) => `<div class="chart-column"><div class="chart-value">${value ? money(value) : '£0'}</div><div class="chart-track"><div class="chart-bar" style="height:${Math.max(value ? (value / maxValue) * 100 : 3, 3)}%"></div></div><small>${monthLabels[index]}</small></div>`).join('')}</div>`;

    const attention = [
      overdue.length ? `<button data-page="invoices"><b>${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'}</b><span>${money(overdueTotal)} needs attention</span></button>` : '',
      pendingQuotes.length ? `<button data-page="quotes"><b>${pendingQuotes.length} pending quote${pendingQuotes.length === 1 ? '' : 's'}</b><span>Waiting to be accepted or followed up</span></button>` : '',
      activeJobs.length ? `<button data-page="jobs"><b>${activeJobs.length} active job${activeJobs.length === 1 ? '' : 's'}</b><span>Booked, collected or in transit</span></button>` : '',
      !overdue.length && !pendingQuotes.length && !activeJobs.length ? `<div class="all-clear"><b>All clear</b><span>Nothing urgent needs your attention.</span></div>` : ''
    ].filter(Boolean).join('');

    const todaysRows = todayJobs.length ? jobTable(todayJobs.slice(0, 6)) : `<div class="dashboard-empty"><b>No jobs booked for today</b><p>Create a quote or review upcoming work.</p><button class="primary" data-page="newquote">＋ New Quote</button></div>`;

    return `<section class="hero dashboard-hero"><div><small>KLS SAMEDAY CONTROL CENTRE</small><h2>${todayJobs.length ? `${todayJobs.length} job${todayJobs.length === 1 ? '' : 's'} booked today` : 'Your business at a glance'}</h2><p>${overdue.length ? `${overdue.length} overdue invoice${overdue.length === 1 ? '' : 's'} need attention.` : 'Quotes, jobs, invoices and cash flow in one place.'}</p></div><button data-page="newquote">＋ NEW QUOTE</button></section>
      <section class="cards dashboard-cards">${card('Today’s jobs', todayJobs.length, activeJobs.length ? `${activeJobs.length} active overall` : 'No active jobs', 'jobs')}${card('Monthly turnover', money(revenue), `${monthJobs.length} job${monthJobs.length === 1 ? '' : 's'} · ${Math.round(totalMiles)} miles`, 'jobs')}${card('Outstanding', money(outstanding), overdue.length ? `${money(overdueTotal)} overdue` : 'Nothing overdue', 'invoices')}${card('Paid this month', money(paidThisMonth), `${deliveredJobs.length} delivered overall`, 'invoices')}</section>
      <section class="dashboard-grid">
        ${panel('Today’s jobs', todaysRows, todayJobs.length ? 'Collection schedule for today.' : 'Your schedule is clear.', '<button class="secondary" data-page="jobs">View all jobs</button>')}
        ${panel('Needs attention', `<div class="attention-list">${attention}</div>`, 'The items most likely to need action next.')}
      </section>
      <section class="dashboard-grid lower">
        ${panel('Six-month turnover', chart, 'Job value by collection month.')}
        ${panel('This month', `<div class="mini-metrics"><div><small>Average job</small><b>${money(averageJob)}</b></div><div><small>Total miles</small><b>${Math.round(totalMiles).toLocaleString('en-GB')}</b></div><div><small>Jobs booked</small><b>${monthJobs.length}</b></div><div><small>Pending quotes</small><b>${pendingQuotes.length}</b></div></div>`, 'Quick performance snapshot.')}
      </section>
      ${panel('Latest jobs', jobTable(state.jobs.slice(0, 8)), 'Most recently added work.', '<button class="secondary" data-page="jobs">Open jobs</button>')}`;
  }


  function operationsView() {
    const today = todayISO();
    const todayJobs = state.jobs
      .filter(job => job.job_status !== 'Cancelled' && String(job.collection_date || '').slice(0,10) === today)
      .sort((a,b) => String(a.collection_time || '23:59').localeCompare(String(b.collection_time || '23:59')));
    const activeJobs = state.jobs.filter(job => !['Delivered','Cancelled'].includes(job.job_status));
    const deliveredToday = state.jobs.filter(job => job.job_status === 'Delivered' && String(job.collection_date || '').slice(0,10) === today);
    const unpaid = state.invoices.filter(inv => !['Paid','Cancelled'].includes(inv.status));
    const outstanding = unpaid.reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    const pendingQuotes = state.quotes.filter(q => q.status === 'Pending');
    const todayRevenue = todayJobs.reduce((sum, job) => sum + Number(job.total_price || 0), 0);

    const timeline = todayJobs.length ? todayJobs.map(job => {
      const time = job.collection_time ? String(job.collection_time).slice(0,5) : 'TBC';
      const nextStatus = job.job_status === 'Booked' ? 'Collected' : job.job_status === 'Collected' ? 'In Transit' : job.job_status === 'In Transit' ? 'Delivered' : '';
      return `<article class="planner-item"><div class="planner-time">${esc(time)}</div><div class="planner-dot ${String(job.job_status || '').toLowerCase().replace(/\s+/g,'-')}"></div><div class="planner-job"><div class="planner-job-head"><div><b>${esc(job.job_number || 'Job')}</b><span>${esc(job.job_status || 'Booked')}</span></div><strong>${money(job.total_price)}</strong></div><h3>${esc(job.customer_name || job.contact_name || 'Customer')}</h3><p><small>COLLECT</small>${esc(job.collection_address || 'Not set')}</p><p><small>DELIVER</small>${esc(job.delivery_address || 'Not set')}</p><div class="planner-actions"><button class="secondary" data-page="jobs">Open job</button>${nextStatus ? `<button class="primary" data-move-job="${job.id}" data-move-status="${nextStatus}">Mark ${esc(nextStatus)}</button>` : ''}</div></div></article>`;
    }).join('') : `<div class="planner-empty"><div>✓</div><h3>No jobs booked today</h3><p>Your day is clear. Add a new quote or check the dispatch board.</p><button class="primary" data-page="newquote">＋ New Quote</button></div>`;

    const activeList = activeJobs.slice(0,6).map(job => `<button class="ops-list-row" data-page="dispatch"><span><b>${esc(job.job_number || 'Job')}</b><small>${esc(job.customer_name || job.contact_name || '')}</small></span><em>${esc(job.job_status || 'Booked')}</em></button>`).join('') || '<div class="ops-clear">No active jobs.</div>';
    const quoteList = pendingQuotes.slice(0,5).map(q => `<button class="ops-list-row" data-page="quotes"><span><b>${esc(q.quote_number)}</b><small>${esc(q.customer_name)}</small></span><strong>${money(q.quoted_price)}</strong></button>`).join('') || '<div class="ops-clear">No quotes awaiting reply.</div>';

    return `<section class="ops-hero"><div><small>DAILY OPERATIONS</small><h2>${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</h2><p>Everything you need to run today’s work from one screen.</p></div><div class="ops-quick"><button class="primary" data-page="newquote">＋ New Quote</button><button class="secondary" data-page="dispatch">Open Dispatch</button></div></section>
      <section class="ops-stats">${card('Jobs today', todayJobs.length, `${activeJobs.length} active overall`, 'jobs')}${card('Today’s value', money(todayRevenue), `${deliveredToday.length} delivered today`, 'jobs')}${card('Outstanding', money(outstanding), `${unpaid.length} unpaid invoice${unpaid.length===1?'':'s'}`, 'invoices')}${card('Quotes awaiting reply', pendingQuotes.length, 'Follow up pending quotes', 'quotes')}</section>
      <section class="operations-layout"><div class="planner-panel"><div class="panelhead"><div><h2>Today’s planner</h2><p>Collection schedule in time order.</p></div><button class="secondary" data-page="jobs">All jobs</button></div><div class="planner-timeline">${timeline}</div></div>
      <aside class="operations-side">${panel('Active jobs', `<div class="ops-list">${activeList}</div>`, 'Current work not yet delivered.', '<button class="secondary" data-page="dispatch">Board</button>')}${panel('Pending quotes', `<div class="ops-list">${quoteList}</div>`, 'Quotes that may need following up.', '<button class="secondary" data-page="quotes">View all</button>')}</aside></section>
      <section class="ops-bottom-actions"><button data-page="newquote"><b>＋</b><span><strong>New Quote</strong><small>Price and save a job</small></span></button><button data-page="customers"><b>👤</b><span><strong>Add Customer</strong><small>Create or update a contact</small></span></button><button data-page="dispatch"><b>🚚</b><span><strong>Dispatch Board</strong><small>Move jobs through each stage</small></span></button><button data-page="invoices"><b>£</b><span><strong>Invoices</strong><small>Check money owed</small></span></button></section>`;
  }

  function newQuote() {
    const selected = state.customers.find(c => c.id === state.quoteCustomerId) || {};
    return panel('Smart Quote Builder', `<form id="quote-form">
      <div class="quote-builder-head"><div><small>KLS PRICING ENGINE</small><h3>Build a consistent quote in seconds</h3><p>Enter the route mileage, choose a vehicle and add any extras. The total updates instantly.</p></div><div class="rate-pill">Minimum or mileage rate — whichever is higher</div></div>
      <div class="grid"><label>Customer / company *<input name="company" required value="${esc(selected.company || '')}"></label><label>Contact name<input name="contact_name" value="${esc(selected.contact_name || '')}"></label><label>Telephone / WhatsApp<input name="phone" value="${esc(selected.phone || '')}"></label></div>
      <div class="grid"><label>Email<input name="email" type="email" value="${esc(selected.email || '')}"></label><label>Collection date<input name="collection_date" type="date" value="${todayISO()}"></label><label>Collection time<input name="collection_time" type="time"></label></div>
      <div class="grid two"><label>Collection address / postcode *<textarea name="collection_address" required></textarea></label><label>Main delivery address / postcode *<textarea name="delivery_address" required></textarea></label></div><label>Additional delivery stops (one per line)<textarea name="route_stops" placeholder="Drop 2 address\nDrop 3 address\nDrop 4 address"></textarea><em>These are saved to the quote and job as a multi-drop route.</em></label>
      <div class="route-tools"><button type="button" class="secondary" data-action="open-route">Open route in Google Maps</button><span>Use the route mileage shown by Google Maps, then enter it below.</span></div>
      <div class="grid"><label>Vehicle<select name="vehicle">${Object.keys(vehicles).map(v => `<option>${v}</option>`).join('')}</select></label><label>Distance (miles)<input name="miles" type="number" min="0" step="0.1" value="0"></label><label>Base delivery charge<input name="base_charge" type="number" readonly></label></div>
      <div class="extras-box"><div class="extras-title"><div><small>OPTIONAL EXTRAS</small><h3>Add only what applies</h3></div><button type="button" class="secondary" data-action="clear-extras">Clear extras</button></div>
        <div class="extras-grid">
          <label>Waiting after free 30 mins (hours)<input name="waiting_hours" type="number" min="0" step="0.25" value="0"><em>£60 per hour</em></label>
          <label>Loading assistance<select name="loading_ends"><option value="0">None</option><option value="1">One end — £20</option><option value="2">Both ends — £40</option></select></label>
          <label>Extra drops<input name="extra_drops" type="number" min="0" step="1" value="0"><em>£25 each</em></label>
          <label>Manual charges<input name="manual_extras" type="number" min="0" step="0.01" value="0"><em>Tolls, ULEZ, congestion, ferry</em></label>
          <label>Surcharge<select name="surcharge"><option value="0">None</option><option value="0.25">Night +25%</option><option value="0.30">Saturday +30%</option><option value="0.50">Sunday / Bank Holiday +50%</option></select></label>
        </div>
      </div>
      <div class="quote-total-card"><div><small>SUGGESTED TOTAL</small><strong id="suggestion">£85.00</strong><span id="price-breakdown">Small Van minimum charge</span></div><label>Your final quoted price<input name="quoted_price" type="number" min="0" step="0.01"></label></div>
      <label>Goods description<input name="goods_description"></label><label>Notes<textarea name="notes"></textarea></label>
      <div class="actions"><button type="reset" class="secondary">Clear</button><button class="primary">Save Quote</button></div>
    </form>`, 'Your agreed KLS rates, extras and surcharges are built into this calculator. Automatic postcode mileage needs a Google Maps API key; the route button provides a no-cost mileage check for now.');
  }

  function table(headers, rows) {
    return `<div class="tablewrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="empty">Nothing here yet.</td></tr>`}</tbody></table></div>`;
  }

  function quotesView() {
    return panel('Quotes', table(['Quote','Customer','Route','Vehicle','Price','Status','Actions'], state.quotes.map(q => [
      esc(q.quote_number), esc(q.customer_name), `${esc(q.collection_address)}<br><i>→ ${esc(q.delivery_address)}</i>`, esc(q.vehicle), money(q.quoted_price), esc(q.status),
      `<button data-print-quote="${q.id}">Print</button><button data-email-quote="${q.id}">Email</button><button data-whatsapp-quote="${q.id}">WhatsApp</button>${q.status === 'Pending' ? `<button data-accept="${q.id}">Accept → Job</button>` : ''}`
    ])));
  }

  function jobTable(rows) {
    return table(['Job','Customer','Route','Vehicle','Price','Status','Invoice'], rows.map(j => [
      esc(j.job_number || 'Pending'), esc(j.customer_name || j.contact_name || ''), `${esc(j.collection_address)}<br><i>→ ${esc(j.delivery_address)}</i>`, esc(j.vehicle), money(j.total_price),
      `<select data-job-status="${j.id}">${['Booked','En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery','Delivered','Cancelled'].map(s => `<option ${j.job_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`,
      `<button data-invoice="${j.id}" ${j.job_status !== 'Delivered' ? 'disabled' : ''}>Create Invoice</button>`
    ]));
  }

  function jobsView() { return panel('Jobs', jobTable(state.jobs), '', '<label class="search">Search <input id="job-search"></label>'); }

  const driverStatuses = ['Booked','En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery','Delivered'];

  function trackingUrl(job) {
    if (!job?.tracking_token) return '';
    return `${location.origin}${location.pathname}?track=${encodeURIComponent(job.tracking_token)}`;
  }

  function driverView() {
    const jobs = state.jobs.filter(j => j.job_status !== 'Cancelled').sort((a,b) => new Date(a.collection_date || a.created_at || 0) - new Date(b.collection_date || b.created_at || 0));
    const cards = jobs.map(job => {
      const active = !['Delivered','Cancelled'].includes(job.job_status);
      const index = driverStatuses.indexOf(job.job_status);
      const next = index >= 0 && index < driverStatuses.length - 1 ? driverStatuses[index + 1] : (job.job_status === 'Booked' ? 'En Route to Collection' : '');
      return `<article class="driver-card ${active ? 'active' : ''}"><div class="driver-card-head"><div><small>${fmtDate(job.collection_date)} ${esc(String(job.collection_time || '').slice(0,5))}</small><h3>${esc(job.job_number || 'Job')}</h3></div><span>${esc(job.job_status || 'Booked')}</span></div><b>${esc(job.customer_name || 'Customer')}</b><div class="driver-route"><p><small>COLLECT</small>${esc(job.collection_address || '')}</p><p><small>DELIVER</small>${esc(job.delivery_address || '')}</p></div><div class="driver-buttons"><button class="secondary" data-driver-open="${job.id}">Open Job</button><button class="secondary" data-driver-nav="${job.id}">Navigate</button>${next ? `<button class="primary" data-driver-status="${job.id}" data-status="${esc(next)}">${esc(next)}</button>` : ''}</div></article>`;
    }).join('');
    return `<section class="ops-hero driver-hero"><div><small>MOBILE DRIVER WORKSPACE</small><h2>Driver App</h2><p>Update jobs, share live location and capture photo, signature and recipient details.</p></div><div class="live-pill">● GPS ready</div></section><div class="driver-list">${cards || '<div class="empty">No active jobs.</div>'}</div>${driverModal()}`;
  }

  function driverModal() {
    const job = state.jobs.find(j => j.id === state.selectedDriverJobId);
    if (!job) return '';
    const hasPod = Boolean(job.pod_photo_url || job.pod_signature_url || job.recipient_name);
    return `<div class="modalback" data-action="driver-close"><section class="customermodal driver-modal" onclick="event.stopPropagation()"><div class="modalhead"><div><small>DRIVER JOB</small><h2>${esc(job.job_number || 'Job')}</h2><p>${esc(job.customer_name || '')}</p></div><button data-action="driver-close">×</button></div><div class="driver-route large"><p><small>COLLECTION</small>${esc(job.collection_address || '')}</p><p><small>DELIVERY</small>${esc(job.delivery_address || '')}</p></div><div class="driver-status-grid">${driverStatuses.map(status => `<button type="button" class="${job.job_status === status ? 'primary' : 'secondary'}" data-driver-status="${job.id}" data-status="${status}">${status}</button>`).join('')}</div><div class="driver-assignment-strip"><label>Assigned driver<select data-driver-assign="${job.id}"><option value="">Unassigned</option>${state.drivers.map(d=>`<option value="${d.id}" ${job.assigned_driver_id===d.id?'selected':''}>${esc(d.name)} · ${esc(d.vehicle||'Vehicle TBC')}</option>`).join('')}</select></label><label>Customer ETA<input type="datetime-local" data-job-eta="${job.id}" value="${job.eta_at ? String(job.eta_at).slice(0,16) : ''}"></label><button type="button" class="secondary" data-save-eta="${job.id}">Save ETA</button></div><div class="tracking-controls"><button class="primary" data-action="start-tracking" data-job="${job.id}">Start Live Tracking</button><button class="secondary" data-action="stop-tracking">Stop Tracking</button><button class="secondary" data-copy-track="${job.id}">Copy Customer Link</button><button class="secondary" data-share-track="${job.id}">Share Tracking</button><small>Location updates while this Driver App remains open and location permission is allowed.</small></div><form id="pod-form"><h3>Proof of Delivery</h3><div class="grid two"><label>Recipient name<input name="recipient_name" value="${esc(job.recipient_name || '')}" required></label><label>Delivery notes<input name="pod_notes" value="${esc(job.pod_notes || '')}"></label></div><label>Delivery photo<input name="pod_photo" type="file" accept="image/*" capture="environment"></label><label>Recipient signature<div class="signature-wrap"><canvas id="signature-canvas" width="700" height="240"></canvas><button type="button" class="secondary" data-action="clear-signature">Clear signature</button></div></label>${hasPod ? `<div class="existing-pod">Existing POD saved ${job.delivered_at ? fmtDate(job.delivered_at) : ''}${job.pod_photo_url ? `<a href="${esc(job.pod_photo_url)}" target="_blank">View photo</a>` : ''}${job.pod_signature_url ? `<a href="${esc(job.pod_signature_url)}" target="_blank">View signature</a>` : ''}</div>` : ''}<div class="actions"><button type="button" class="secondary" data-action="driver-close">Cancel</button><button class="primary">Save POD & Mark Delivered</button></div></form></section></div>`;
  }

  function publicTrackingView(data, loading=false, error='') {
    if (loading) return `<div class="public-track"><div class="track-card"><div class="track-logo"><b>KLS</b><span>SameDay Live Tracking</span></div><div class="loading">Loading delivery…</div></div></div>`;
    if (error || !data) return `<div class="public-track"><div class="track-card"><div class="track-logo"><b>KLS</b><span>SameDay Live Tracking</span></div><h1>Tracking unavailable</h1><p>${esc(error || 'This tracking link is invalid or has expired.')}</p></div></div>`;
    const maps = data.last_latitude && data.last_longitude ? `https://www.google.com/maps?q=${data.last_latitude},${data.last_longitude}` : '';
    return `<div class="public-track"><div class="track-card"><div class="track-logo"><b>KLS</b><span>SameDay Live Tracking</span></div><small>JOB ${esc(data.job_number || '')}</small><h1>${esc(data.status || 'Booked')}</h1><div class="track-progress">${driverStatuses.map((s,i) => `<span class="${i <= Math.max(driverStatuses.indexOf(data.status),0) ? 'done' : ''}"></span>`).join('')}</div><div class="track-route"><p><small>COLLECTION</small>${esc(data.collection_area || 'Collection arranged')}</p><p><small>DELIVERY</small>${esc(data.delivery_area || 'Delivery arranged')}</p></div>${Array.isArray(data.route_stops) && data.route_stops.length ? `<div class="track-stops"><small>ADDITIONAL STOPS</small>${data.route_stops.map((stop,i)=>`<p>${i+2}. ${esc(stop)}</p>`).join('')}</div>` : ''}${data.eta_at ? `<div class="eta-box"><small>ESTIMATED ARRIVAL</small><b>${new Date(data.eta_at).toLocaleString('en-GB')}</b></div>` : ''}${maps ? `<a class="primary button-link map-link" href="${maps}" target="_blank">View latest driver location</a>` : '<div class="track-waiting">Live location will appear once the driver starts tracking.</div>'}<div class="track-update">Last update: ${data.location_updated_at ? new Date(data.location_updated_at).toLocaleString('en-GB') : 'Not started'}</div>${data.status === 'Delivered' ? `<div class="delivered-box"><b>Delivered</b><span>${data.delivered_at ? new Date(data.delivered_at).toLocaleString('en-GB') : ''}</span><span>${data.recipient_name ? `Received by ${esc(data.recipient_name)}` : ''}</span></div>` : ''}<footer>Dedicated vehicle • No shared loads<br>0330 043 5237 · info@klssameday.co.uk</footer></div></div>`;
  }

  const dispatchStatuses = ['Booked','En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery','Delivered'];

  function dispatchCard(job) {
    const statusIndex = dispatchStatuses.indexOf(job.job_status);
    const previous = statusIndex > 0 ? dispatchStatuses[statusIndex - 1] : '';
    const next = statusIndex >= 0 && statusIndex < dispatchStatuses.length - 1 ? dispatchStatuses[statusIndex + 1] : '';
    const time = job.collection_time ? String(job.collection_time).slice(0,5) : 'Time TBC';
    const stops = Array.isArray(job.route_stops) ? job.route_stops : [];
    return `<article class="dispatch-card" draggable="true" data-dispatch-job="${job.id}">
      <div class="dispatch-card-head"><b>${esc(job.job_number || 'Job')}</b><span>${esc(time)}</span></div>
      <h3>${esc(job.customer_name || job.contact_name || 'Customer')}</h3>
      <div class="dispatch-route"><p><small>COLLECT</small>${esc(job.collection_address || 'Not set')}</p><span>↓</span><p><small>DELIVER</small>${esc(job.delivery_address || 'Not set')}</p>${stops.length ? `<p><small>EXTRA STOPS</small>${stops.map((x,i)=>`${i+2}. ${esc(x)}`).join('<br>')}</p>` : ''}</div>
      <div class="dispatch-assignment"><label>Driver<select data-assign-job="${job.id}"><option value="">Unassigned</option>${state.drivers.map(d=>`<option value="${d.id}" ${job.assigned_driver_id===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label>${job.eta_at ? `<span class="eta-pill">ETA ${new Date(job.eta_at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>` : ''}</div>
      <div class="dispatch-meta"><span>${esc(job.vehicle || 'Vehicle TBC')}</span><span>${money(job.total_price)}</span></div>
      <div class="dispatch-card-actions">${previous ? `<button class="secondary" data-move-job="${job.id}" data-move-status="${previous}">←</button>` : ''}<button class="secondary" data-driver-open="${job.id}">Open</button>${next ? `<button class="primary" data-move-job="${job.id}" data-move-status="${next}">${esc(next)} →</button>` : ''}</div>
      ${job.invoice_status === 'Invoiced' ? '<div class="dispatch-badge">INVOICED</div>' : ''}
    </article>`;
  }

  function dispatchView() {
    const active = state.jobs.filter(job => !['Cancelled','Delivered'].includes(job.job_status));
    const unassigned = active.filter(job => !job.assigned_driver_id);
    const driverPanels = state.drivers.map(driver => {
      const jobs = active.filter(job => job.assigned_driver_id === driver.id);
      const live = jobs.find(j => j.last_latitude && j.last_longitude);
      return `<section class="driver-dispatch-card"><div class="driver-dispatch-head"><div><span class="driver-status-dot ${driver.active===false||driver.availability_status==='Offline'?'off':''}"></span><h3>${esc(driver.name)}</h3><p>${esc(driver.vehicle || 'Vehicle TBC')} · ${esc(driver.phone || 'No phone')}</p></div><b>${jobs.length} job${jobs.length===1?'':'s'}</b></div><label class="driver-availability">Availability<select data-driver-availability="${driver.id}">${['Available','On Job','Break','Offline'].map(x=>`<option ${String(driver.availability_status||'Available')===x?'selected':''}>${x}</option>`).join('')}</select></label>${live ? `<a class="secondary button-link" target="_blank" href="https://www.google.com/maps?q=${live.last_latitude},${live.last_longitude}">Open live location</a>` : '<small class="muted">No live GPS update yet</small>'}<div class="driver-job-stack">${jobs.map(dispatchCard).join('') || '<div class="dispatch-empty">No jobs assigned</div>'}</div></section>`;
    }).join('');
    return `<section class="dispatch-toolbar"><div><small>V12 LIVE OPERATIONS</small><h2>Dispatch Centre</h2><p>See live vehicles on the map, assign jobs, update stages and control driver availability.</p></div><div><button class="secondary" data-page="jobs">Table view</button><button class="primary" data-page="newquote">＋ New Quote</button></div></section>
      <section class="dispatch-kpis">${card('Active jobs',active.length,'Not delivered','jobs')}${card('Unassigned',unassigned.length,'Needs a driver','dispatch')}${card('Drivers',state.drivers.length,'Manage below','dispatch')}${card('Live GPS',active.filter(j=>j.last_latitude&&j.last_longitude).length,'Jobs reporting location','driver')}</section>
      <section class="live-map-panel"><div class="live-map-head"><div><small>LIVE FLEET MAP</small><h2>Driver locations</h2><p>Markers use the latest GPS update from each active job.</p></div><button class="secondary" data-action="refresh-map">Refresh map</button></div><div id="dispatch-map" class="dispatch-map"></div><div id="map-empty" class="map-empty hidden">No live GPS positions yet. Start tracking from the Driver App.</div></section>
      <section class="driver-manager"><div><h2>Drivers</h2><p>Add a driver or vehicle, then set availability and assign work.</p></div><form id="driver-form"><input name="name" placeholder="Driver name" required><input name="phone" placeholder="Phone"><input name="vehicle" placeholder="Vehicle / registration"><button class="primary">Add Driver</button></form></section>
      <section class="dispatch-centre-grid"><div><h2>Unassigned work</h2><div class="driver-job-stack">${unassigned.map(dispatchCard).join('') || '<div class="dispatch-empty">Everything is assigned.</div>'}</div></div><div class="driver-roster">${driverPanels || '<div class="dispatch-empty">Add your first driver above.</div>'}</div></section>${driverModal()}`;
  }


  function invoicesView() {
    return panel('Invoices', table(['Invoice','Customer','Issue','Due','Total','Paid','Balance','Status','Actions'], state.invoices.map(inv => [
      esc(inv.invoice_number), esc(inv.customer_name), fmtDate(inv.issue_date), fmtDate(inv.due_date), money(inv.total), money(invoicePaid(inv)), money(invoiceBalance(inv)),
      `<span class="account-status ${invoiceDisplayStatus(inv).toLowerCase().replace(/[^a-z]/g,'')}">${esc(invoiceDisplayStatus(inv))}</span>`,
      `<button data-record-payment="${inv.id}">Payment</button><button data-print-invoice="${inv.id}">Print</button>`
    ])), 'Record payments from the Accounts page or directly against an invoice.');
  }

  function accountsView() {
    const active = state.invoices.filter(i => i.status !== 'Cancelled');
    const totalInvoiced = active.reduce((s,i)=>s+Number(i.total||0),0);
    const totalPaid = active.reduce((s,i)=>s+invoicePaid(i),0);
    const outstanding = active.reduce((s,i)=>s+invoiceBalance(i),0);
    const overdue = active.filter(i=>invoiceBalance(i)>0 && i.due_date && i.due_date < todayISO()).reduce((s,i)=>s+invoiceBalance(i),0);
    const month = todayISO().slice(0,7);
    const monthIncome = active.filter(i=>String(i.paid_date||'').slice(0,7)===month).reduce((s,i)=>s+invoicePaid(i),0);
    const monthExpenses = state.expenses.filter(e=>String(e.expense_date||'').slice(0,7)===month).reduce((s,e)=>s+Number(e.amount||0),0);
    const rows = active.map(inv=>[esc(inv.invoice_number),esc(inv.customer_name),money(inv.total),money(invoicePaid(inv)),money(invoiceBalance(inv)),esc(invoiceDisplayStatus(inv)),`<button data-record-payment="${inv.id}">Record payment</button>`]);
    const expenseRows = state.expenses.map(e=>[fmtDate(e.expense_date),esc(e.category),esc(e.supplier||'—'),esc(e.description||'—'),money(e.amount),`<button class="danger" data-delete-expense="${e.id}">Delete</button>`]);
    return `<section class="accounts-hero"><div><small>V15 ACCOUNTS & PAYMENTS</small><h2>Cash flow and business costs</h2><p>Track invoice balances, payments, overdue accounts and operating expenses.</p></div></section>
      <section class="cards accounts-kpis">${card('Total invoiced',money(totalInvoiced),'All active invoices','invoices')}${card('Received',money(totalPaid),'Payments recorded','accounts')}${card('Outstanding',money(outstanding),`${money(overdue)} overdue`,'accounts')}${card('This month profit',money(monthIncome-monthExpenses),`${money(monthIncome)} in · ${money(monthExpenses)} out`,'accounts')}</section>
      <section class="accounts-layout"><div>${panel('Customer balances',table(['Invoice','Customer','Total','Paid','Balance','Status','Action'],rows),'Part-payments automatically update the balance and status.')}</div>
      <div class="accounts-side">${panel('Record an expense',`<form id="expense-form"><label>Date<input name="expense_date" type="date" value="${todayISO()}" required></label><label>Category<select name="category"><option>Fuel</option><option>Vehicle</option><option>Insurance</option><option>Maintenance</option><option>Tolls & Parking</option><option>Office</option><option>Marketing</option><option>Subcontractor</option><option>Other</option></select></label><label>Supplier<input name="supplier"></label><label>Description<input name="description"></label><label>Amount<input name="amount" type="number" step="0.01" min="0" required></label><button class="primary" style="width:100%">Save Expense</button></form>`)}
      ${panel('Recent expenses',table(['Date','Category','Supplier','Description','Amount',''],expenseRows),'Running business costs saved securely.')}</div></section>`;
  }

  function customerMetrics(customer) {
    const quotes = state.quotes.filter(q => q.customer_id === customer.id);
    const jobs = state.jobs.filter(j => j.customer_id === customer.id);
    const invoices = state.invoices.filter(i => i.customer_id === customer.id);
    const invoiced = invoices.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const paid = invoices.filter(item => item.status === 'Paid').reduce((sum, item) => sum + Number(item.total || 0), 0);
    const outstanding = invoices.filter(item => !['Paid','Cancelled'].includes(item.status)).reduce((sum, item) => sum + Number(item.total || 0), 0);
    const lastJob = [...jobs].sort((a,b) => new Date(b.collection_date || b.created_at || 0) - new Date(a.collection_date || a.created_at || 0))[0];
    const accepted = quotes.filter(item => item.status === 'Accepted').length;
    return { quotes, jobs, invoices, invoiced, paid, outstanding, lastJob, accepted };
  }

  function customersView() {
    const enriched = state.customers.map(customer => ({ customer, metrics: customerMetrics(customer) }))
      .sort((a,b) => b.metrics.invoiced - a.metrics.invoiced || String(a.customer.company).localeCompare(String(b.customer.company)));
    const totalRevenue = enriched.reduce((sum,row) => sum + row.metrics.invoiced, 0);
    const totalOutstanding = enriched.reduce((sum,row) => sum + row.metrics.outstanding, 0);
    const activeCustomers = enriched.filter(row => row.metrics.jobs.length || row.metrics.quotes.length).length;
    const topCustomer = enriched[0];
    const cards = enriched.map(({customer:c, metrics:m}) => `<article class="crm-card" data-customer="${c.id}" tabindex="0" role="button">
      <div class="crm-card-head"><div class="avatar">${esc((c.company || '?')[0].toUpperCase())}</div><div><strong>${esc(c.company)}</strong><p>${esc(c.contact_name || 'No contact name')}</p></div><span class="crm-open">Open →</span></div>
      <div class="crm-contact"><span>${esc(c.phone || 'No phone')}</span><span>${esc(c.email || 'No email')}</span></div>
      <div class="crm-card-stats"><div><small>Revenue</small><b>${money(m.invoiced)}</b></div><div><small>Outstanding</small><b class="${m.outstanding ? 'warning-text' : ''}">${money(m.outstanding)}</b></div><div><small>Jobs</small><b>${m.jobs.length}</b></div></div>
      <div class="crm-last"><small>LAST JOB</small><span>${m.lastJob ? `${fmtDate(m.lastJob.collection_date || m.lastJob.created_at)} · ${esc(m.lastJob.job_status || 'Booked')}` : 'No jobs yet'}</span></div>
    </article>`).join('');
    return `<section class="crm-hero"><div><small>SALES & CUSTOMER RELATIONSHIPS</small><h2>Customer CRM</h2><p>See customer value, outstanding money and full history in one place.</p></div><button class="primary" data-action="new-customer">＋ Add Customer</button></section>
      <section class="crm-kpis">${card('Customers', state.customers.length, `${activeCustomers} with activity`, '')}${card('Customer revenue', money(totalRevenue), 'Total invoices raised', '')}${card('Outstanding', money(totalOutstanding), 'Across all customers', 'invoices')}${card('Top customer', topCustomer ? esc(topCustomer.customer.company) : '—', topCustomer ? money(topCustomer.metrics.invoiced) : 'No revenue yet', '')}</section>
      ${panel('Customer accounts', `<div class="customergrid crm-grid">${cards || '<div class="empty">No customers yet.</div>'}</div>${customerModal()}`, 'Click any customer to open their profile, activity and account history.', '<div class="customer-tools"><label class="search">Search <input id="customer-search" placeholder="Company, contact, phone or email"></label><button class="primary" data-action="new-customer">＋ Add Customer</button></div>')}`;
  }

  function customerModal() {
    const c = state.customers.find(x => x.id === state.selectedCustomerId);
    if (!c && !state.selectedCustomerId) return '';
    const isNew = state.selectedCustomerId === 'new';
    const customer = c || { company:'', contact_name:'', phone:'', email:'', billing_address:'', payment_terms:7, notes:'' };
    const metrics = isNew ? {quotes:[],jobs:[],invoices:[],invoiced:0,paid:0,outstanding:0,lastJob:null,accepted:0} : customerMetrics(customer);
    const activity = [
      ...metrics.quotes.map(item => ({date:item.created_at, type:'Quote', title:item.quote_number, value:item.quoted_price, status:item.status})),
      ...metrics.jobs.map(item => ({date:item.collection_date || item.created_at, type:'Job', title:item.job_number || 'Job', value:item.total_price, status:item.job_status})),
      ...metrics.invoices.map(item => ({date:item.issue_date || item.created_at, type:'Invoice', title:item.invoice_number, value:item.total, status:item.status}))
    ].sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0,12);
    return `<div class="modalback" data-action="customer-close"><section class="customermodal crm-modal" onclick="event.stopPropagation()"><div class="modalhead"><div><small>${isNew ? 'NEW CUSTOMER' : 'CUSTOMER 360° PROFILE'}</small><h2>${esc(customer.company || 'Add customer')}</h2>${!isNew ? `<p>${esc(customer.contact_name || '')}${customer.phone ? ` · ${esc(customer.phone)}` : ''}</p>` : ''}</div><button data-action="customer-close">×</button></div>
      ${isNew ? '' : `<div class="crm-profile-actions"><button class="primary" data-new-quote-customer="${customer.id}">＋ New Quote</button>${customer.phone ? `<a class="secondary button-link" href="tel:${esc(customer.phone)}">Call</a>` : ''}${customer.email ? `<a class="secondary button-link" href="mailto:${esc(customer.email)}">Email</a>` : ''}</div>`}
      <form id="customer-form"><div class="grid two"><label>Company *<input name="company" required value="${esc(customer.company)}"></label><label>Contact name<input name="contact_name" value="${esc(customer.contact_name || '')}"></label><label>Telephone<input name="phone" value="${esc(customer.phone || '')}"></label><label>Email<input name="email" type="email" value="${esc(customer.email || '')}"></label><label>Billing address<textarea name="billing_address">${esc(customer.billing_address || '')}</textarea></label><label>Payment terms (days)<input name="payment_terms" type="number" min="0" value="${Number(customer.payment_terms || 7)}"></label></div><label>Relationship notes<textarea name="notes" placeholder="Buying preferences, usual routes, contact notes or follow-up details">${esc(customer.notes || '')}</textarea></label><div class="actions"><button type="button" class="secondary" data-action="customer-close">Cancel</button><button class="primary">${isNew ? 'Save Customer' : 'Save Changes'}</button></div></form>
      ${isNew ? '' : `<div class="customerstats crm-profile-stats"><div><small>Total invoiced</small><b>${money(metrics.invoiced)}</b></div><div><small>Paid</small><b>${money(metrics.paid)}</b></div><div><small>Outstanding</small><b>${money(metrics.outstanding)}</b></div><div><small>Jobs</small><b>${metrics.jobs.length}</b></div><div><small>Quotes</small><b>${metrics.quotes.length}</b></div><div><small>Accepted quotes</small><b>${metrics.accepted}</b></div></div>
      <div class="crm-profile-grid"><div class="crm-timeline"><h3>Customer timeline</h3>${activity.map(item => `<div class="crm-event"><span>${esc(item.type)}</span><div><b>${esc(item.title || item.type)}</b><small>${fmtDate(item.date)} · ${esc(item.status || '')}</small></div><strong>${money(item.value)}</strong></div>`).join('') || '<p class="muted">No customer activity yet.</p>'}</div><div class="crm-account"><h3>Account summary</h3><p><span>Payment terms</span><b>${Number(customer.payment_terms || 7)} days</b></p><p><span>Last job</span><b>${metrics.lastJob ? fmtDate(metrics.lastJob.collection_date || metrics.lastJob.created_at) : '—'}</b></p><p><span>Last job status</span><b>${metrics.lastJob ? esc(metrics.lastJob.job_status || 'Booked') : '—'}</b></p><p><span>Outstanding balance</span><b>${money(metrics.outstanding)}</b></p><h3>Notes</h3><div class="crm-notes">${esc(customer.notes || 'No relationship notes saved.')}</div></div></div>`}
    </section></div>`;
  }

  function fleetView() {
    const today = todayISO();
    const dueSoon = date => date && new Date(date).getTime() <= Date.now() + 30*86400000;
    const active = state.fleet.filter(v => v.active !== false);
    const totalFuel = state.fuelLogs.reduce((s,x)=>s+Number(x.cost||0),0);
    const maintenanceCost = state.maintenance.reduce((s,x)=>s+Number(x.cost||0),0);
    const alerts = active.flatMap(v => [
      v.mot_expiry && dueSoon(v.mot_expiry) ? `${v.registration || v.name}: MOT ${v.mot_expiry < today ? 'expired' : 'due soon'}` : '',
      v.insurance_expiry && dueSoon(v.insurance_expiry) ? `${v.registration || v.name}: insurance ${v.insurance_expiry < today ? 'expired' : 'due soon'}` : '',
      v.service_due_mileage && Number(v.current_mileage||0) >= Number(v.service_due_mileage) ? `${v.registration || v.name}: service mileage reached` : ''
    ]).filter(Boolean);
    const vehicleCards = active.map(v => {
      const fuel = state.fuelLogs.filter(x=>x.vehicle_id===v.id);
      const repairs = state.maintenance.filter(x=>x.vehicle_id===v.id);
      const spent = fuel.reduce((s,x)=>s+Number(x.cost||0),0)+repairs.reduce((s,x)=>s+Number(x.cost||0),0);
      return `<article class="fleet-card"><div class="fleet-card-head"><div><small>${esc(v.vehicle_type||'VEHICLE')}</small><h3>${esc(v.name||v.registration||'Vehicle')}</h3><p>${esc(v.registration||'No registration')} · ${Number(v.current_mileage||0).toLocaleString('en-GB')} miles</p></div><span>${v.active===false?'Inactive':'Active'}</span></div><div class="fleet-dates"><p><small>MOT</small><b>${fmtDate(v.mot_expiry)}</b></p><p><small>Insurance</small><b>${fmtDate(v.insurance_expiry)}</b></p><p><small>Service due</small><b>${v.service_due_mileage ? Number(v.service_due_mileage).toLocaleString('en-GB')+' mi' : fmtDate(v.service_due_date)}</b></p></div><div class="fleet-cost"><span>Recorded running cost</span><b>${money(spent)}</b></div><div class="fleet-actions"><button class="secondary" data-fuel-vehicle="${v.id}">Add fuel</button><button class="secondary" data-maint-vehicle="${v.id}">Add maintenance</button><button class="danger" data-vehicle-delete="${v.id}">Remove</button></div></article>`;
    }).join('') || '<div class="fleet-empty">No vehicles added yet.</div>';
    return `<section class="fleet-hero"><div><small>V13 FLEET CONTROL</small><h2>Fleet Management</h2><p>Vehicles, compliance dates, fuel and maintenance in one place.</p></div><button class="primary" data-action="vehicle-form-focus">＋ Add Vehicle</button></section>
      <section class="cards fleet-kpis">${card('Active vehicles',active.length)}${card('Compliance alerts',alerts.length,alerts.length?'Action required':'All clear')}${card('Fuel recorded',money(totalFuel))}${card('Maintenance spend',money(maintenanceCost))}</section>
      ${alerts.length?panel('Needs attention',`<div class="fleet-alerts">${alerts.map(x=>`<div>⚠ ${esc(x)}</div>`).join('')}</div>`,'MOT, insurance and service reminders within 30 days.'):''}
      <section class="fleet-layout"><div>${panel('Vehicles',`<div class="fleet-grid">${vehicleCards}</div>`,'Your current working fleet.')}</div><div class="fleet-side">
      ${panel('Add vehicle',`<form id="vehicle-form"><label>Vehicle name<input name="name" placeholder="Luton Tail Lift" required></label><div class="grid two"><label>Registration<input name="registration" placeholder="AB12 CDE"></label><label>Vehicle type<select name="vehicle_type">${Object.keys(vehicles).map(x=>`<option>${x}</option>`).join('')}</select></label><label>Current mileage<input name="current_mileage" type="number" min="0"></label><label>Service due mileage<input name="service_due_mileage" type="number" min="0"></label><label>MOT expiry<input name="mot_expiry" type="date"></label><label>Insurance expiry<input name="insurance_expiry" type="date"></label></div><div class="actions"><button class="primary">Save Vehicle</button></div></form>`)}
      ${panel('Recent costs',`<div class="fleet-log">${[...state.fuelLogs.map(x=>({...x,kind:'Fuel'})),...state.maintenance.map(x=>({...x,kind:x.category||'Maintenance'}))].sort((a,b)=>new Date(b.log_date||b.created_at)-new Date(a.log_date||a.created_at)).slice(0,8).map(x=>{const v=state.fleet.find(v=>v.id===x.vehicle_id);return `<p><span><b>${esc(x.kind)}</b><small>${esc(v?.registration||v?.name||'Vehicle')} · ${fmtDate(x.log_date||x.created_at)}</small></span><strong>${money(x.cost)}</strong></p>`}).join('')||'<div class="fleet-empty">No costs recorded.</div>'}`)}
      </div></section>
      <div id="fleet-modal"></div>`;
  }

  function scheduleDateKey(value) {
    return value ? String(value).slice(0,10) : '';
  }

  function addFrequency(dateValue, frequency) {
    const date = new Date(`${dateValue}T12:00:00`);
    if (frequency === 'Weekly') date.setDate(date.getDate() + 7);
    else if (frequency === 'Fortnightly') date.setDate(date.getDate() + 14);
    else if (frequency === 'Monthly') date.setMonth(date.getMonth() + 1);
    else date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0,10);
  }

  function scheduleView() {
    const monthStart = new Date(`${state.scheduleMonth}-01T12:00:00`);
    const year = monthStart.getFullYear(), month = monthStart.getMonth();
    const firstMondayOffset = (monthStart.getDay() + 6) % 7;
    const gridStart = new Date(monthStart); gridStart.setDate(1 - firstMondayOffset);
    const monthLabel = monthStart.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    const jobs = state.jobs.filter(j => j.job_status !== 'Cancelled');
    const cells = Array.from({length:42},(_,i)=>{
      const date = new Date(gridStart); date.setDate(gridStart.getDate()+i);
      const key = date.toISOString().slice(0,10);
      const dayJobs = jobs.filter(j => scheduleDateKey(j.collection_date)===key).sort((a,b)=>String(a.collection_time||'23:59').localeCompare(String(b.collection_time||'23:59')));
      const outside = date.getMonth()!==month;
      return `<div class="calendar-day ${outside?'outside':''} ${key===todayISO()?'today':''}" data-schedule-date="${key}"><div class="calendar-date"><b>${date.getDate()}</b><span>${dayJobs.length||''}</span></div><div class="calendar-jobs">${dayJobs.slice(0,4).map(j=>`<button draggable="true" class="calendar-job" data-calendar-job="${j.id}" title="Drag to reschedule"><small>${esc(String(j.collection_time||'TBC').slice(0,5))}</small><b>${esc(j.job_number||'Job')}</b><span>${esc(j.customer_name||j.contact_name||'Customer')}</span></button>`).join('')}${dayJobs.length>4?`<em>+${dayJobs.length-4} more</em>`:''}</div></div>`;
    }).join('');
    const upcoming = jobs.filter(j=>scheduleDateKey(j.collection_date)>=todayISO()).sort((a,b)=>`${a.collection_date||''} ${a.collection_time||''}`.localeCompare(`${b.collection_date||''} ${b.collection_time||''}`)).slice(0,8);
    const dueRecurring = state.recurringJobs.filter(r=>r.active!==false && r.next_run_date && r.next_run_date<=todayISO());
    return `<section class="schedule-hero"><div><small>V14 JOB SCHEDULING</small><h2>Booking Calendar</h2><p>Book work, reschedule jobs by dragging them and manage repeat customers.</p></div><button class="primary" data-action="schedule-form-focus">＋ Quick Booking</button></section>
      <section class="schedule-toolbar"><div><button class="secondary" data-schedule-shift="-1">‹</button><button class="secondary" data-schedule-today>Today</button><button class="secondary" data-schedule-shift="1">›</button></div><h2>${monthLabel}</h2><span>${jobs.filter(j=>scheduleDateKey(j.collection_date).slice(0,7)===state.scheduleMonth).length} jobs this month</span></section>
      <section class="calendar-wrap"><div class="calendar-weekdays">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<b>${x}</b>`).join('')}</div><div class="calendar-grid">${cells}</div></section>
      <section class="schedule-lower"><div>${panel('Quick booking',`<form id="schedule-booking-form"><div class="grid two"><label>Customer / company<input name="customer_name" required></label><label>Contact email<input name="customer_email" type="email"></label><label>Collection date<input name="collection_date" type="date" value="${todayISO()}" required></label><label>Collection time<input name="collection_time" type="time"></label><label>Collection address<input name="collection_address" required></label><label>Delivery address<input name="delivery_address" required></label><label>Vehicle<select name="vehicle">${Object.keys(vehicles).map(v=>`<option>${v}</option>`).join('')}</select></label><label>Price<input name="total_price" type="number" step="0.01" min="0"></label><label>Driver<select name="assigned_driver_id"><option value="">Auto-allocate / unassigned</option>${state.drivers.filter(d=>d.active!==false).map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label><label>Notes<input name="booking_notes"></label></div><div class="actions"><button class="primary">Create Booking</button></div></form>`,'Creates a confirmed job without needing a quote first.')}</div>
      <div class="schedule-side">${panel('Upcoming jobs',`<div class="schedule-list">${upcoming.map(j=>`<button data-page="jobs"><span><b>${esc(j.job_number||'Job')}</b><small>${fmtDate(j.collection_date)} ${esc(String(j.collection_time||'').slice(0,5))}</small></span><em>${esc(j.assigned_driver_name||'Unassigned')}</em></button>`).join('')||'<div class="fleet-empty">No upcoming bookings.</div>'}</div>`)}
      ${panel('Recurring bookings',`<form id="recurring-form"><label>Customer<input name="customer_name" required></label><label>Collection address<input name="collection_address" required></label><label>Delivery address<input name="delivery_address" required></label><div class="grid two"><label>Frequency<select name="frequency"><option>Daily</option><option>Weekly</option><option>Fortnightly</option><option>Monthly</option></select></label><label>Next date<input name="next_run_date" type="date" value="${todayISO()}" required></label><label>Time<input name="collection_time" type="time"></label><label>Vehicle<select name="vehicle">${Object.keys(vehicles).map(v=>`<option>${v}</option>`).join('')}</select></label></div><button class="primary" style="width:100%">Save Repeat Booking</button></form><div class="repeat-list">${state.recurringJobs.map(r=>`<p><span><b>${esc(r.customer_name)}</b><small>${esc(r.frequency)} · next ${fmtDate(r.next_run_date)}</small></span><button class="secondary" data-recurring-generate="${r.id}">${r.next_run_date<=todayISO()?'Generate due job':'Generate next'}</button></p>`).join('')||'<div class="fleet-empty">No repeat bookings.</div>'}</div>${dueRecurring.length?`<button class="primary" data-generate-all-recurring style="width:100%">Generate ${dueRecurring.length} due job${dueRecurring.length===1?'':'s'}</button>`:''}`,'Repeat jobs are generated when you press the button, so nothing is booked accidentally.')}</div></section>`;
  }

  function settingsView() {
    const fields = { trading_name:'Trading name',legal_name:'Legal company name',phone:'Telephone',whatsapp:'WhatsApp',email:'Email',website:'Website',address_line:'Business address',bank_name:'Bank name',sort_code:'Sort code',account_number:'Account number',default_terms:'Payment terms (days)' };
    return panel('Business settings', `<form id="settings-form"><div class="grid two">${Object.entries(fields).map(([key,label]) => `<label>${label}<input name="${key}" value="${esc(state.settings[key] ?? '')}" ${key === 'default_terms' ? 'type="number"' : ''}></label>`).join('')}</div><div class="actions"><button class="primary">Save Settings</button></div></form><p class="saved">✓ Saved securely in Supabase.</p>`);
  }

  function render() {
    const trackToken = new URLSearchParams(location.search).get('track');
    if (trackToken) { document.getElementById('app').innerHTML = publicTrackingView(state.publicTracking, state.loading, state.notice?.type === 'error' ? state.notice.text : ''); return; }
    if (state.loading) { document.getElementById('app').innerHTML = '<div class="loading">Loading KLS SameDay Office…</div>'; return; }
    if (!state.user) { document.getElementById('app').innerHTML = authView(); bindAuth(); return; }
    const views = { dashboard, operations: operationsView, dispatch: dispatchView, driver: driverView, fleet: fleetView, schedule: scheduleView, newquote: newQuote, quotes: quotesView, jobs: jobsView, invoices: invoicesView, accounts: accountsView, customers: customersView, settings: settingsView };
    document.getElementById('app').innerHTML = layout(views[state.page]());
    bindApp();
    if (state.page === 'dispatch') initialiseDispatchMap();
  }


  let dispatchMap = null;
  function initialiseDispatchMap() {
    const mapNode = document.getElementById('dispatch-map');
    if (!mapNode || !window.L) return;
    if (dispatchMap) { dispatchMap.remove(); dispatchMap = null; }
    const liveJobs = state.jobs.filter(j => j.last_latitude && j.last_longitude && !['Cancelled','Delivered'].includes(j.job_status));
    const empty = document.getElementById('map-empty');
    if (!liveJobs.length) {
      mapNode.classList.add('hidden');
      empty?.classList.remove('hidden');
      return;
    }
    mapNode.classList.remove('hidden'); empty?.classList.add('hidden');
    dispatchMap = L.map(mapNode, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(dispatchMap);
    const bounds = [];
    liveJobs.forEach(job => {
      const lat = Number(job.last_latitude), lng = Number(job.last_longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      bounds.push([lat,lng]);
      const driver = job.assigned_driver_name || 'Unassigned driver';
      const marker = L.marker([lat,lng]).addTo(dispatchMap);
      marker.bindPopup(`<b>${esc(driver)}</b><br>${esc(job.job_number || 'Job')}<br>${esc(job.job_status || '')}<br><small>Updated ${job.location_updated_at ? new Date(job.location_updated_at).toLocaleString('en-GB') : 'recently'}</small>`);
    });
    if (bounds.length === 1) dispatchMap.setView(bounds[0], 13); else dispatchMap.fitBounds(bounds, { padding: [35,35] });
    setTimeout(() => dispatchMap?.invalidateSize(), 50);
  }

  function bindAuth() {
    document.querySelector('[data-auth-mode]')?.addEventListener('click', e => { state.authMode = e.currentTarget.dataset.authMode; render(); });
    document.getElementById('auth-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      const message = document.getElementById('auth-message');
      const data = Object.fromEntries(new FormData(e.currentTarget));
      message.innerHTML = '<div class="authmsg">Working…</div>';
      try {
        if (state.authMode === 'signup') {
          const { data: result, error } = await db.auth.signUp({ email: data.email, password: data.password });
          if (error) throw error;
          if (!result.session) message.innerHTML = '<div class="authmsg ok">Account created. Check your email and confirm the address, then sign in.</div>';
          else { state.user = result.user; await loadAll(); }
        } else {
          const { data: result, error } = await db.auth.signInWithPassword({ email: data.email, password: data.password });
          if (error) throw error;
          state.user = result.user;
          await loadAll();
        }
      } catch (error) { message.innerHTML = `<div class="authmsg error">${esc(error.message || 'Unable to sign in.')}</div>`; }
    });
  }

  async function loadAll() {
    state.loading = true; render();
    try {
      const [customers, drivers, fleet, fuelLogs, maintenance, recurringJobs, quotes, jobs, invoices, expenses, settings] = await Promise.all([
        db.from('customers').select('*').order('created_at', { ascending: false }),
        db.from('drivers').select('*').order('name', { ascending: true }),
        db.from('vehicles').select('*').order('created_at', { ascending: false }),
        db.from('fuel_logs').select('*').order('log_date', { ascending: false }),
        db.from('vehicle_maintenance').select('*').order('log_date', { ascending: false }),
        db.from('recurring_jobs').select('*').order('next_run_date', { ascending: true }),
        db.from('quotes').select('*').order('created_at', { ascending: false }),
        db.from('jobs').select('*').order('created_at', { ascending: false }),
        db.from('invoices').select('*').order('created_at', { ascending: false }),
        db.from('expenses').select('*').order('expense_date', { ascending: false }),
        db.from('business_settings').select('*').maybeSingle()
      ]);
      for (const result of [customers, drivers, fleet, fuelLogs, maintenance, recurringJobs, quotes, jobs, invoices, expenses, settings]) if (result.error) throw result.error;
      state.customers = customers.data || [];
      state.drivers = drivers.data || [];
      state.fleet = fleet.data || [];
      state.fuelLogs = fuelLogs.data || [];
      state.maintenance = maintenance.data || [];
      state.recurringJobs = recurringJobs.data || [];
      state.quotes = quotes.data || [];
      state.jobs = (jobs.data || []).map(j => ({ ...j, customer_name: j.customer_name || j.contact_name || '' }));
      state.invoices = invoices.data || [];
      state.expenses = expenses.data || [];
      state.settings = { ...defaults, ...(settings.data || {}) };
    } catch (error) {
      showNotice(`Database setup needed: ${error.message}`, 'error');
    } finally { state.loading = false; render(); }
  }

  async function findOrCreateCustomer(data) {
    const existing = state.customers.find(c => c.company.toLowerCase() === data.company.toLowerCase());
    if (existing) return existing;
    const payload = { user_id: state.user.id, company: data.company, contact_name: data.contact_name || null, phone: data.phone || null, email: data.email || null, payment_terms: Number(state.settings.default_terms || 7) };
    const { data: created, error } = await db.from('customers').insert(payload).select().single();
    if (error) throw error;
    state.customers.unshift(created);
    return created;
  }



  async function updateJobStatus(jobId, newStatus) {
    const job = state.jobs.find(item => item.id === jobId);
    if (!job || !dispatchStatuses.includes(newStatus)) return;
    const previous = job.job_status;
    if (previous === newStatus) return;
    job.job_status = newStatus;
    render();
    const { error } = await db.from('jobs').update({ job_status: newStatus }).eq('id', jobId);
    if (error) {
      job.job_status = previous;
      showNotice(error.message, 'error');
      render();
      return;
    }
    showNotice(`${job.job_number || 'Job'} moved to ${newStatus}.`, 'ok');
    render();
  }

  function bindApp() {
    document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => { state.page = button.dataset.page; render(); });
    document.querySelectorAll('[data-driver-open]').forEach(button => button.onclick = () => { state.selectedDriverJobId = button.dataset.driverOpen; render(); });
    document.querySelectorAll('[data-action="driver-close"]').forEach(button => button.onclick = () => { state.selectedDriverJobId = null; render(); });
    document.querySelectorAll('[data-driver-nav]').forEach(button => button.onclick = () => { const j=state.jobs.find(x=>x.id===button.dataset.driverNav); if(j) window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(j.job_status === 'Booked' ? j.collection_address : j.delivery_address)}&travelmode=driving`,'_blank','noopener'); });
    document.querySelectorAll('[data-copy-track]').forEach(button => button.onclick = async () => { const j=state.jobs.find(x=>x.id===button.dataset.copyTrack); if(!j?.tracking_token){showNotice('Run the v9 Supabase upgrade first.','error');render();return;} await navigator.clipboard.writeText(trackingUrl(j)); showNotice('Customer tracking link copied.','ok'); render(); });
    document.querySelectorAll('[data-share-track]').forEach(button => button.onclick = async () => { const j=state.jobs.find(x=>x.id===button.dataset.shareTrack); if(!j)return; const text=`${state.settings.trading_name}: Your delivery ${j.job_number || ''} is ${j.job_status || 'booked'}.${j.eta_at ? ` ETA ${new Date(j.eta_at).toLocaleString('en-GB')}.` : ''} Track here: ${trackingUrl(j)}`; if(navigator.share){await navigator.share({title:'KLS SameDay tracking',text,url:trackingUrl(j)}).catch(()=>{});}else{await navigator.clipboard.writeText(text);showNotice('Tracking message copied.','ok');render();} });
    document.querySelectorAll('[data-assign-job],[data-driver-assign]').forEach(select => select.onchange = async () => { const jobId=select.dataset.assignJob||select.dataset.driverAssign; const driver=state.drivers.find(d=>d.id===select.value); const payload={assigned_driver_id:driver?.id||null,assigned_driver_name:driver?.name||null}; const {error}=await db.from('jobs').update(payload).eq('id',jobId); if(error){showNotice(error.message,'error');render();return;} const job=state.jobs.find(j=>j.id===jobId); if(job)Object.assign(job,payload); showNotice(driver?`${job.job_number} assigned to ${driver.name}.`:`${job.job_number} unassigned.`,'ok'); render(); });
    document.querySelectorAll('[data-save-eta]').forEach(button => button.onclick = async () => { const input=document.querySelector(`[data-job-eta="${button.dataset.saveEta}"]`); const eta=input?.value ? new Date(input.value).toISOString() : null; const {error}=await db.from('jobs').update({eta_at:eta}).eq('id',button.dataset.saveEta); if(error){showNotice(error.message,'error');render();return;} const job=state.jobs.find(j=>j.id===button.dataset.saveEta); if(job)job.eta_at=eta; showNotice('Customer ETA saved.','ok'); render(); });
    document.querySelectorAll('[data-driver-availability]').forEach(select => select.onchange = async () => { const driver=state.drivers.find(d=>d.id===select.dataset.driverAvailability); if(!driver)return; const previous=driver.availability_status||'Available'; driver.availability_status=select.value; const {error}=await db.from('drivers').update({availability_status:select.value,last_seen_at:new Date().toISOString()}).eq('id',driver.id); if(error){driver.availability_status=previous;showNotice(error.message,'error');render();return;} showNotice(`${driver.name} is now ${select.value}.`,'ok');render(); });
    document.querySelector('[data-action="refresh-map"]')?.addEventListener('click', initialiseDispatchMap);
    document.querySelectorAll('[data-driver-status]').forEach(button => button.onclick = async () => { const job=state.jobs.find(j=>j.id===button.dataset.driverStatus); if(!job)return; const previous=job.job_status; job.job_status=button.dataset.status; render(); const payload={job_status:button.dataset.status}; if(button.dataset.status==='Delivered') payload.delivered_at=new Date().toISOString(); const {error}=await db.from('jobs').update(payload).eq('id',job.id); if(error){job.job_status=previous;showNotice(error.message,'error');render();} });
    document.querySelector('[data-action="start-tracking"]')?.addEventListener('click', () => startLocationTracking(document.querySelector('[data-action="start-tracking"]').dataset.job));
    document.querySelector('[data-action="stop-tracking"]')?.addEventListener('click', stopLocationTracking);

    document.querySelectorAll('[data-move-job]').forEach(button => button.onclick = event => {
      event.stopPropagation();
      updateJobStatus(button.dataset.moveJob, button.dataset.moveStatus);
    });
    document.querySelectorAll('[data-dispatch-job]').forEach(card => {
      card.addEventListener('dragstart', event => {
        card.classList.add('dragging');
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', card.dataset.dispatchJob);
      });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    document.querySelectorAll('[data-drop-status]').forEach(column => {
      column.addEventListener('dragover', event => { event.preventDefault(); column.classList.add('drag-over'); });
      column.addEventListener('dragleave', event => { if (!column.contains(event.relatedTarget)) column.classList.remove('drag-over'); });
      column.addEventListener('drop', event => {
        event.preventDefault();
        column.classList.remove('drag-over');
        const jobId = event.dataTransfer.getData('text/plain');
        updateJobStatus(jobId, column.dataset.dropStatus);
      });
    });
    document.querySelector('[data-action="menu-open"]')?.addEventListener('click', () => document.getElementById('side').classList.add('open'));
    document.querySelector('[data-action="menu-close"]')?.addEventListener('click', () => document.getElementById('side').classList.remove('open'));
    document.querySelector('[data-action="notice-close"]')?.addEventListener('click', () => { state.notice = null; render(); });
    document.querySelector('[data-action="signout"]')?.addEventListener('click', async () => { await db.auth.signOut(); state.user = null; state.customers=[]; state.drivers=[]; state.fleet=[]; state.fuelLogs=[]; state.maintenance=[]; state.recurringJobs=[]; state.quotes=[]; state.jobs=[]; state.invoices=[]; state.expenses=[]; render(); });

    const driverForm = document.getElementById('driver-form');
    if(driverForm) driverForm.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(driverForm));values.user_id=state.user.id;values.active=true;values.availability_status='Available';values.last_seen_at=new Date().toISOString();try{const{data,error}=await db.from('drivers').insert(values).select().single();if(error)throw error;state.drivers.push(data);showNotice(`${data.name} added as a driver.`,'ok');render();}catch(error){showNotice(error.message,'error');render();}};

    const vehicleForm = document.getElementById('vehicle-form');
    if (vehicleForm) vehicleForm.onsubmit = async e => {
      e.preventDefault();
      try {
        const values = Object.fromEntries(new FormData(vehicleForm));
        values.user_id = state.user.id; values.active = true;
        values.current_mileage = Number(values.current_mileage||0);
        values.service_due_mileage = values.service_due_mileage ? Number(values.service_due_mileage) : null;
        for (const k of ['mot_expiry','insurance_expiry']) if (!values[k]) values[k]=null;
        const {data,error}=await db.from('vehicles').insert(values).select().single(); if(error) throw error;
        state.fleet.unshift(data); showNotice(`${data.registration||data.name} added to the fleet.`,'ok'); render();
      } catch(error){showNotice(error.message,'error');render();}
    };
    document.querySelectorAll('[data-schedule-shift]').forEach(button=>button.onclick=()=>{const d=new Date(`${state.scheduleMonth}-01T12:00:00`);d.setMonth(d.getMonth()+Number(button.dataset.scheduleShift));state.scheduleMonth=d.toISOString().slice(0,7);render();});
    document.querySelector('[data-schedule-today]')?.addEventListener('click',()=>{state.scheduleMonth=todayISO().slice(0,7);render();});
    document.querySelector('[data-action="schedule-form-focus"]')?.addEventListener('click',()=>document.querySelector('#schedule-booking-form input')?.focus());
    let draggedScheduleJob='';
    document.querySelectorAll('[data-calendar-job]').forEach(node=>{node.addEventListener('dragstart',()=>{draggedScheduleJob=node.dataset.calendarJob;node.classList.add('dragging')});node.addEventListener('dragend',()=>node.classList.remove('dragging'));node.addEventListener('click',()=>{state.page='jobs';render();});});
    document.querySelectorAll('[data-schedule-date]').forEach(cell=>{cell.addEventListener('dragover',e=>{e.preventDefault();cell.classList.add('drop-target')});cell.addEventListener('dragleave',()=>cell.classList.remove('drop-target'));cell.addEventListener('drop',async e=>{e.preventDefault();cell.classList.remove('drop-target');if(!draggedScheduleJob)return;const job=state.jobs.find(j=>j.id===draggedScheduleJob);const old=job?.collection_date;if(!job)return;job.collection_date=cell.dataset.scheduleDate;render();const {error}=await db.from('jobs').update({collection_date:job.collection_date}).eq('id',job.id);if(error){job.collection_date=old;showNotice(error.message,'error');}else showNotice(`${job.job_number||'Job'} moved to ${fmtDate(job.collection_date)}.`,'ok');render();});});
    document.getElementById('schedule-booking-form')?.addEventListener('submit',async e=>{e.preventDefault();try{const form=Object.fromEntries(new FormData(e.currentTarget));let driver=null;if(form.assigned_driver_id)driver=state.drivers.find(d=>d.id===form.assigned_driver_id);else{const dayJobs=state.jobs.filter(j=>scheduleDateKey(j.collection_date)===form.collection_date);driver=state.drivers.filter(d=>d.active!==false && d.availability_status!=='Offline').sort((a,b)=>dayJobs.filter(j=>j.assigned_driver_id===a.id).length-dayJobs.filter(j=>j.assigned_driver_id===b.id).length)[0]||null;}const payload={user_id:state.user.id,customer_name:form.customer_name,contact_name:form.customer_name,customer_email:form.customer_email||null,collection_date:form.collection_date,collection_time:form.collection_time||null,collection_address:form.collection_address,delivery_address:form.delivery_address,vehicle:form.vehicle,total_price:Number(form.total_price||0),base_price:Number(form.total_price||0),extras:0,costs:0,job_status:'Booked',quote_status:'Direct Booking',invoice_status:'Not Invoiced',assigned_driver_id:driver?.id||null,assigned_driver_name:driver?.name||null,booking_notes:form.booking_notes||null};const {data,error}=await db.from('jobs').insert(payload).select().single();if(error)throw error;state.jobs.unshift({...data,customer_name:data.customer_name||data.contact_name||''});showNotice(`${data.job_number||'Booking'} created${driver?` and assigned to ${driver.name}`:''}.`,'ok');render();}catch(error){showNotice(error.message,'error');render();}});
    document.getElementById('recurring-form')?.addEventListener('submit',async e=>{e.preventDefault();try{const form=Object.fromEntries(new FormData(e.currentTarget));const payload={...form,user_id:state.user.id,active:true};const {data,error}=await db.from('recurring_jobs').insert(payload).select().single();if(error)throw error;state.recurringJobs.push(data);showNotice('Recurring booking saved.','ok');render();}catch(error){showNotice(error.message,'error');render();}});
    const generateRecurring=async recurring=>{const driver=state.drivers.filter(d=>d.active!==false&&d.availability_status!=='Offline')[0]||null;const payload={user_id:state.user.id,customer_name:recurring.customer_name,contact_name:recurring.customer_name,collection_date:recurring.next_run_date,collection_time:recurring.collection_time||null,collection_address:recurring.collection_address,delivery_address:recurring.delivery_address,vehicle:recurring.vehicle,total_price:Number(recurring.total_price||0),base_price:Number(recurring.total_price||0),extras:0,costs:0,job_status:'Booked',quote_status:'Recurring Booking',invoice_status:'Not Invoiced',assigned_driver_id:driver?.id||null,assigned_driver_name:driver?.name||null,recurring_job_id:recurring.id};const {data,error}=await db.from('jobs').insert(payload).select().single();if(error)throw error;const next=addFrequency(recurring.next_run_date,recurring.frequency);const {error:updateError}=await db.from('recurring_jobs').update({last_generated_date:recurring.next_run_date,next_run_date:next}).eq('id',recurring.id);if(updateError)throw updateError;recurring.last_generated_date=recurring.next_run_date;recurring.next_run_date=next;state.jobs.unshift({...data,customer_name:data.customer_name||data.contact_name||''});};
    document.querySelectorAll('[data-recurring-generate]').forEach(button=>button.onclick=async()=>{try{const recurring=state.recurringJobs.find(r=>r.id===button.dataset.recurringGenerate);await generateRecurring(recurring);showNotice('Recurring job generated and next date advanced.','ok');render();}catch(error){showNotice(error.message,'error');render();}});
    document.querySelector('[data-generate-all-recurring]')?.addEventListener('click',async()=>{try{const due=state.recurringJobs.filter(r=>r.active!==false&&r.next_run_date<=todayISO());for(const r of due)await generateRecurring(r);showNotice(`${due.length} due recurring job${due.length===1?'':'s'} generated.`,'ok');render();}catch(error){showNotice(error.message,'error');render();}});

    document.querySelector('[data-action="vehicle-form-focus"]')?.addEventListener('click',()=>document.querySelector('#vehicle-form input')?.focus());
    document.querySelectorAll('[data-vehicle-delete]').forEach(btn=>btn.onclick=async()=>{if(!confirm('Remove this vehicle from the active fleet?'))return;const {error}=await db.from('vehicles').update({active:false}).eq('id',btn.dataset.vehicleDelete);if(error){showNotice(error.message,'error');render();return;}const v=state.fleet.find(x=>x.id===btn.dataset.vehicleDelete);if(v)v.active=false;showNotice('Vehicle removed from active fleet.','ok');render();});
    const showFleetModal=(type,vehicleId)=>{const v=state.fleet.find(x=>x.id===vehicleId);const node=document.getElementById('fleet-modal');if(!node)return;node.innerHTML=`<div class="modalback" data-action="fleet-close"><section class="customermodal fleet-modal" onclick="event.stopPropagation()"><div class="modalhead"><div><small>${type==='fuel'?'FUEL LOG':'MAINTENANCE LOG'}</small><h2>${esc(v?.registration||v?.name||'Vehicle')}</h2></div><button type="button" data-action="fleet-close">×</button></div><form id="fleet-log-form"><input type="hidden" name="vehicle_id" value="${vehicleId}"><div class="grid two">${type==='fuel'?`<label>Date<input name="log_date" type="date" value="${todayISO()}" required></label><label>Litres<input name="litres" type="number" step="0.01" min="0" required></label><label>Cost<input name="cost" type="number" step="0.01" min="0" required></label><label>Mileage<input name="mileage" type="number" min="0"></label>`:`<label>Date<input name="log_date" type="date" value="${todayISO()}" required></label><label>Category<select name="category"><option>Service</option><option>MOT</option><option>Repair</option><option>Tyres</option><option>Tail Lift</option><option>Other</option></select></label><label>Description<input name="description" required></label><label>Cost<input name="cost" type="number" step="0.01" min="0" required></label><label>Supplier<input name="supplier"></label><label>Mileage<input name="mileage" type="number" min="0"></label>`}</div><div class="actions"><button type="button" class="secondary" data-action="fleet-close">Cancel</button><button class="primary">Save</button></div></form></section></div>`;node.querySelectorAll('[data-action="fleet-close"]').forEach(x=>x.onclick=()=>{node.innerHTML=''});node.querySelector('#fleet-log-form').onsubmit=async e=>{e.preventDefault();try{const values=Object.fromEntries(new FormData(e.currentTarget));values.user_id=state.user.id;values.cost=Number(values.cost||0);if(values.mileage)values.mileage=Number(values.mileage);if(values.litres)values.litres=Number(values.litres);const table=type==='fuel'?'fuel_logs':'vehicle_maintenance';const {data,error}=await db.from(table).insert(values).select().single();if(error)throw error;(type==='fuel'?state.fuelLogs:state.maintenance).unshift(data);if(values.mileage){await db.from('vehicles').update({current_mileage:values.mileage}).eq('id',vehicleId);if(v)v.current_mileage=values.mileage;}showNotice(type==='fuel'?'Fuel entry saved.':'Maintenance entry saved.','ok');render();}catch(error){showNotice(error.message,'error');render();}};};
    document.querySelectorAll('[data-fuel-vehicle]').forEach(b=>b.onclick=()=>showFleetModal('fuel',b.dataset.fuelVehicle));
    document.querySelectorAll('[data-maint-vehicle]').forEach(b=>b.onclick=()=>showFleetModal('maintenance',b.dataset.maintVehicle));

    const quoteForm = document.getElementById('quote-form');
    if (quoteForm) {
      const calculate = (forcePrice = false) => {
        const miles = Number(quoteForm.miles.value || 0);
        const rate = vehicles[quoteForm.vehicle.value];
        const base = Math.max(rate.minimum, miles * rate.ppm);
        const waiting = Number(quoteForm.waiting_hours.value || 0) * 60;
        const loading = Number(quoteForm.loading_ends.value || 0) * 20;
        const drops = Number(quoteForm.extra_drops.value || 0) * 25;
        const manual = Number(quoteForm.manual_extras.value || 0);
        const preSurcharge = base + waiting + loading + drops + manual;
        const surchargeRate = Number(quoteForm.surcharge.value || 0);
        const surcharge = preSurcharge * surchargeRate;
        const suggested = preSurcharge + surcharge;
        quoteForm.base_charge.value = base.toFixed(2);
        document.getElementById('suggestion').textContent = money(suggested);
        const parts = [`Base ${money(base)}`];
        if (waiting) parts.push(`waiting ${money(waiting)}`);
        if (loading) parts.push(`loading ${money(loading)}`);
        if (drops) parts.push(`drops ${money(drops)}`);
        if (manual) parts.push(`manual ${money(manual)}`);
        if (surcharge) parts.push(`surcharge ${money(surcharge)}`);
        document.getElementById('price-breakdown').textContent = parts.join(' + ');
        if (forcePrice || !quoteForm.quoted_price.value) quoteForm.quoted_price.value = suggested.toFixed(2);
        return { base, waiting, loading, drops, manual, surcharge, suggested };
      };
      ['vehicle','miles','waiting_hours','loading_ends','extra_drops','manual_extras','surcharge'].forEach(name => {
        quoteForm[name].addEventListener(name === 'vehicle' || name === 'loading_ends' || name === 'surcharge' ? 'change' : 'input', () => calculate(true));
      });
      document.querySelector('[data-action="clear-extras"]')?.addEventListener('click', () => {
        quoteForm.waiting_hours.value = 0; quoteForm.loading_ends.value = 0; quoteForm.extra_drops.value = 0; quoteForm.manual_extras.value = 0; quoteForm.surcharge.value = 0; calculate(true);
      });
      document.querySelector('[data-action="open-route"]')?.addEventListener('click', () => {
        const from = quoteForm.collection_address.value.trim(); const to = quoteForm.delivery_address.value.trim();
        if (!from || !to) { showNotice('Enter both collection and delivery addresses first.', 'error'); render(); return; }
        window.open(`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=driving`, '_blank', 'noopener');
      });
      calculate(true);
      quoteForm.onsubmit = async e => {
        e.preventDefault();
        const button = quoteForm.querySelector('button.primary'); button.disabled = true; button.textContent = 'Saving…';
        try {
          const form = Object.fromEntries(new FormData(quoteForm));
          const customer = await findOrCreateCustomer(form);
          const rate = vehicles[form.vehicle]; const miles = Number(form.miles || 0); const base = Math.max(rate.minimum, miles * rate.ppm);
          const waiting = Number(form.waiting_hours || 0) * 60; const loading = Number(form.loading_ends || 0) * 20; const drops = Number(form.extra_drops || 0) * 25; const manual = Number(form.manual_extras || 0); const surchargeRate = Number(form.surcharge || 0); const surcharge = (base + waiting + loading + drops + manual) * surchargeRate; const suggested = base + waiting + loading + drops + manual + surcharge;
          const extrasSummary = [waiting ? `Waiting: ${money(waiting)}` : '', loading ? `Loading assistance: ${money(loading)}` : '', drops ? `Extra drops: ${money(drops)}` : '', manual ? `Manual charges: ${money(manual)}` : '', surcharge ? `Surcharge: ${money(surcharge)}` : ''].filter(Boolean).join(' | ');
          const savedNotes = [form.notes, extrasSummary].filter(Boolean).join('\n');
          const payload = {
            user_id: state.user.id, customer_id: customer.id, quote_number: numberCode('Q'), customer_name: form.company,
            contact_name: form.contact_name || null, phone: form.phone || null, email: form.email || null,
            collection_date: form.collection_date || null, collection_time: form.collection_time || null,
            collection_address: form.collection_address, delivery_address: form.delivery_address, vehicle: form.vehicle,
            goods_description: form.goods_description || null, route_stops: String(form.route_stops || '').split(/\n+/).map(x=>x.trim()).filter(Boolean), miles, quoted_price: Number(form.quoted_price || suggested), notes: savedNotes || null, status: 'Pending'
          };
          const { data, error } = await db.from('quotes').insert(payload).select().single();
          if (error) throw error;
          state.page = 'quotes';
          showNotice(`${data.quote_number} saved permanently.`, 'ok');
          await loadAll();
        } catch (error) { showNotice(error.message, 'error'); render(); }
      };
    }

    document.querySelectorAll('[data-accept]').forEach(button => button.onclick = async () => {
      try {
        const quote = state.quotes.find(q => q.id === button.dataset.accept);
        const jobPayload = {
          user_id: state.user.id, customer_id: quote.customer_id, contact_name: quote.customer_name, customer_email: quote.email,
          collection_date: quote.collection_date, collection_time: quote.collection_time, collection_address: quote.collection_address,
          delivery_address: quote.delivery_address, route_stops: quote.route_stops || [], vehicle: quote.vehicle, goods_description: quote.goods_description,
          miles: quote.miles, base_price: quote.quoted_price, extras: 0, total_price: quote.quoted_price, costs: 0,
          job_status: 'Booked', quote_status: 'Accepted', invoice_status: 'Not Invoiced'
        };
        const { data: job, error: jobError } = await db.from('jobs').insert(jobPayload).select().single();
        if (jobError) throw jobError;
        const { error: quoteError } = await db.from('quotes').update({ status: 'Accepted', job_id: job.id }).eq('id', quote.id);
        if (quoteError) throw quoteError;
        quote.status = 'Accepted'; quote.job_id = job.id;
        state.page = 'jobs';
        showNotice(`${job.job_number || 'Job'} created.`, 'ok');
        await loadAll();
      } catch (error) { showNotice(error.message, 'error'); render(); }
    });

    document.querySelectorAll('[data-job-status]').forEach(select => select.onchange = async () => {
      const job = state.jobs.find(j => j.id === select.dataset.jobStatus); const previous = job.job_status; job.job_status = select.value;
      const { error } = await db.from('jobs').update({ job_status: select.value }).eq('id', job.id);
      if (error) { job.job_status = previous; showNotice(error.message, 'error'); render(); }
    });

    document.querySelectorAll('[data-invoice]').forEach(button => button.onclick = async () => {
      try {
        const job = state.jobs.find(j => j.id === button.dataset.invoice);
        if (state.invoices.some(i => i.job_id === job.id)) throw new Error('An invoice already exists for this job.');
        const due = new Date(Date.now() + Number(state.settings.default_terms || 7) * 86400000).toISOString().slice(0, 10);
        const payload = { user_id: state.user.id, job_id: job.id, customer_id: job.customer_id, invoice_number: numberCode('INV'), customer_name: job.customer_name || job.contact_name, total: Number(job.total_price || 0), status: 'Unpaid', amount_paid: 0, issue_date: todayISO(), due_date: due };
        const { data: invoice, error } = await db.from('invoices').insert(payload).select().single();
        if (error) throw error;
        await db.from('jobs').update({ invoice_status: 'Invoiced', invoice_date: todayISO() }).eq('id', job.id);
        job.invoice_status = 'Invoiced';
        state.invoices.unshift(invoice);
        state.page = 'invoices';
        showNotice(`${invoice.invoice_number} created.`, 'ok');
        render();
        loadAll().catch(error => showNotice(error.message, 'error'));
      } catch (error) { showNotice(error.message, 'error'); render(); }
    });

    document.querySelectorAll('[data-record-payment]').forEach(button => button.onclick = async () => {
      const invoice = state.invoices.find(i => i.id === button.dataset.recordPayment);
      const remaining = invoiceBalance(invoice);
      const raw = prompt(`Payment received for ${invoice.invoice_number}. Remaining balance ${money(remaining)}. Enter payment amount:`, remaining.toFixed(2));
      if (raw === null) return;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount <= 0) return showNotice('Enter a valid payment amount.','error'), render();
      if (amount > remaining + 0.005) return showNotice('Payment cannot be more than the outstanding balance.','error'), render();
      const method = prompt('Payment method:', invoice.payment_method || 'Bank Transfer') || 'Bank Transfer';
      const newPaid = invoicePaid(invoice) + amount;
      const newStatus = newPaid >= Number(invoice.total||0) ? 'Paid' : 'Part-paid';
      const payload = { amount_paid:newPaid, status:newStatus, paid_date:todayISO(), payment_method:method };
      const { error } = await db.from('invoices').update(payload).eq('id', invoice.id);
      if (error) return showNotice(error.message,'error'), render();
      Object.assign(invoice,payload); showNotice(`${money(amount)} payment recorded against ${invoice.invoice_number}.`,'ok'); render();
    });

    document.getElementById('expense-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      try {
        const form = Object.fromEntries(new FormData(e.currentTarget));
        const payload = {...form, user_id:state.user.id, amount:Number(form.amount||0)};
        const {data,error}=await db.from('expenses').insert(payload).select().single();
        if(error) throw error; state.expenses.unshift(data); showNotice('Expense saved.','ok'); render();
      } catch(error){ showNotice(error.message,'error'); render(); }
    });
    document.querySelectorAll('[data-delete-expense]').forEach(button=>button.onclick=async()=>{
      if(!confirm('Delete this expense?')) return;
      const {error}=await db.from('expenses').delete().eq('id',button.dataset.deleteExpense);
      if(error) return showNotice(error.message,'error'),render();
      state.expenses=state.expenses.filter(e=>e.id!==button.dataset.deleteExpense); showNotice('Expense deleted.','ok'); render();
    });

    document.querySelectorAll('[data-print-quote]').forEach(button => button.onclick = () => printDocument('quote', state.quotes.find(q => q.id === button.dataset.printQuote)));
    const quoteMessage = quote => `${state.settings.trading_name} quotation ${quote.quote_number}\n\nCollection: ${quote.collection_address}\nDelivery: ${quote.delivery_address}\nVehicle: ${quote.vehicle}\nPrice: ${money(quote.quoted_price)}\n\nDedicated vehicle • No shared loads\n${state.settings.phone} • ${state.settings.email}`;
    document.querySelectorAll('[data-email-quote]').forEach(button => button.onclick = () => {
      const quote = state.quotes.find(q => q.id === button.dataset.emailQuote);
      const subject = encodeURIComponent(`${state.settings.trading_name} quotation ${quote.quote_number}`);
      const body = encodeURIComponent(quoteMessage(quote));
      window.location.href = `mailto:${encodeURIComponent(quote.email || '')}?subject=${subject}&body=${body}`;
    });
    document.querySelectorAll('[data-whatsapp-quote]').forEach(button => button.onclick = () => {
      const quote = state.quotes.find(q => q.id === button.dataset.whatsappQuote);
      const digits = String(quote.phone || '').replace(/\D/g, '').replace(/^0/, '44');
      const url = digits ? `https://wa.me/${digits}?text=${encodeURIComponent(quoteMessage(quote))}` : `https://wa.me/?text=${encodeURIComponent(quoteMessage(quote))}`;
      window.open(url, '_blank', 'noopener');
    });
    document.querySelectorAll('[data-print-invoice]').forEach(button => button.onclick = () => printDocument('invoice', state.invoices.find(i => i.id === button.dataset.printInvoice)));

    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) settingsForm.onsubmit = async e => {
      e.preventDefault();
      try {
        const values = Object.fromEntries(new FormData(settingsForm)); values.default_terms = Number(values.default_terms || 7); values.user_id = state.user.id;
        const { data, error } = await db.from('business_settings').upsert(values, { onConflict: 'user_id' }).select().single();
        if (error) throw error;
        state.settings = { ...defaults, ...data }; showNotice('Business settings saved.', 'ok'); render();
      } catch (error) { showNotice(error.message, 'error'); render(); }
    };


    document.querySelectorAll('[data-customer]').forEach(card => {
      const open = () => { state.selectedCustomerId = card.dataset.customer; render(); };
      card.onclick = open;
      card.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
    document.querySelector('[data-action="new-customer"]')?.addEventListener('click', () => { state.selectedCustomerId = 'new'; render(); });
    document.querySelectorAll('[data-action="customer-close"]').forEach(el => el.addEventListener('click', () => { state.selectedCustomerId = null; render(); }));
    const customerForm = document.getElementById('customer-form');
    if (customerForm) customerForm.onsubmit = async e => {
      e.preventDefault();
      const values = Object.fromEntries(new FormData(customerForm));
      values.payment_terms = Number(values.payment_terms || 7);
      values.user_id = state.user.id;
      try {
        if (state.selectedCustomerId === 'new') {
          const { data, error } = await db.from('customers').insert(values).select().single();
          if (error) throw error;
          state.customers.unshift(data);
          showNotice(`${data.company} added.`, 'ok');
        } else {
          const { data, error } = await db.from('customers').update(values).eq('id', state.selectedCustomerId).select().single();
          if (error) throw error;
          const idx = state.customers.findIndex(c => c.id === data.id);
          if (idx >= 0) state.customers[idx] = data;
          showNotice(`${data.company} updated.`, 'ok');
        }
        state.selectedCustomerId = null; render();
      } catch (error) { showNotice(error.message, 'error'); render(); }
    };

    document.querySelectorAll('[data-new-quote-customer]').forEach(button => button.onclick = () => {
      state.quoteCustomerId = button.dataset.newQuoteCustomer;
      state.selectedCustomerId = null;
      state.page = 'newquote';
      render();
    });

    const canvas = document.getElementById('signature-canvas');
    let drawing = false;
    if (canvas) {
      const ctx=canvas.getContext('2d'); ctx.lineWidth=3; ctx.lineCap='round';
      const point=e=>{const r=canvas.getBoundingClientRect();const t=e.touches?.[0]||e;return{x:(t.clientX-r.left)*(canvas.width/r.width),y:(t.clientY-r.top)*(canvas.height/r.height)}};
      const begin=e=>{e.preventDefault();drawing=true;const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y)}; const move=e=>{if(!drawing)return;e.preventDefault();const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke()}; const end=()=>drawing=false;
      canvas.addEventListener('mousedown',begin);canvas.addEventListener('mousemove',move);window.addEventListener('mouseup',end,{once:true});canvas.addEventListener('touchstart',begin,{passive:false});canvas.addEventListener('touchmove',move,{passive:false});canvas.addEventListener('touchend',end);
      document.querySelector('[data-action="clear-signature"]')?.addEventListener('click',()=>ctx.clearRect(0,0,canvas.width,canvas.height));
    }
    const podForm=document.getElementById('pod-form');
    if(podForm) podForm.onsubmit=async e=>{e.preventDefault();const job=state.jobs.find(j=>j.id===state.selectedDriverJobId);const btn=podForm.querySelector('button.primary');btn.disabled=true;btn.textContent='Saving POD…';try{const fd=new FormData(podForm);let photoUrl=job.pod_photo_url||null;let signatureUrl=job.pod_signature_url||null;const photo=fd.get('pod_photo');if(photo&&photo.size){photoUrl=await uploadPodFile(job,photo,'photo');}if(canvas){const blank=document.createElement('canvas');blank.width=canvas.width;blank.height=canvas.height;if(canvas.toDataURL()!==blank.toDataURL()){const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));signatureUrl=await uploadPodFile(job,blob,'signature');}}const position=await getOnePosition().catch(()=>null);const payload={recipient_name:fd.get('recipient_name'),pod_notes:fd.get('pod_notes')||null,pod_photo_url:photoUrl,pod_signature_url:signatureUrl,job_status:'Delivered',delivered_at:new Date().toISOString(),pod_latitude:position?.coords.latitude||job.last_latitude||null,pod_longitude:position?.coords.longitude||job.last_longitude||null};const{data,error}=await db.from('jobs').update(payload).eq('id',job.id).select().single();if(error)throw error;Object.assign(job,data);state.selectedDriverJobId=null;showNotice(`${job.job_number} POD saved and job delivered.`,'ok');render();}catch(error){showNotice(error.message,'error');render();}};

    const jobSearch = document.getElementById('job-search');
    if (jobSearch) jobSearch.oninput = () => filterRows(jobSearch.value);
    const customerSearch = document.getElementById('customer-search');
    if (customerSearch) customerSearch.oninput = () => filterCards(customerSearch.value);
  }

  function filterRows(value) { const term = value.toLowerCase(); document.querySelectorAll('tbody tr').forEach(row => row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none'); }
  function filterCards(value) { const term = value.toLowerCase(); document.querySelectorAll('.customergrid article').forEach(card => card.style.display = card.textContent.toLowerCase().includes(term) ? '' : 'none'); }

  function printDocument(type, row) {
    if (!row) { showNotice('Document could not be opened.', 'error'); return; }
    const quote = type === 'quote'; const job = !quote ? state.jobs.find(j => j.id === row.job_id) : null;
    const number = quote ? row.quote_number : row.invoice_number; const total = quote ? row.quoted_price : row.total;
    const win = window.open('', '_blank');
    if (!win) { showNotice('Your browser blocked the print window. Please allow pop-ups for KLS SameDay Office.', 'error'); return; }
    win.document.write(`<html><head><title>${esc(number)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial;padding:40px;color:#111;margin:0}.toolbar{position:sticky;top:0;display:flex;gap:10px;justify-content:flex-end;padding:12px 0 18px;background:#fff;border-bottom:1px solid #ddd;margin-bottom:24px}.toolbar button{border:0;border-radius:8px;padding:12px 18px;font-size:15px;font-weight:700;cursor:pointer}.print{background:#111;color:#fff}.close{background:#e5e7eb;color:#111}header{border-bottom:3px solid #111;margin-bottom:25px}h1{margin-bottom:5px}.total{text-align:right;font-size:26px;font-weight:bold;margin-top:35px}.route{padding:14px;background:#f4f4f5;border-radius:8px}@media print{.toolbar{display:none}body{padding:20px}}</style></head><body><div class="toolbar"><button class="close" onclick="window.close()">Close &amp; Return to KLS</button><button class="print" onclick="window.print()">Print ${quote ? 'Quotation' : 'Invoice'}</button></div><header><h1>${esc(state.settings.trading_name)}</h1><p>${esc(state.settings.legal_name)}<br>${esc(state.settings.email)} · ${esc(state.settings.phone)}<br>${esc(state.settings.address_line)}</p></header><h2>${quote ? 'QUOTATION' : 'INVOICE'} ${esc(number)}</h2><p><b>Customer:</b> ${esc(row.customer_name)}</p>${quote ? `<div class="route"><p><b>Collection:</b> ${esc(row.collection_address)}</p><p><b>Delivery:</b> ${esc(row.delivery_address)}</p><p><b>Vehicle:</b> ${esc(row.vehicle)}</p></div>` : `<p><b>Job:</b> ${esc(job?.job_number || '')}</p><p><b>Issue:</b> ${fmtDate(row.issue_date)}</p><p><b>Due:</b> ${fmtDate(row.due_date)}</p>`}<div class="total">Total: ${money(total)}</div><p>Payment terms: ${esc(state.settings.default_terms)} days</p><p>${esc(state.settings.bank_name)} ${esc(state.settings.sort_code)} ${esc(state.settings.account_number)}</p></body></html>`);
    win.document.close();
    win.focus();
  }

  function getOnePosition() { return new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:5000})); }
  async function startLocationTracking(jobId) {
    if(!navigator.geolocation){showNotice('Location is not supported on this device.','error');render();return;}
    stopLocationTracking(false);
    const push=async pos=>{const payload={last_latitude:pos.coords.latitude,last_longitude:pos.coords.longitude,location_accuracy:pos.coords.accuracy,location_updated_at:new Date().toISOString()};const{error}=await db.from('jobs').update(payload).eq('id',jobId);if(error){showNotice(error.message,'error');render();}else{const j=state.jobs.find(x=>x.id===jobId);if(j)Object.assign(j,payload);}};
    locationWatchId=navigator.geolocation.watchPosition(push,error=>{showNotice(`Location error: ${error.message}`,'error');render();},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
    showNotice('Live tracking started. Keep this Driver App open.','ok');render();
  }
  function stopLocationTracking(show=true){if(locationWatchId!==null){navigator.geolocation.clearWatch(locationWatchId);locationWatchId=null;}if(show){showNotice('Live tracking stopped.','ok');render();}}
  async function uploadPodFile(job,file,type){const ext=type==='signature'?'png':((file.name||'photo.jpg').split('.').pop()||'jpg').toLowerCase();const path=`${state.user.id}/${job.id}/${type}-${Date.now()}.${ext}`;const{error}=await db.storage.from('pod').upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});if(error)throw error;const{data}=db.storage.from('pod').getPublicUrl(path);return data.publicUrl;}

  async function initialise() {
    const trackToken = new URLSearchParams(location.search).get('track');
    if (trackToken) {
      state.loading = true; render();
      if (!configured) { state.loading = false; state.notice = {text:'Tracking service is not configured.',type:'error'}; render(); return; }
      const refreshPublic = async () => {
        const { data, error } = await db.rpc('get_public_tracking', { p_token: trackToken });
        state.publicTracking = Array.isArray(data) ? data[0] : data;
        state.notice = error ? {text:error.message,type:'error'} : null; state.loading = false; render();
      };
      await refreshPublic(); trackingPollId = setInterval(refreshPublic, 10000); return;
    }
    if (!configured) { state.loading = false; render(); return; }
    const { data: { session } } = await db.auth.getSession();
    state.user = session?.user || null;
    db.auth.onAuthStateChange(async (_event, sessionNow) => {
      const nextUser = sessionNow?.user || null;
      if (nextUser?.id !== state.user?.id) { state.user = nextUser; if (nextUser) await loadAll(); else { state.loading = false; render(); } }
    });
    if (state.user) await loadAll(); else { state.loading = false; render(); }
  }

  initialise();
})();
