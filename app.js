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
    quotes: [],
    jobs: [],
    invoices: [],
    settings: { ...defaults },
    notice: null,
    loading: true,
    authMode: 'signin',
    selectedCustomerId: null
  };

  const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(Number(value || 0));
  const fmtDate = value => value ? new Date(value).toLocaleDateString('en-GB') : '—';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const numberCode = prefix => `${prefix}-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  const showNotice = (text, type = 'ok') => { state.notice = { text, type }; };

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

  const navItems = [['dashboard','Dashboard'],['operations','Today’s Planner'],['dispatch','Dispatch Board'],['newquote','New Quote'],['quotes','Quotes'],['jobs','Jobs'],['invoices','Invoices'],['customers','Customers'],['settings','Settings']];

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
    return panel('Smart Quote Builder', `<form id="quote-form">
      <div class="quote-builder-head"><div><small>KLS PRICING ENGINE</small><h3>Build a consistent quote in seconds</h3><p>Enter the route mileage, choose a vehicle and add any extras. The total updates instantly.</p></div><div class="rate-pill">Minimum or mileage rate — whichever is higher</div></div>
      <div class="grid"><label>Customer / company *<input name="company" required></label><label>Contact name<input name="contact_name"></label><label>Telephone / WhatsApp<input name="phone"></label></div>
      <div class="grid"><label>Email<input name="email" type="email"></label><label>Collection date<input name="collection_date" type="date" value="${todayISO()}"></label><label>Collection time<input name="collection_time" type="time"></label></div>
      <div class="grid two"><label>Collection address / postcode *<textarea name="collection_address" required></textarea></label><label>Delivery address / postcode *<textarea name="delivery_address" required></textarea></label></div>
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
      `<select data-job-status="${j.id}">${['Booked','Collected','In Transit','Delivered','Cancelled'].map(s => `<option ${j.job_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`,
      `<button data-invoice="${j.id}" ${j.job_status !== 'Delivered' ? 'disabled' : ''}>Create Invoice</button>`
    ]));
  }

  function jobsView() { return panel('Jobs', jobTable(state.jobs), '', '<label class="search">Search <input id="job-search"></label>'); }

  const dispatchStatuses = ['Booked','Collected','In Transit','Delivered'];

  function dispatchCard(job) {
    const statusIndex = dispatchStatuses.indexOf(job.job_status);
    const previous = statusIndex > 0 ? dispatchStatuses[statusIndex - 1] : '';
    const next = statusIndex >= 0 && statusIndex < dispatchStatuses.length - 1 ? dispatchStatuses[statusIndex + 1] : '';
    const time = job.collection_time ? String(job.collection_time).slice(0,5) : 'Time TBC';
    return `<article class="dispatch-card" draggable="true" data-dispatch-job="${job.id}">
      <div class="dispatch-card-head"><b>${esc(job.job_number || 'Job')}</b><span>${esc(time)}</span></div>
      <h3>${esc(job.customer_name || job.contact_name || 'Customer')}</h3>
      <div class="dispatch-route"><p><small>COLLECT</small>${esc(job.collection_address || 'Not set')}</p><span>↓</span><p><small>DELIVER</small>${esc(job.delivery_address || 'Not set')}</p></div>
      <div class="dispatch-meta"><span>${esc(job.vehicle || 'Vehicle TBC')}</span><span>${money(job.total_price)}</span></div>
      <div class="dispatch-card-actions">${previous ? `<button class="secondary" data-move-job="${job.id}" data-move-status="${previous}">← ${esc(previous)}</button>` : ''}${next ? `<button class="primary" data-move-job="${job.id}" data-move-status="${next}">${esc(next)} →</button>` : `<button class="primary" data-page="jobs">Open job</button>`}</div>
      ${job.invoice_status === 'Invoiced' ? '<div class="dispatch-badge">INVOICED</div>' : ''}
    </article>`;
  }

  function dispatchView() {
    const active = state.jobs.filter(job => job.job_status !== 'Cancelled');
    const columns = dispatchStatuses.map(status => {
      const jobs = active.filter(job => job.job_status === status);
      return `<section class="dispatch-column" data-drop-status="${status}"><div class="dispatch-column-head"><div><h2>${status}</h2><p>${jobs.length} job${jobs.length === 1 ? '' : 's'}</p></div><span>${jobs.length}</span></div><div class="dispatch-list">${jobs.length ? jobs.map(dispatchCard).join('') : `<div class="dispatch-empty">Drop a job here</div>`}</div></section>`;
    }).join('');
    return `<section class="dispatch-toolbar"><div><small>LIVE OPERATIONS</small><h2>Dispatch Board</h2><p>Drag jobs between stages or use the move buttons on mobile.</p></div><div><button class="secondary" data-page="jobs">Table view</button><button class="primary" data-page="newquote">＋ New Quote</button></div></section><div class="dispatch-board">${columns}</div>`;
  }


  function invoicesView() {
    return panel('Invoices', table(['Invoice','Customer','Issue','Due','Total','Status','Actions'], state.invoices.map(inv => [
      esc(inv.invoice_number), esc(inv.customer_name), fmtDate(inv.issue_date), fmtDate(inv.due_date), money(inv.total),
      `<select data-invoice-status="${inv.id}">${['Unpaid','Paid','Overdue','Cancelled'].map(s => `<option ${inv.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`,
      `<button data-print-invoice="${inv.id}">Print</button>`
    ])));
  }

  function customersView() {
    const cards = state.customers.map(c => `<article class="customer-card" data-customer="${c.id}" tabindex="0" role="button"><div class="avatar">${esc((c.company || '?')[0].toUpperCase())}</div><div><strong>${esc(c.company)}</strong><p>${esc(c.contact_name || 'No contact name')}</p><p>${esc(c.phone || 'No phone')}</p><p>${esc(c.email || 'No email')}</p><p>${Number(c.payment_terms || 7)}-day terms</p><small>Open customer →</small></div></article>`).join('');
    return panel('Customers', `<div class="customergrid">${cards || '<div class="empty">No customers yet.</div>'}</div>${customerModal()}`, 'Click a customer to view their history or edit their details.', '<div class="customer-tools"><label class="search">Search <input id="customer-search"></label><button class="primary" data-action="new-customer">＋ Add Customer</button></div>');
  }

  function customerModal() {
    const c = state.customers.find(x => x.id === state.selectedCustomerId);
    if (!c && !state.selectedCustomerId) return '';
    const isNew = state.selectedCustomerId === 'new';
    const customer = c || { company:'', contact_name:'', phone:'', email:'', billing_address:'', payment_terms:7, notes:'' };
    const quotes = isNew ? [] : state.quotes.filter(q => q.customer_id === customer.id);
    const jobs = isNew ? [] : state.jobs.filter(j => j.customer_id === customer.id);
    const invoices = isNew ? [] : state.invoices.filter(i => i.customer_id === customer.id);
    const total = invoices.reduce((n,i) => n + Number(i.total || 0), 0);
    const outstanding = invoices.filter(i => i.status !== 'Paid').reduce((n,i) => n + Number(i.total || 0), 0);
    return `<div class="modalback" data-action="customer-close"><section class="customermodal" onclick="event.stopPropagation()"><div class="modalhead"><div><small>${isNew ? 'NEW CUSTOMER' : 'CUSTOMER PROFILE'}</small><h2>${esc(customer.company || 'Add customer')}</h2></div><button data-action="customer-close">×</button></div>
      <form id="customer-form"><div class="grid two"><label>Company *<input name="company" required value="${esc(customer.company)}"></label><label>Contact name<input name="contact_name" value="${esc(customer.contact_name || '')}"></label><label>Telephone<input name="phone" value="${esc(customer.phone || '')}"></label><label>Email<input name="email" type="email" value="${esc(customer.email || '')}"></label><label>Billing address<textarea name="billing_address">${esc(customer.billing_address || '')}</textarea></label><label>Payment terms (days)<input name="payment_terms" type="number" min="0" value="${Number(customer.payment_terms || 7)}"></label></div><label>Notes<textarea name="notes">${esc(customer.notes || '')}</textarea></label><div class="actions"><button type="button" class="secondary" data-action="customer-close">Cancel</button><button class="primary">${isNew ? 'Save Customer' : 'Save Changes'}</button></div></form>
      ${isNew ? '' : `<div class="customerstats"><div><small>Total invoiced</small><b>${money(total)}</b></div><div><small>Outstanding</small><b>${money(outstanding)}</b></div><div><small>Quotes</small><b>${quotes.length}</b></div><div><small>Jobs</small><b>${jobs.length}</b></div></div><div class="historygrid"><div><h3>Recent quotes</h3>${quotes.slice(0,5).map(q=>`<p><b>${esc(q.quote_number)}</b> · ${money(q.quoted_price)} · ${esc(q.status)}</p>`).join('') || '<p class="muted">No quotes yet.</p>'}</div><div><h3>Recent jobs</h3>${jobs.slice(0,5).map(j=>`<p><b>${esc(j.job_number || 'Job')}</b> · ${money(j.total_price)} · ${esc(j.job_status)}</p>`).join('') || '<p class="muted">No jobs yet.</p>'}</div><div><h3>Invoices</h3>${invoices.slice(0,5).map(i=>`<p><b>${esc(i.invoice_number)}</b> · ${money(i.total)} · ${esc(i.status)}</p>`).join('') || '<p class="muted">No invoices yet.</p>'}</div></div>`}
    </section></div>`;
  }

  function settingsView() {
    const fields = { trading_name:'Trading name',legal_name:'Legal company name',phone:'Telephone',whatsapp:'WhatsApp',email:'Email',website:'Website',address_line:'Business address',bank_name:'Bank name',sort_code:'Sort code',account_number:'Account number',default_terms:'Payment terms (days)' };
    return panel('Business settings', `<form id="settings-form"><div class="grid two">${Object.entries(fields).map(([key,label]) => `<label>${label}<input name="${key}" value="${esc(state.settings[key] ?? '')}" ${key === 'default_terms' ? 'type="number"' : ''}></label>`).join('')}</div><div class="actions"><button class="primary">Save Settings</button></div></form><p class="saved">✓ Saved securely in Supabase.</p>`);
  }

  function render() {
    if (state.loading) { document.getElementById('app').innerHTML = '<div class="loading">Loading KLS SameDay Office…</div>'; return; }
    if (!state.user) { document.getElementById('app').innerHTML = authView(); bindAuth(); return; }
    const views = { dashboard, operations: operationsView, dispatch: dispatchView, newquote: newQuote, quotes: quotesView, jobs: jobsView, invoices: invoicesView, customers: customersView, settings: settingsView };
    document.getElementById('app').innerHTML = layout(views[state.page]());
    bindApp();
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
      const [customers, quotes, jobs, invoices, settings] = await Promise.all([
        db.from('customers').select('*').order('created_at', { ascending: false }),
        db.from('quotes').select('*').order('created_at', { ascending: false }),
        db.from('jobs').select('*').order('created_at', { ascending: false }),
        db.from('invoices').select('*').order('created_at', { ascending: false }),
        db.from('business_settings').select('*').maybeSingle()
      ]);
      for (const result of [customers, quotes, jobs, invoices, settings]) if (result.error) throw result.error;
      state.customers = customers.data || [];
      state.quotes = quotes.data || [];
      state.jobs = (jobs.data || []).map(j => ({ ...j, customer_name: j.customer_name || j.contact_name || '' }));
      state.invoices = invoices.data || [];
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
    document.querySelector('[data-action="signout"]')?.addEventListener('click', async () => { await db.auth.signOut(); state.user = null; state.customers=[]; state.quotes=[]; state.jobs=[]; state.invoices=[]; render(); });

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
            goods_description: form.goods_description || null, miles, quoted_price: Number(form.quoted_price || suggested), notes: savedNotes || null, status: 'Pending'
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
          delivery_address: quote.delivery_address, vehicle: quote.vehicle, goods_description: quote.goods_description,
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
        const payload = { user_id: state.user.id, job_id: job.id, customer_id: job.customer_id, invoice_number: numberCode('INV'), customer_name: job.customer_name || job.contact_name, total: Number(job.total_price || 0), status: 'Unpaid', issue_date: todayISO(), due_date: due };
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

    document.querySelectorAll('[data-invoice-status]').forEach(select => select.onchange = async () => {
      const invoice = state.invoices.find(i => i.id === select.dataset.invoiceStatus); const previous = invoice.status; invoice.status = select.value;
      const { error } = await db.from('invoices').update({ status: select.value, paid_date: select.value === 'Paid' ? todayISO() : null }).eq('id', invoice.id);
      if (error) { invoice.status = previous; showNotice(error.message, 'error'); render(); }
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

  async function initialise() {
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
