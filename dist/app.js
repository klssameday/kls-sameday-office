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
    portalUser: null,
    portalCustomer: null,
    portalBookings: [],
    portalJobs: [],
    portalInvoices: [],
    portalAddresses: [],
    portalAccessUsers: [],
    settings: { ...defaults },
    notice: null,
    loading: true,
    authMode: 'signin',
    selectedCustomerId: null,
    quoteCustomerId: null,
    selectedDriverJobId: null,
    publicTracking: null,
    routeStops: [],
    routeDate: new Date().toISOString().slice(0,10),
    publicQuote: null,
    publicQuoteRequestMode: false,
    quoteRequests: [],
    driverFilter: 'active',
    driverAccounts: [],
    exchangeJobs: [],
    exchangeBids: [],
    dispatchSearch: '',
    dispatchDriverFilter: 'all'
  };

  let locationWatchId = null;
  let trackingPollId = null;
  let officeRealtimeChannel = null;
  let realtimeRefreshTimer = null;

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
      <p>${configured ? 'Your records will be stored securely online.' : 'Supabase connection settings are unavailable.'}</p>
      ${!configured ? '<div class="authmsg error">The Supabase URL or anonymous key was not included in this deployment.</div>' : ''}
      <form id="auth-form">
        <label>Email address<input name="email" type="email" autocomplete="email" required></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" minlength="6" required></label>
        <button class="primary" style="width:100%" ${configured ? '' : 'disabled'}>${signUp ? 'Create Account' : 'Sign In'}</button>
      </form>
      <div id="auth-message"></div>
      <div class="authswitch">${signUp ? 'Already registered?' : 'First time using the system?'} <button data-auth-mode="${signUp ? 'signin' : 'signup'}">${signUp ? 'Sign in' : 'Create account'}</button></div>
    </section></div>`;
  }

  const navGroups = [
    ['Core', [
      ['dashboard','Dashboard'],
      ['operations','Today’s Planner'],
      ['dispatch','Live Dispatch'],
      ['jobs','Jobs']
    ]],
    ['Sales & Customers', [
      ['newquote','New Quote'],
      ['quotes','Quotes'],
      ['quoterequests','Online Requests'],
      ['customers','Customers'],
      ['portalrequests','Customer Portal']
    ]],
    ['Drivers & Tracking', [
      ['drivers','Driver Control'],
      ['tracking','Live Tracking'],
      ['exchange','Driver Exchange'],
      ['routes','Route Planner'],
      ['schedule','Booking Calendar']
    ]],
    ['Finance', [
      ['invoices','Invoices'],
      ['accounts','Accounts & Payments']
    ]],
    ['System', [
      ['settings','Settings']
    ]]
  ];

  const pageTitles = {
    dashboard:'Dashboard', smart:'Smart Dispatch', routes:'Route Planner', operations:'Today’s Planner',
    dispatch:'Live Dispatch', drivers:'Driver Control', exchange:'Driver Exchange', driver:'Driver App', tracking:'Live Tracking',
    fleet:'Fleet Management', schedule:'Booking Calendar', portalrequests:'Customer Portal',
    quoterequests:'Online Requests', newquote:'New Quote', quotes:'Quotes', jobs:'Jobs',
    invoices:'Invoices', accounts:'Accounts & Payments', customers:'Customers', settings:'Settings'
  };

  const navIcons = {
    dashboard:'⌂', operations:'◷', dispatch:'⇄', jobs:'▤', newquote:'＋', quotes:'◫',
    quoterequests:'↧', customers:'◎', portalrequests:'◉', drivers:'♙', driver:'♙', tracking:'⌖',
    exchange:'⇆', routes:'◇', schedule:'□', invoices:'£', accounts:'◌', settings:'⚙'
  };

  function layout(content) {
    const title = pageTitles[state.page] || 'Dashboard';
    const todayLabel = new Date().toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
    return `<div class="shell"><aside id="side" class="side">
      <div class="logo"><b>KLS</b><span><strong>SameDay</strong><small>Operations Platform</small></span></div>
      <button class="close" data-action="menu-close" aria-label="Close menu">×</button>
      <div class="account"><span class="account-avatar">${esc((state.user?.email || 'K').slice(0,1).toUpperCase())}</span><span><small>Signed in</small><b>${esc(state.user?.email || '')}</b></span></div>
      <nav>${navGroups.map(([group,items]) => `<section class="nav-group"><small class="nav-section">${group}</small>${items.map(([key,label]) => { const pendingPortal = key === 'portalrequests' ? state.portalBookings.filter(b=>b.status==='Pending').length : (key === 'quoterequests' ? state.quoteRequests.filter(b=>b.status==='Pending').length : 0); return `<button class="${state.page === key ? 'active' : ''}" data-page="${key}"><span class="nav-icon">${navIcons[key] || '•'}</span><span>${label}</span>${pendingPortal ? `<span class="nav-badge">${pendingPortal}</span>` : ''}</button>`; }).join('')}</section>`).join('')}<section class="nav-group"><small class="nav-section">Mobile</small><a class="nav-app-link" href="/driver.html" target="_blank" rel="noopener"><span class="nav-icon">▣</span><span>Open Driver App</span><b>↗</b></a></section></nav>
      <div class="sidefooter"><span class="connection"><span class="dot"></span> System online</span><button data-action="signout">Sign out</button></div>
    </aside><main>
      <header class="topbar"><button class="hamb" data-action="menu-open" aria-label="Open menu">☰</button><div class="topbar-title"><small>${todayLabel}</small><h1>${title}</h1><p>KLS SameDay business control centre</p></div><div class="topbar-actions"><span class="topbar-live"><i></i> Live</span><button class="primary" data-page="newquote">＋ New Quote</button></div></header>
      ${state.notice ? `<div class="notice ${state.notice.type}">${esc(state.notice.text)}<button data-action="notice-close">×</button></div>` : ''}
      <div class="page-content">${content}</div>
    </main></div>`;
  }

  const panel = (title, body, sub = '', right = '') => `<section class="panel"><div class="panelhead"><div><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>${body}</section>`;
  const card = (title, value, note = '', page = '') => `<button class="card dashboard-card" ${page ? `data-page="${page}"` : ''}><span>◆</span><div><small>${title}</small><b>${value}</b>${note ? `<em>${note}</em>` : ''}</div></button>`;

  function dashboard() {
    const today = todayISO();
    const now = Date.now();
    const activeJobs = state.jobs.filter(j => !['Delivered','Cancelled'].includes(j.job_status));
    const todayJobs = state.jobs.filter(j => j.job_status !== 'Cancelled' && String(j.collection_date || '').slice(0,10) === today);
    const liveJobs = activeJobs.filter(j => j.last_latitude && j.last_longitude);
    const availableDrivers = state.drivers.filter(d => String(d.status || d.availability_status || '').toLowerCase() === 'available');
    const onJobDrivers = state.drivers.filter(d => ['on job','on_job','busy','assigned'].includes(String(d.status || d.availability_status || '').toLowerCase()));
    const offlineDrivers = state.drivers.filter(d => ['offline','inactive'].includes(String(d.status || d.availability_status || '').toLowerCase()));
    const unpaid = state.invoices.filter(inv => !['Paid','Cancelled'].includes(inv.status));
    const overdue = unpaid.filter(inv => inv.due_date && String(inv.due_date).slice(0,10) < today);
    const pendingQuotes = state.quotes.filter(q => q.status === 'Pending');
    const pendingPortal = state.portalBookings.filter(b => b.status === 'Pending');
    const todayRevenue = todayJobs.reduce((sum,j)=>sum+Number(j.total_price||0),0);

    const lateCollections = activeJobs.filter(j => {
      if (!j.collection_date || !j.collection_time || ['Collected','In Transit'].includes(j.job_status)) return false;
      const due = new Date(`${String(j.collection_date).slice(0,10)}T${String(j.collection_time).slice(0,5)}:00`).getTime();
      return Number.isFinite(due) && due < now;
    });
    const staleTracking = liveJobs.filter(j => j.location_updated_at && now - new Date(j.location_updated_at).getTime() > 20*60000);
    const unassigned = activeJobs.filter(j => !j.assigned_driver_id && !j.assigned_driver_name);

    const alerts = [
      ...lateCollections.map(j=>({level:'danger',title:`Late collection · ${j.job_number||'Job'}`,text:`${j.collection_time ? String(j.collection_time).slice(0,5) : 'Time due'} · ${j.collection_address||'Collection address'}`,page:'dispatch'})),
      ...staleTracking.map(j=>({level:'warning',title:`Tracking stale · ${j.job_number||'Job'}`,text:`${j.assigned_driver_name||'Driver'} has not updated for over 20 minutes`,page:'tracking'})),
      ...(unassigned.length ? [{level:'warning',title:`${unassigned.length} unassigned active job${unassigned.length===1?'':'s'}`,text:'Assign a driver from the Dispatch Board',page:'dispatch'}] : []),
      ...(overdue.length ? [{level:'danger',title:`${overdue.length} overdue invoice${overdue.length===1?'':'s'}`,text:'Open Accounts to review outstanding money',page:'invoices'}] : []),
      ...(pendingPortal.length ? [{level:'info',title:`${pendingPortal.length} new portal request${pendingPortal.length===1?'':'s'}`,text:'Customer bookings are waiting for review',page:'portalrequests'}] : [])
    ];

    const stageOrder = ['Booked','Assigned','Collected','In Transit'];
    const board = stageOrder.map(status => {
      const jobs = activeJobs.filter(j => (j.job_status || 'Booked') === status).slice(0,4);
      return `<section class="command-stage"><header><span>${esc(status)}</span><b>${activeJobs.filter(j => (j.job_status || 'Booked') === status).length}</b></header><div>${jobs.map(j=>`<button data-page="dispatch"><strong>${esc(j.job_number||'Job')}</strong><small>${esc(j.customer_name||j.contact_name||'Customer')}</small><span>${esc(j.assigned_driver_name||'Unassigned')}</span></button>`).join('') || '<p>Clear</p>'}</div></section>`;
    }).join('');

    const driverRows = state.drivers.slice(0,8).map(d => {
      const status = d.status || d.availability_status || 'Offline';
      const vehicle = d.vehicle_type || d.vehicle || d.registration || 'Vehicle not set';
      return `<button class="command-driver" data-page="tracking"><i class="${String(status).toLowerCase().replace(/\s+/g,'-')}"></i><span><b>${esc(d.name||d.full_name||'Driver')}</b><small>${esc(vehicle)}</small></span><strong>${esc(status)}</strong></button>`;
    }).join('') || '<div class="command-empty">No drivers added yet.</div>';

    return `<section class="command-hero"><div><small>KLS SAMEDAY COMMAND CENTRE</small><h2>${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})}</h2><p>Live jobs, drivers, alerts and money — all from one control screen.</p></div><div><button class="secondary" data-action="refresh-dispatch">↻ Refresh</button><button class="primary" data-page="newquote">＋ New Job</button></div></section>
      <section class="command-kpis">${card('Active jobs',activeJobs.length,`${todayJobs.length} booked today`,'dispatch')}${card('Drivers online',liveJobs.length,`${availableDrivers.length} available`,'tracking')}${card('Today’s value',money(todayRevenue),`${todayJobs.length} scheduled job${todayJobs.length===1?'':'s'}`,'jobs')}${card('Needs attention',alerts.length,alerts.length?'Action required':'All clear','dashboard')}</section>
      <section class="command-layout"><div class="command-main">
        <section class="command-map-panel"><header><div><small>LIVE FLEET</small><h2>Driver map</h2></div><button class="secondary" data-page="tracking">Full tracking</button></header><div id="command-map" class="command-map"></div><div id="command-map-empty" class="command-map-empty hidden"><b>No live GPS positions</b><span>Drivers appear here when location tracking starts.</span></div></section>
        <section class="command-board-panel"><header><div><small>LIVE OPERATIONS</small><h2>Dispatch snapshot</h2></div><button class="secondary" data-page="dispatch">Open full board</button></header><div class="command-board">${board}</div></section>
      </div><aside class="command-side">
        <section class="command-panel"><header><div><small>ATTENTION</small><h2>Smart alerts</h2></div><b>${alerts.length}</b></header><div class="command-alerts">${alerts.slice(0,7).map(a=>`<button class="${a.level}" data-page="${a.page}"><span></span><div><b>${esc(a.title)}</b><small>${esc(a.text)}</small></div>→</button>`).join('') || '<div class="command-all-clear"><b>✓ All clear</b><span>Nothing urgent needs your attention.</span></div>'}</div></section>
        <section class="command-panel"><header><div><small>FLEET STATUS</small><h2>Drivers</h2></div><button data-page="dispatch">Open drivers</button></header><div class="command-drivers">${driverRows}</div><footer><span>${availableDrivers.length} available</span><span>${onJobDrivers.length} on jobs</span><span>${offlineDrivers.length} offline</span></footer></section>
        <section class="command-panel command-quick"><header><div><small>QUICK ACTIONS</small><h2>Run the business</h2></div></header><div><button data-page="newquote">＋<span><b>New quote</b><small>Price a delivery</small></span></button><button data-page="dispatch">🚚<span><b>Dispatch</b><small>Assign and move jobs</small></span></button><button data-page="customers">👤<span><b>Customer</b><small>Open CRM</small></span></button><button data-page="invoices">£<span><b>Invoices</b><small>${unpaid.length} unpaid</small></span></button></div></section>
      </aside></section>
      <section class="command-bottom">${card('Unassigned',unassigned.length,'Jobs waiting for a driver','dispatch')}${card('Live GPS',liveJobs.length,staleTracking.length?`${staleTracking.length} stale update${staleTracking.length===1?'':'s'}`:'Tracking healthy','tracking')}${card('Pending quotes',pendingQuotes.length,'Waiting for customer reply','quotes')}${card('Outstanding',money(unpaid.reduce((s,i)=>s+invoiceBalance(i),0)),`${overdue.length} overdue`,'invoices')}</section>`;
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
    const pendingPortal = state.portalBookings.filter(b => b.status === 'Pending');
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

  function quotePublicUrl(q) { return q?.public_token ? `${location.origin}${location.pathname}?quote=${encodeURIComponent(q.public_token)}` : ''; }

  function quotesView() {
    return panel('Quotes', table(['Quote','Customer','Route','Vehicle','Price','Status','Online','Actions'], state.quotes.map(q => [
      esc(q.quote_number), esc(q.customer_name), `${esc(q.collection_address)}<br><i>→ ${esc(q.delivery_address)}</i>`, esc(q.vehicle), money(q.quoted_price), esc(q.status),
      q.public_token ? `<span class="account-status ${q.customer_response === 'Accepted' ? 'paid' : q.customer_response === 'Declined' ? 'overdue' : 'unpaid'}">${esc(q.customer_response || 'Awaiting reply')}</span>` : '<i>Not published</i>',
      `<button data-print-quote="${q.id}">Print</button><button data-email-quote="${q.id}">Email</button><button data-whatsapp-quote="${q.id}">WhatsApp</button><button data-publish-quote="${q.id}">${q.public_token ? 'Copy link' : 'Create online link'}</button>${q.status === 'Pending' ? `<button data-accept="${q.id}">Accept → Job</button>` : ''}`
    ])), 'Send a secure link so the customer can review, accept or decline the quotation online.', '<button class="secondary" data-copy-request-link>Copy website request link</button>');
  }

  function publicQuoteView(row, loading=false, error='') {
    if (loading) return '<div class="public-quote-page"><div class="loading">Loading quotation…</div></div>';
    if (error || !row) return `<div class="public-quote-page"><section class="public-quote-card"><div class="public-quote-brand"><b>KLS</b><span>SameDay</span></div><h1>Quotation unavailable</h1><p>${esc(error || 'This quotation link is invalid or has expired.')}</p></section></div>`;
    const responded = ['Accepted','Declined'].includes(row.customer_response);
    return `<div class="public-quote-page"><section class="public-quote-card"><div class="public-quote-brand"><b>KLS</b><span>SameDay</span></div><small>SECURE ONLINE QUOTATION</small><h1>${esc(row.quote_number)}</h1><p class="public-quote-intro">Prepared for <b>${esc(row.customer_name)}</b></p><div class="public-quote-route"><p><small>COLLECTION</small>${esc(row.collection_address)}</p><p><small>DELIVERY</small>${esc(row.delivery_address)}</p></div><div class="public-quote-details"><p><span>Collection date</span><b>${fmtDate(row.collection_date)}</b></p><p><span>Vehicle</span><b>${esc(row.vehicle)}</b></p><p><span>Distance</span><b>${Number(row.miles||0).toFixed(1)} miles</b></p><p><span>Quote total</span><strong>${money(row.quoted_price)}</strong></p></div>${row.goods_description?`<div class="public-quote-note"><small>GOODS</small>${esc(row.goods_description)}</div>`:''}${row.notes?`<div class="public-quote-note"><small>NOTES</small>${esc(row.notes)}</div>`:''}${responded?`<div class="public-response ${row.customer_response.toLowerCase()}"><b>Quotation ${esc(row.customer_response.toLowerCase())}</b><span>${row.responded_at ? new Date(row.responded_at).toLocaleString('en-GB') : ''}</span></div>`:`<form id="public-quote-response"><label>Your name<input name="customer_name" required></label><label>Message to KLS (optional)<textarea name="customer_message"></textarea></label><div class="public-quote-actions"><button type="button" class="danger" data-public-decline>Decline</button><button class="primary">Accept quotation</button></div></form>`}<footer>Dedicated vehicle · No shared loads<br>0330 043 5237 · info@klssameday.co.uk</footer></section></div>`;
  }

  function publicRequestView() {
    return `<div class="public-quote-page"><section class="public-quote-card request-card"><div class="public-quote-brand"><b>KLS</b><span>SameDay</span></div><small>REQUEST A QUOTE</small><h1>Tell us about your delivery</h1><p class="public-quote-intro">Complete the form and KLS SameDay will review the job and contact you.</p><form id="public-request-form"><div class="grid two"><label>Company / name *<input name="customer_name" required></label><label>Contact name<input name="contact_name"></label><label>Email *<input name="email" type="email" required></label><label>Telephone / WhatsApp *<input name="phone" required></label><label>Collection date<input name="collection_date" type="date" min="${todayISO()}"></label><label>Collection time<input name="collection_time" type="time"></label></div><label>Collection address / postcode *<textarea name="collection_address" required></textarea></label><label>Delivery address / postcode *<textarea name="delivery_address" required></textarea></label><div class="grid two"><label>Vehicle required<select name="vehicle"><option>Not sure</option>${Object.keys(vehicles).map(v=>`<option>${v}</option>`).join('')}</select></label><label>Approximate mileage<input name="miles" type="number" min="0" step="0.1"></label></div><label>Goods / job details<textarea name="goods_description"></textarea></label><button class="primary" style="width:100%">Send quote request</button></form><footer>Based in Essex · Nationwide coverage<br>0330 043 5237 · info@klssameday.co.uk</footer></section></div>`;
  }

  function quoteRequestsView() {
    const rows=state.quoteRequests.length ? state.quoteRequests.map(r=>`<article><div><span><b>${esc(r.customer_name)}</b><small>${esc(r.email)} · ${esc(r.phone)}</small></span><span class="portal-status ${String(r.status||'Pending').toLowerCase()}">${esc(r.status||'Pending')}</span></div><p><small>COLLECT</small>${esc(r.collection_address)}</p><p><small>DELIVER</small>${esc(r.delivery_address)}</p><p><small>WHEN</small>${fmtDate(r.collection_date)} ${esc(String(r.collection_time||'').slice(0,5))}</p><p><small>VEHICLE</small>${esc(r.vehicle||'Not sure')}</p>${r.goods_description?`<p><small>DETAILS</small>${esc(r.goods_description)}</p>`:''}<footer>${r.status==='Pending'?`<button class="primary" data-request-convert="${r.id}">Turn into quote</button><button class="danger" data-request-reject="${r.id}">Reject</button>`:''}</footer></article>`).join(''):'<div class="fleet-empty">No online quote requests yet.</div>';
    return `<section class="tracking-hero"><div><small>V20 ONLINE BOOKING</small><h2>Online Quote Requests</h2><p>Requests submitted from your public KLS quote form.</p></div><button class="secondary" data-copy-request-link>Copy website request link</button></section>${panel('Customer requests',`<div class="portal-admin-list">${rows}</div>`,`${state.quoteRequests.filter(r=>r.status==='Pending').length} awaiting review`)}`;
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
    const today = todayISO();
    const allJobs = state.jobs.filter(j => j.job_status !== 'Cancelled').sort((a,b) => new Date(a.collection_date || a.created_at || 0) - new Date(b.collection_date || b.created_at || 0));
    const jobs = allJobs.filter(job => {
      if (state.driverFilter === 'today') return String(job.collection_date || '').slice(0,10) === today;
      if (state.driverFilter === 'all') return true;
      return !['Delivered','Cancelled'].includes(job.job_status);
    });
    const activeCount = allJobs.filter(j => !['Delivered','Cancelled'].includes(j.job_status)).length;
    const todayCount = allJobs.filter(j => String(j.collection_date || '').slice(0,10) === today).length;
    const cards = jobs.map(job => {
      const active = !['Delivered','Cancelled'].includes(job.job_status);
      const index = driverStatuses.indexOf(job.job_status);
      const next = index >= 0 && index < driverStatuses.length - 1 ? driverStatuses[index + 1] : (job.job_status === 'Booked' ? 'En Route to Collection' : '');
      const progress = Math.max(0, index);
      const destinationLabel = ['Booked','En Route to Collection','Arrived at Collection'].includes(job.job_status) ? 'Collection' : 'Delivery';
      const phone = job.customer_phone || job.phone || '';
      return `<article class="driver-card ${active ? 'active' : ''}"><div class="driver-card-head"><div><small>${fmtDate(job.collection_date)} ${esc(String(job.collection_time || '').slice(0,5))}</small><h3>${esc(job.job_number || 'Job')}</h3></div><span>${esc(job.job_status || 'Booked')}</span></div><b>${esc(job.customer_name || 'Customer')}</b><div class="driver-progress" aria-label="Job progress">${driverStatuses.map((status,i)=>`<span class="${i<=progress?'done':''}" title="${esc(status)}"></span>`).join('')}</div><div class="driver-route"><p><small>COLLECT</small>${esc(job.collection_address || '')}</p><p><small>DELIVER</small>${esc(job.delivery_address || '')}</p></div><div class="driver-quick-grid"><button class="secondary" data-driver-open="${job.id}">Open job</button><button class="secondary" data-driver-nav="${job.id}" data-nav-target="${destinationLabel.toLowerCase()}">Navigate to ${destinationLabel}</button>${phone ? `<a class="secondary button-link" href="tel:${esc(phone)}">Call customer</a>` : ''}<button class="secondary" data-driver-share="${job.id}">Share job</button></div>${next ? `<button class="driver-next primary" data-driver-status="${job.id}" data-status="${esc(next)}">${job.job_status === 'Booked' ? 'Start Job' : esc(next)}</button>` : `<button class="driver-next secondary" data-driver-open="${job.id}">View POD</button>`}</article>`;
    }).join('');
    return `<section class="ops-hero driver-hero"><div><small>V23 MOBILE DRIVER MODE</small><h2>Driver App</h2><p>One-tap job updates, navigation, live tracking and proof of delivery.</p></div><div class="live-pill">● GPS ready</div></section><section class="driver-toolbar"><div><b>${activeCount}</b><span>active jobs</span></div><div><b>${todayCount}</b><span>today</span></div><div class="driver-filter"><button class="${state.driverFilter==='active'?'active':''}" data-driver-filter="active">Active</button><button class="${state.driverFilter==='today'?'active':''}" data-driver-filter="today">Today</button><button class="${state.driverFilter==='all'?'active':''}" data-driver-filter="all">All</button></div></section><div class="driver-list">${cards || '<div class="empty">No jobs in this view.</div>'}</div>${driverModal()}`;
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
    return `<div class="public-track"><div class="track-card"><div class="track-logo"><b>KLS</b><span>SameDay Live Tracking</span></div><small>JOB ${esc(data.job_number || '')}</small><h1>${esc(data.status || 'Booked')}</h1><div class="track-progress">${driverStatuses.map((s,i) => `<span class="${i <= Math.max(driverStatuses.indexOf(data.status),0) ? 'done' : ''}"></span>`).join('')}</div><div class="track-route"><p><small>COLLECTION</small>${esc(data.collection_area || 'Collection arranged')}</p><p><small>DELIVERY</small>${esc(data.delivery_area || 'Delivery arranged')}</p></div>${Array.isArray(data.route_stops) && data.route_stops.length ? `<div class="track-stops"><small>ADDITIONAL STOPS</small>${data.route_stops.map((stop,i)=>`<p>${i+2}. ${esc(stop)}</p>`).join('')}</div>` : ''}${data.eta_at ? `<div class="eta-box"><small>ESTIMATED ARRIVAL</small><b>${new Date(data.eta_at).toLocaleString('en-GB')}</b></div>` : ''}${maps ? `<div id="public-track-map" class="public-track-map" data-lat="${data.last_latitude}" data-lng="${data.last_longitude}"></div><a class="secondary button-link map-link" href="${maps}" target="_blank">Open in Google Maps</a>` : '<div class="track-waiting">Live location will appear once the driver starts tracking.</div>'}<div class="track-update">Last update: ${data.location_updated_at ? new Date(data.location_updated_at).toLocaleString('en-GB') : 'Not started'}</div>${data.eta_at ? `<div class="eta-countdown" data-eta="${data.eta_at}">Calculating ETA countdown…</div>` : ''}${data.status === 'Delivered' ? `<div class="delivered-box"><b>Delivered</b><span>${data.delivered_at ? new Date(data.delivered_at).toLocaleString('en-GB') : ''}</span><span>${data.recipient_name ? `Received by ${esc(data.recipient_name)}` : ''}</span></div>` : ''}<footer>Dedicated vehicle • No shared loads<br>0330 043 5237 · info@klssameday.co.uk</footer></div></div>`;
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


  function driversManagementView() {
    const accountFor = driverId => state.driverAccounts.find(a => a.driver_id === driverId && a.active !== false);
    const activeJobsFor = driverId => state.jobs.filter(j => j.assigned_driver_id === driverId && !['Delivered','Cancelled'].includes(j.job_status));
    const rows = state.drivers.map(driver => {
      const account = accountFor(driver.id);
      const jobs = activeJobsFor(driver.id);
      return `<article class="driver-control-card">
        <div class="driver-control-main"><span class="driver-status-dot ${driver.active===false||driver.availability_status==='Offline'?'off':''}"></span><div><h3>${esc(driver.name || 'Driver')}</h3><p>${esc(driver.phone || 'No phone')} · ${esc(driver.vehicle || 'Vehicle not set')}</p></div></div>
        <div class="driver-control-details"><div><small>LOGIN EMAIL</small><b>${esc(account?.email || 'Not linked')}</b></div><div><small>STATUS</small><b>${esc(driver.availability_status || 'Available')}</b></div><div><small>ACTIVE JOBS</small><b>${jobs.length}</b></div></div>
        <footer>${account ? `<span class="linked-ok">✓ Driver App linked</span>` : `<button class="secondary" data-link-driver="${driver.id}">Link login</button>`}<button class="danger" data-delete-driver="${driver.id}">Delete</button></footer>
      </article>`;
    }).join('');
    const unlinked = state.drivers.filter(d => !accountFor(d.id));
    return `<section class="drivers-hero"><div><small>DRIVER ADMINISTRATION</small><h2>Driver Control</h2><p>Add drivers and connect their exact login email to the Driver App.</p></div><a class="primary button-link" href="/driver.html" target="_blank" rel="noopener">Open Driver App ↗</a></section>
      <section class="driver-control-grid"><div class="panel"><div class="panelhead"><div><h2>Add a driver</h2><p>The login email must exactly match the email used in the Driver App.</p></div></div><form id="driver-form" class="driver-admin-form"><label>Driver name<input name="name" required></label><label>Telephone<input name="phone"></label><label>Vehicle<input name="vehicle" placeholder="Luton Tail Lift"></label><label>Driver App login email<input name="login_email" type="email" required placeholder="driver@example.co.uk"></label><button class="primary">Add Driver & Link Login</button></form></div>
      <div class="panel"><div class="panelhead"><div><h2>Link an existing driver</h2><p>Use this when the driver already exists but the app says “Account not linked”.</p></div></div>${unlinked.length ? `<form id="driver-link-form" class="driver-admin-form"><label>Driver<select name="driver_id" required><option value="">Select driver</option>${unlinked.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label><label>Exact Driver App email<input name="email" type="email" required value="${esc(state.user?.email || '')}"></label><button class="primary">Link Driver Login</button></form>` : '<div class="empty">Every driver is already linked to a login.</div>'}</div></section>
      <section class="panel"><div class="panelhead"><div><h2>Your drivers</h2><p>${state.drivers.length} driver${state.drivers.length===1?'':'s'} in the system.</p></div></div><div class="driver-control-list">${rows || '<div class="empty">No drivers yet. Add your first driver above.</div>'}</div></section>`;
  }

  function dispatchView() {
    const today = todayISO();
    const searchable = state.jobs.filter(job => job.job_status !== 'Cancelled');
    const deliveredToday = searchable.filter(job => job.job_status === 'Delivered' && String(job.delivered_at || job.collection_date || '').slice(0,10) === today);
    const active = searchable.filter(job => job.job_status !== 'Delivered');
    const unassigned = active.filter(job => !job.assigned_driver_id);
    const assigned = active.filter(job => job.assigned_driver_id && ['Booked','En Route to Collection'].includes(job.job_status));
    const collection = active.filter(job => ['Arrived at Collection','Collected'].includes(job.job_status));
    const transit = active.filter(job => ['In Transit','Arrived at Delivery'].includes(job.job_status));
    const query = String(state.dispatchSearch || '').trim().toLowerCase();
    const driverFilter = String(state.dispatchDriverFilter || 'all');

    const matches = job => {
      const text = [job.job_number,job.customer_name,job.contact_name,job.collection_address,job.delivery_address,job.assigned_driver_name,job.vehicle].join(' ').toLowerCase();
      const searchOk = !query || text.includes(query);
      const driverOk = driverFilter === 'all' || (driverFilter === 'unassigned' ? !job.assigned_driver_id : job.assigned_driver_id === driverFilter);
      return searchOk && driverOk;
    };

    const compactCard = job => {
      const time = job.collection_time ? String(job.collection_time).slice(0,5) : 'TBC';
      const driver = job.assigned_driver_name || 'Unassigned';
      const liveAge = job.location_updated_at ? Math.max(0, Math.round((Date.now()-new Date(job.location_updated_at).getTime())/60000)) : null;
      return `<article class="dispatch-board-card" draggable="true" data-dispatch-job="${job.id}">
        <header><div><small>${esc(time)}</small><b>${esc(job.job_number || 'Job')}</b></div><span class="dispatch-status-pill">${esc(job.job_status || 'Booked')}</span></header>
        <h3>${esc(job.customer_name || job.contact_name || 'Customer')}</h3>
        <div class="dispatch-board-route"><p><small>COLLECT</small>${esc(job.collection_address || 'Not set')}</p><i>↓</i><p><small>DELIVER</small>${esc(job.delivery_address || 'Not set')}</p></div>
        <div class="dispatch-board-meta"><span>🚚 ${esc(job.vehicle || 'Vehicle TBC')}</span><span>👤 ${esc(driver)}</span>${liveAge !== null ? `<span class="live-chip">● GPS ${liveAge < 1 ? 'now' : `${liveAge}m`}</span>` : ''}</div>
        <footer><strong>${money(job.total_price)}</strong><div><button class="secondary" data-driver-open="${job.id}">Open</button></div></footer>
      </article>`;
    };

    const column = (key,label,subtitle,jobs,status) => {
      const filtered = jobs.filter(matches);
      return `<section class="dispatch-board-column" data-drop-status="${esc(status)}"><header><div><small>${esc(subtitle)}</small><h3>${esc(label)}</h3></div><b>${filtered.length}</b></header><div class="dispatch-board-stack">${filtered.map(compactCard).join('') || '<div class="dispatch-board-empty">Drop jobs here</div>'}</div></section>`;
    };

    const driverOptions = state.drivers.map(d=>`<option value="${d.id}" ${driverFilter===d.id?'selected':''}>${esc(d.name)}</option>`).join('');
    const liveCount = active.filter(j=>j.last_latitude&&j.last_longitude).length;
    const lateCount = active.filter(j=>j.collection_date && `${j.collection_date}T${String(j.collection_time||'23:59').slice(0,5)}` < new Date().toISOString().slice(0,16) && ['Booked','En Route to Collection'].includes(j.job_status)).length;

    return `<section class="dispatch-v4-hero"><div><small>KLS LIVE CONTROL</small><h2>Dispatch Board</h2><p>Move jobs through every stage, assign drivers and see live changes across the office.</p></div><div><button class="secondary" data-action="refresh-dispatch">↻ Refresh</button><button class="primary" data-page="newquote">＋ New Job</button></div></section>
      <section class="dispatch-v4-kpis">${card('Active jobs',active.length,'Currently moving','jobs')}${card('Unassigned',unassigned.length,'Needs a driver','dispatch')}${card('Live GPS',liveCount,'Reporting now','tracking')}${card('Collection alerts',lateCount,lateCount ? 'Check immediately' : 'No late collections','dispatch')}</section>
      <section class="dispatch-v4-tools"><label>Search<input id="dispatch-search" value="${esc(state.dispatchSearch||'')}" placeholder="Job, customer, postcode or driver"></label><label>Driver<select id="dispatch-driver-filter"><option value="all">All drivers</option><option value="unassigned" ${driverFilter==='unassigned'?'selected':''}>Unassigned only</option>${driverOptions}</select></label><div class="realtime-indicator"><span></span> Live updates on</div></section>
      <section class="dispatch-board">
        ${column('unassigned','Unassigned','WAITING FOR DRIVER',unassigned,'Booked')}
        ${column('assigned','Assigned','HEADING TO COLLECTION',assigned,'En Route to Collection')}
        ${column('collection','At Collection','LOADING / COLLECTED',collection,'Collected')}
        ${column('transit','In Transit','HEADING TO DELIVERY',transit,'In Transit')}
        ${column('delivered','Delivered','COMPLETED TODAY',deliveredToday,'Delivered')}
      </section>
      <section class="dispatch-v4-lower"><div class="live-map-panel"><div class="live-map-head"><div><small>LIVE FLEET MAP</small><h2>Driver locations</h2><p>Latest GPS positions from active jobs.</p></div><button class="secondary" data-action="refresh-map">Refresh map</button></div><div id="dispatch-map" class="dispatch-map"></div><div id="map-empty" class="map-empty hidden">No live GPS positions yet. Start tracking from the Driver App.</div></div>
      <aside class="dispatch-driver-strip"><header><div><small>DRIVER STATUS</small><h2>Available drivers</h2></div><button class="secondary" data-page="dispatch">Open drivers</button></header>${state.drivers.map(driver=>{const jobs=active.filter(j=>j.assigned_driver_id===driver.id);return `<div class="dispatch-driver-row"><span class="driver-status-dot ${driver.active===false||driver.availability_status==='Offline'?'off':''}"></span><div><b>${esc(driver.name)}</b><small>${esc(driver.vehicle||'Vehicle TBC')} · ${jobs.length} active</small></div><select data-driver-availability="${driver.id}">${['Available','On Job','Break','Offline'].map(x=>`<option ${String(driver.availability_status||'Available')===x?'selected':''}>${x}</option>`).join('')}</select></div>`;}).join('') || '<div class="dispatch-board-empty">No drivers added.</div>'}</aside></section>${driverModal()}`;
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



  function trackingAge(job) {
    if (!job?.location_updated_at) return { minutes: null, label: 'Not started', className: 'offline' };
    const minutes = Math.max(0, Math.floor((Date.now() - new Date(job.location_updated_at).getTime()) / 60000));
    if (minutes < 2) return { minutes, label: 'Live now', className: 'live' };
    if (minutes < 10) return { minutes, label: `${minutes} min ago`, className: 'recent' };
    return { minutes, label: `${minutes} min ago`, className: 'stale' };
  }

  function liveTrackingView() {
    const active = state.jobs.filter(j => !['Delivered','Cancelled'].includes(j.job_status));
    const reporting = active.filter(j => j.last_latitude && j.last_longitude);
    const fresh = reporting.filter(j => trackingAge(j).className === 'live');
    const stale = reporting.filter(j => trackingAge(j).className === 'stale');
    const rows = active.length ? active.map(job => {
      const age = trackingAge(job);
      const driver = job.assigned_driver_name || 'Unassigned';
      return `<article class="tracking-job-card"><div class="tracking-job-head"><span><small>${esc(job.job_number || 'JOB')}</small><b>${esc(job.customer_name || 'Customer')}</b></span><span class="tracking-health ${age.className}">${age.label}</span></div><p><small>DRIVER</small>${esc(driver)}</p><p><small>STATUS</small>${esc(job.job_status || 'Booked')}</p><p><small>ROUTE</small>${esc(job.collection_address || '')} → ${esc(job.delivery_address || '')}</p>${job.eta_at ? `<p><small>CUSTOMER ETA</small>${new Date(job.eta_at).toLocaleString('en-GB')}</p>` : ''}<footer><button class="secondary" data-driver-open="${job.id}">Open driver job</button>${job.tracking_token ? `<button class="secondary" data-copy-track="${job.id}">Copy tracking link</button>` : ''}${job.last_latitude && job.last_longitude ? `<a class="primary button-link" target="_blank" href="https://www.google.com/maps?q=${job.last_latitude},${job.last_longitude}">Open location</a>` : ''}</footer></article>`;
    }).join('') : '<div class="fleet-empty">No active jobs to track.</div>';
    return `<section class="tracking-hero"><div><small>V17 LIVE TRACKING CENTRE</small><h2>Live Tracking</h2><p>See every active job, GPS health, customer ETA and the latest driver position.</p></div><button class="secondary" data-action="refresh-tracking">Refresh</button></section><section class="tracking-kpis">${card('Active jobs',active.length,'Not completed')}${card('Reporting GPS',reporting.length,'With a location')}${card('Live now',fresh.length,'Updated under 2 mins')}${card('Needs attention',stale.length,'GPS over 10 mins old')}</section><section class="live-map-panel"><div class="live-map-head"><div><small>LIVE VEHICLE MAP</small><h2>Latest driver positions</h2><p>The map refreshes from the latest job GPS updates.</p></div></div><div id="tracking-centre-map" class="dispatch-map"></div><div id="tracking-centre-empty" class="map-empty hidden">No GPS positions yet. Open a job in Driver App and press Start Live Tracking.</div></section><section class="panel"><div class="panelhead"><div><h2>Tracking status</h2><p>Stale locations may mean the driver closed the app or lost signal.</p></div></div><div class="tracking-job-grid">${rows}</div></section>`;
  }

  function portalStatusBadge(status) {
    const value = String(status || 'Pending');
    return `<span class="portal-status ${value.toLowerCase().replace(/\s+/g,'-')}">${esc(value)}</span>`;
  }

  function customerPortalView() {
    const customer = state.portalCustomer || {};
    const active = state.portalJobs.filter(j => !['Delivered','Cancelled'].includes(j.job_status));
    const completed = state.portalJobs.filter(j => j.job_status === 'Delivered');
    const outstanding = state.portalInvoices.reduce((sum, inv) => sum + invoiceBalance(inv), 0);
    const recentJobs = state.portalJobs.slice(0, 8);
    const requests = state.portalBookings.slice(0, 6);
    return `<div class="portal-shell"><header class="portal-top"><div class="portal-brand"><b>KLS</b><span>SameDay Customer Portal</span></div><div><strong>${esc(customer.company || state.user?.email || 'Customer')}</strong><button class="secondary" data-action="portal-signout">Sign out</button></div></header><main class="portal-main">
      ${state.notice ? `<div class="notice ${state.notice.type}">${esc(state.notice.text)}<button data-action="notice-close">×</button></div>` : ''}
      <section class="portal-hero"><div><small>WELCOME TO KLS SAMEDAY</small><h1>${esc(customer.company || 'Your account')}</h1><p>Book collections, follow active deliveries and access your account documents.</p></div><button class="primary" data-action="portal-book-focus">＋ Book a collection</button></section>
      <section class="portal-kpis">${card('Active jobs',active.length,'Currently in progress')}${card('Completed jobs',completed.length,'Delivery history')}${card('Outstanding',money(outstanding),`${state.portalInvoices.filter(i=>invoiceBalance(i)>0).length} invoice${state.portalInvoices.filter(i=>invoiceBalance(i)>0).length===1?'':'s'}`)}${card('Booking requests',state.portalBookings.filter(b=>b.status==='Pending').length,'Awaiting office approval')}</section>
      <section class="portal-grid"><div>
        ${panel('Book a collection', `<form id="portal-booking-form"><div class="portal-form-section"><h3>Collection and delivery</h3><div class="grid two"><label>Collection date<input name="collection_date" type="date" min="${todayISO()}" value="${todayISO()}" required></label><label>Ready time<input name="collection_time" type="time"></label><label>Required delivery date<input name="required_delivery_date" type="date" min="${todayISO()}"></label><label>Required delivery time<input name="required_delivery_time" type="time"></label><label>Saved collection address<select data-fill-address="collection_address"><option value="">Choose saved address</option>${state.portalAddresses.map(a=>`<option value="${esc(a.address)}">${esc(a.label)}</option>`).join('')}</select></label><label>Saved delivery address<select data-fill-address="delivery_address"><option value="">Choose saved address</option>${state.portalAddresses.map(a=>`<option value="${esc(a.address)}">${esc(a.label)}</option>`).join('')}</select></label><label>Collection address<textarea name="collection_address" required></textarea></label><label>Delivery address<textarea name="delivery_address" required></textarea></label></div></div><div class="portal-form-section"><h3>Load details</h3><div class="grid two"><label>Vehicle required<select name="vehicle">${Object.keys(vehicles).map(v=>`<option>${v}</option>`).join('')}</select></label><label>Approximate weight (kg)<input name="weight_kg" type="number" min="0" step="1"></label><label>Dimensions / pallet count<input name="dimensions" placeholder="e.g. 2 pallets or 120 × 80 × 100 cm"></label><label>Collection contact<input name="collection_contact"></label><label>Delivery contact<input name="delivery_contact"></label><label>Contact telephone<input name="contact_phone" value="${esc(customer.phone || '')}"></label><label>Load description<textarea name="load_description"></textarea></label><label>Special instructions<textarea name="special_instructions"></textarea></label></div></div><div class="actions"><button class="primary">Submit booking request</button></div></form>`, 'The KLS office will review the request, confirm the price and assign the correct vehicle.')}
        ${panel('Your jobs', recentJobs.length ? `<div class="portal-job-list">${recentJobs.map(j=>`<article><div><b>${esc(j.job_number||'Job')}</b>${portalStatusBadge(j.job_status)}</div><h3>${fmtDate(j.collection_date)} ${esc(String(j.collection_time||'').slice(0,5))}</h3><p><small>COLLECT</small>${esc(j.collection_address||'')}</p><p><small>DELIVER</small>${esc(j.delivery_address||'')}</p><footer>${j.tracking_token ? `<a class="secondary button-link" href="?track=${encodeURIComponent(j.tracking_token)}">Track job</a>` : ''}${j.pod_photo_url ? `<a class="secondary button-link" href="${esc(j.pod_photo_url)}" target="_blank" rel="noopener">View POD</a>` : ''}<button class="secondary" data-portal-rebook="${j.id}">Rebook</button></footer></article>`).join('')}</div>` : '<div class="fleet-empty">No jobs are visible on your account yet.</div>', 'Live and completed deliveries.')}
      </div><aside class="portal-side">
        ${panel('Booking requests', requests.length ? `<div class="portal-request-list">${requests.map(b=>`<p><span><b>${fmtDate(b.collection_date)}</b><small>${esc(b.collection_address)} → ${esc(b.delivery_address)}</small></span>${portalStatusBadge(b.status)}</p>`).join('')}</div>` : '<div class="fleet-empty">No booking requests yet.</div>')}
        ${panel('Invoices', state.portalInvoices.length ? `<div class="portal-invoice-list">${state.portalInvoices.slice(0,10).map(inv=>`<p><span><b>${esc(inv.invoice_number||'Invoice')}</b><small>Due ${fmtDate(inv.due_date)}</small></span><strong>${money(invoiceBalance(inv))}</strong></p>`).join('')}</div>` : '<div class="fleet-empty">No invoices available.</div>', `Outstanding balance ${money(outstanding)}`)}
        ${panel('Saved addresses', `<form id="portal-address-form"><label>Address name<input name="label" placeholder="Main warehouse" required></label><label>Full address<textarea name="address" required></textarea></label><div class="actions"><button class="primary">Save address</button></div></form>${state.portalAddresses.length?`<div class="portal-address-list">${state.portalAddresses.map(a=>`<article><span><b>${esc(a.label)}</b><small>${esc(a.address)}</small></span><button class="danger" data-delete-address="${a.id}">×</button></article>`).join('')}</div>`:'<div class="fleet-empty">No saved addresses yet.</div>'}`, 'Use saved locations to make repeat bookings faster.')}
        ${panel('Need help?', `<div class="portal-help"><p>Call <b>${esc(state.settings.phone)}</b></p><p>WhatsApp <b>${esc(state.settings.whatsapp)}</b></p><p>Email <b>${esc(state.settings.email)}</b></p></div>`)}
      </aside></section></main></div>`;
  }

  function bindCustomerPortal() {
    document.querySelector('[data-action="portal-signout"]')?.addEventListener('click', async()=>{ await db.auth.signOut(); state.user=null; state.portalUser=null; state.portalCustomer=null; state.loading=false; render(); });
    document.querySelector('[data-action="notice-close"]')?.addEventListener('click',()=>{state.notice=null;render();});
    document.querySelector('[data-action="portal-book-focus"]')?.addEventListener('click',()=>document.querySelector('#portal-booking-form input')?.focus());
    document.querySelectorAll('[data-fill-address]').forEach(select=>select.addEventListener('change',()=>{ const target=document.querySelector(`[name="${select.dataset.fillAddress}"]`); if(target && select.value) target.value=select.value; }));
    document.getElementById('portal-address-form')?.addEventListener('submit', async e=>{ e.preventDefault(); try{ const form=Object.fromEntries(new FormData(e.currentTarget)); const payload={...form,customer_id:state.portalCustomer.id,owner_id:state.portalUser.owner_id,created_by:state.user.id}; const {data,error}=await db.from('customer_addresses').insert(payload).select().single(); if(error)throw error; state.portalAddresses.push(data); showNotice('Address saved.','ok'); render(); }catch(error){showNotice(error.message,'error');render();} });
    document.querySelectorAll('[data-delete-address]').forEach(btn=>btn.addEventListener('click',async()=>{ if(!confirm('Remove this saved address?'))return; const {error}=await db.from('customer_addresses').delete().eq('id',btn.dataset.deleteAddress); if(error)showNotice(error.message,'error'); else {state.portalAddresses=state.portalAddresses.filter(a=>a.id!==btn.dataset.deleteAddress);showNotice('Address removed.','ok');} render(); }));
    document.getElementById('portal-booking-form')?.addEventListener('submit', async e=>{
      e.preventDefault();
      try {
        const form=Object.fromEntries(new FormData(e.currentTarget));
        const payload={...form,customer_id:state.portalCustomer.id,owner_id:state.portalUser.owner_id,requested_by:state.user.id,status:'Pending'};
        const {data,error}=await db.from('portal_bookings').insert(payload).select().single();
        if(error)throw error;
        state.portalBookings.unshift(data); showNotice('Booking request sent to KLS SameDay.','ok'); render();
      } catch(error){showNotice(error.message,'error');render();}
    });
    document.querySelectorAll('[data-portal-rebook]').forEach(btn=>btn.addEventListener('click', async()=>{
      const job=state.portalJobs.find(j=>j.id===btn.dataset.portalRebook); if(!job)return;
      try{const payload={owner_id:state.portalUser.owner_id,customer_id:state.portalCustomer.id,requested_by:state.user.id,collection_date:todayISO(),collection_time:job.collection_time||null,collection_address:job.collection_address,delivery_address:job.delivery_address,vehicle:job.vehicle||'Luton Tail Lift',load_description:`Rebook of ${job.job_number||'previous job'}`,status:'Pending'};const{data,error}=await db.from('portal_bookings').insert(payload).select().single();if(error)throw error;state.portalBookings.unshift(data);showNotice('Rebooking request sent. Choose the final date with the office if needed.','ok');render();}catch(error){showNotice(error.message,'error');render();}
    }));
  }


  function dispatchIntelligence() {
    const activeJobs = state.jobs.filter(j => !['Delivered','Cancelled'].includes(j.job_status));
    const assignedCounts = Object.fromEntries(state.drivers.map(d => [d.id, activeJobs.filter(j => j.assigned_driver_id === d.id).length]));
    const availableDrivers = state.drivers.filter(d => !d.availability || ['Available','Online'].includes(d.availability));
    const driverPool = availableDrivers.length ? availableDrivers : state.drivers;
    const bestDriver = driverPool.slice().sort((a,b) => (assignedCounts[a.id]||0) - (assignedCounts[b.id]||0))[0];
    return { activeJobs, assignedCounts, bestDriver };
  }

  function estimatedOperatingCost(item) {
    const miles = Number(item.miles || 0);
    const vehicle = item.vehicle || 'Luton Tail Lift';
    const perMile = vehicle === 'Small Van' ? 0.42 : vehicle === 'Medium Van' ? 0.52 : vehicle === 'LWB' ? 0.64 : 0.82;
    const driverAllowance = miles ? Math.max(25, (miles / 45) * 18) : 25;
    return Math.round((miles * perMile + driverAllowance) * 100) / 100;
  }

  function smartRecommendation(item) {
    const revenue = Number(item.quoted_price || item.total_price || 0);
    const cost = Number(item.costs || 0) || estimatedOperatingCost(item);
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    const result = margin >= 45 ? 'Accept' : margin >= 25 ? 'Review' : 'Low margin';
    return { revenue, cost, profit, margin, result };
  }

  function smartDispatchView() {
    const { activeJobs, assignedCounts, bestDriver } = dispatchIntelligence();
    const candidates = [
      ...state.quotes.filter(q => q.status === 'Pending').map(q => ({...q, source:'Quote', label:q.quote_number || 'Pending quote'})),
      ...activeJobs.map(j => ({...j, source:'Job', label:j.job_number || 'Active job'}))
    ].slice(0,12);
    const analysed = candidates.map(item => ({item, score:smartRecommendation(item)}));
    const projectedRevenue = analysed.reduce((s,x)=>s+x.score.revenue,0);
    const projectedProfit = analysed.reduce((s,x)=>s+x.score.profit,0);
    const highMargin = analysed.filter(x=>x.score.margin>=45).length;
    const rows = analysed.length ? analysed.map(({item,score}) => {
      const suggested = bestDriver ? `${bestDriver.name}${bestDriver.vehicle ? ` · ${bestDriver.vehicle}` : ''}` : 'Add a driver';
      return `<article class="intelligence-card"><div class="intelligence-head"><span><small>${esc(item.source)}</small><b>${esc(item.label)}</b></span><span class="decision ${score.result.toLowerCase().replace(/\s+/g,'-')}">${score.result}</span></div><h3>${esc(item.customer_name || item.contact_name || 'Customer')}</h3><div class="intelligence-route"><p><small>COLLECT</small>${esc(item.collection_address || 'Not entered')}</p><p><small>DELIVER</small>${esc(item.delivery_address || 'Not entered')}</p></div><div class="intelligence-numbers"><div><small>Revenue</small><b>${money(score.revenue)}</b></div><div><small>Est. cost</small><b>${money(score.cost)}</b></div><div><small>Est. profit</small><b>${money(score.profit)}</b></div><div><small>Margin</small><b>${score.margin.toFixed(0)}%</b></div></div><footer><span><small>SUGGESTED DRIVER</small><b>${esc(suggested)}</b></span><button class="secondary" data-page="${item.source==='Quote'?'quotes':'dispatch'}">Open ${item.source}</button></footer></article>`;
    }).join('') : '<div class="smart-empty"><b>No work to analyse</b><p>Create a quote or job and it will appear here automatically.</p><button class="primary" data-page="newquote">＋ New Quote</button></div>';
    const driverRows = state.drivers.length ? state.drivers.map(d=>`<div class="driver-load-row"><span><b>${esc(d.name)}</b><small>${esc(d.vehicle||'Vehicle not set')}</small></span><strong>${assignedCounts[d.id]||0} active</strong></div>`).join('') : '<div class="fleet-empty">No drivers have been added yet.</div>';
    return `<section class="smart-hero"><div><small>V18 OPERATIONS INTELLIGENCE</small><h2>Smart Dispatch</h2><p>Rule-based job analysis using your live quotes, drivers, workload and KLS pricing data.</p></div><button class="primary" data-page="newquote">Analyse a new quote</button></section><section class="smart-kpis">${card('Work analysed',analysed.length,'Pending quotes and active jobs')}${card('Projected revenue',money(projectedRevenue),'Current analysed workload')}${card('Projected profit',money(projectedProfit),'Before fixed overheads')}${card('Strong margins',highMargin,'Estimated margin 45%+')}</section><section class="smart-layout"><div>${panel('Dispatch recommendations',`<div class="intelligence-grid">${rows}</div>`,'Costs are estimates based on mileage, vehicle type and driver time. Review before accepting work.')}</div><aside class="smart-side">${panel('Best available driver', bestDriver ? `<div class="best-driver"><b>${esc(bestDriver.name)}</b><span>${esc(bestDriver.vehicle||'Vehicle not set')}</span><small>${assignedCounts[bestDriver.id]||0} active job(s)</small></div>` : '<div class="fleet-empty">Add a driver to receive suggestions.</div>','Lowest current assigned workload')}${panel('Driver workload',`<div class="driver-load-list">${driverRows}</div>`,'Used to balance new work')}${panel('How it decides','<div class="decision-guide"><p><b>Accept</b><span>Estimated margin 45% or more</span></p><p><b>Review</b><span>Estimated margin 25–44%</span></p><p><b>Low margin</b><span>Estimated margin below 25%</span></p></div>','This is decision support, not automatic acceptance.')}</aside></section>`;
  }



  function routePlannerView() {
    const date = state.routeDate || todayISO();
    const routeJobs = state.jobs.filter(job => String(job.collection_date || '').slice(0,10) === date && !['Cancelled','Delivered'].includes(job.job_status));
    const stopMap = new Map(state.routeStops.filter(stop => stop.route_date === date).map(stop => [stop.job_id, stop]));
    const laneFor = job => stopMap.get(job.id)?.driver_id || job.assigned_driver_id || '';
    const orderFor = job => Number(stopMap.get(job.id)?.stop_order || 9999);
    const unassigned = routeJobs.filter(job => !laneFor(job)).sort((a,b)=>orderFor(a)-orderFor(b));
    const activeDrivers = state.drivers.filter(d => d.active !== false);
    const jobCard = job => `<article class="route-job-card" draggable="true" data-route-job="${job.id}"><div><small>${esc(String(job.collection_time||'').slice(0,5) || 'Time TBC')}</small><b>${esc(job.job_number||'Job')}</b><span>${esc(job.customer_name||'Customer')}</span></div><p><small>COLLECT</small>${esc(job.collection_address||'')}</p><p><small>DELIVER</small>${esc(job.delivery_address||'')}</p><footer><span>${Number(job.miles||0)} miles</span><span>${money(job.total_price||0)}</span></footer></article>`;
    const unassignedHtml = unassigned.length ? unassigned.map(jobCard).join('') : '<div class="route-empty">No unassigned jobs for this date.</div>';
    const driverLanes = activeDrivers.map(driver => {
      const jobs = routeJobs.filter(job => laneFor(job) === driver.id).sort((a,b)=>orderFor(a)-orderFor(b));
      const miles = jobs.reduce((sum,j)=>sum+Number(j.miles||0),0);
      const revenue = jobs.reduce((sum,j)=>sum+Number(j.total_price||0),0);
      return `<section class="route-driver-lane" data-route-lane="${driver.id}"><header><div><small>DRIVER</small><h3>${esc(driver.name)}</h3><p>${esc(driver.vehicle||'Vehicle not set')}</p></div><div><b>${jobs.length} stop${jobs.length===1?'':'s'}</b><span>${miles.toFixed(0)} miles · ${money(revenue)}</span></div></header><div class="route-dropzone" data-route-drop="${driver.id}">${jobs.length ? jobs.map((job,index)=>`<div class="route-stop-wrap"><span class="stop-number">${index+1}</span>${jobCard(job)}</div>`).join('') : '<div class="route-empty">Drop jobs here</div>'}</div></section>`;
    }).join('');
    const totalMiles = routeJobs.reduce((sum,j)=>sum+Number(j.miles||0),0);
    const totalRevenue = routeJobs.reduce((sum,j)=>sum+Number(j.total_price||0),0);
    return `<section class="route-hero"><div><small>V19 ROUTE PLANNING</small><h2>Route Planner</h2><p>Plan each driver's delivery order by dragging jobs into a route.</p></div><label>Planning date<input id="route-date" type="date" value="${esc(date)}"></label></section><section class="route-kpis">${card('Jobs to plan',routeJobs.length,'Active jobs on selected date')}${card('Unassigned',unassigned.length,'Waiting for a driver')}${card('Planned miles',totalMiles.toFixed(0),'Based on job mileage')}${card('Route revenue',money(totalRevenue),'Selected date')}</section><section class="route-board"><aside class="route-unassigned" data-route-drop=""><div class="route-column-head"><div><small>UNASSIGNED</small><h2>Jobs waiting</h2></div><span>${unassigned.length}</span></div><div class="route-dropzone">${unassignedHtml}</div></aside><div class="route-lanes">${driverLanes || '<div class="fleet-empty">Add a driver before planning routes.</div>'}</div></section><section class="panel route-help"><h3>How to use it</h3><p>Drag a job into a driver lane. Drop it above or below another job to change the stop order. Changes save immediately.</p><p><b>Note:</b> v19 organises your route order using the mileage already stored on each job. It does not use paid traffic or postcode routing APIs.</p></section>`;
  }

  function portalRequestsView() {
    const pending=state.portalBookings.filter(b=>b.status==='Pending');
    const rows=state.portalBookings.length?`<div class="portal-admin-list">${state.portalBookings.map(b=>{const customer=state.customers.find(c=>c.id===b.customer_id);return `<article><div><span><b>${esc(customer?.company||'Customer')}</b><small>${fmtDate(b.collection_date)} ${esc(String(b.collection_time||'').slice(0,5))}</small></span>${portalStatusBadge(b.status)}</div><p><small>COLLECT</small>${esc(b.collection_address)}</p><p><small>DELIVER</small>${esc(b.delivery_address)}</p><p><small>VEHICLE</small>${esc(b.vehicle||'Not specified')}</p>${b.load_description?`<p><small>LOAD</small>${esc(b.load_description)}</p>`:''}<footer>${b.status==='Pending'?`<button class="primary" data-portal-approve="${b.id}">Approve & create job</button><button class="danger" data-portal-reject="${b.id}">Reject</button>`:''}</footer></article>`}).join('')}</div>`:'<div class="fleet-empty">No portal booking requests yet.</div>';
    return `<section class="fleet-hero"><div><small>V16 CUSTOMER PORTAL</small><h2>Customer Portal</h2><p>Review requests sent directly by customer accounts.</p></div><strong>${pending.length} pending</strong></section>${panel('Customer requests',rows,'Approved requests create a confirmed job in your booking calendar.')}`;
  }

  function driverExchangeView() {
    const statusLabel = value => ({
      open:'Open', awarded:'Awarded', accepted:'Accepted',
      withdrawn:'Withdrawn', completed:'Completed', draft:'Draft'
    }[String(value||'').toLowerCase()] || value || 'Unknown');

    const offerLabel = value => ({
      submitted:'Submitted', awarded:'Awarded', accepted:'Accepted',
      not_awarded:'Not Awarded', declined:'Declined', withdrawn:'Withdrawn'
    }[String(value||'').toLowerCase()] || value || 'Unknown');

    const openJobs = state.exchangeJobs.filter(j => j.status === 'open');
    const awardedJobs = state.exchangeJobs.filter(j => ['awarded','accepted'].includes(j.status));
    const withdrawnJobs = state.exchangeJobs.filter(j => j.status === 'withdrawn');
    const submittedOffers = state.exchangeBids.filter(b => b.offer_status === 'submitted');

    const jobOptions = state.jobs
      .filter(j => !['Delivered','Cancelled'].includes(j.job_status))
      .map(j => `<option value="${j.id}">${esc(j.job_number || 'Job')} · ${esc(j.collection_address || '')} → ${esc(j.delivery_address || '')}</option>`)
      .join('');

    const cards = state.exchangeJobs.length ? state.exchangeJobs.map(job => {
      const offers = state.exchangeBids
        .filter(b => b.network_job_id === job.id)
        .sort((a,b)=>Number(a.offer_amount)-Number(b.offer_amount));

      const offerRows = offers.length ? offers.map(offer => {
        const won = ['awarded','accepted'].includes(offer.offer_status);
        return `<article class="exchange-bid ${won?'winner':''}">
          <div>
            <b>${esc(offer.driver_name || 'Driver')}</b>
            <small>${esc(offer.driver_vehicle || 'Vehicle not set')}${offer.vehicle_registration ? ` · ${esc(offer.vehicle_registration)}` : ''}</small>
            ${offer.message ? `<p>${esc(offer.message)}</p>` : ''}
          </div>
          <strong>${money(offer.offer_amount)}</strong>
          ${job.status==='open' && offer.offer_status==='submitted'
            ? `<button class="primary" data-award-offer="${offer.offer_id}">Award job</button>`
            : `<span class="status ${won?'paid':'draft'}">${esc(offerLabel(offer.offer_status))}</span>`}
        </article>`;
      }).join('') : '<div class="fleet-empty">No offers received yet.</div>';

      const collectionWhen = job.collection_at ? new Date(job.collection_at) : null;
      const dateText = collectionWhen && !Number.isNaN(collectionWhen.valueOf())
        ? `${collectionWhen.toLocaleDateString('en-GB')} ${collectionWhen.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}`
        : 'Time TBC';

      return `<article class="exchange-job">
        <header>
          <div>
            <small>${esc(job.vehicle_required || 'Any vehicle')} · ${esc(dateText)}</small>
            <h3>${esc(job.collection_postcode || job.collection_address || 'Collection')} → ${esc(job.delivery_postcode || job.delivery_address || 'Delivery')}</h3>
          </div>
          <span class="exchange-status ${String(job.status).toLowerCase()}">${esc(statusLabel(job.status))}</span>
        </header>
        <div class="exchange-route">
          <p><small>COLLECTION</small>${esc(job.collection_address || '')}</p>
          <p><small>DELIVERY</small>${esc(job.delivery_address || '')}</p>
        </div>
        <div class="exchange-meta">
          <span>${Number(job.mileage||0).toFixed(0)} miles</span>
          <span>${esc(job.goods_description || 'Load details not entered')}</span>
          ${job.weight_kg ? `<span>${esc(job.weight_kg)} kg</span>` : ''}
        </div>
        ${job.notes ? `<p class="exchange-notes">${esc(job.notes)}</p>` : ''}
        <section class="exchange-offers"><h4>Driver offers (${offers.length})</h4>${offerRows}</section>
        ${job.status==='open' ? `<footer><button class="danger" data-withdraw-network="${job.id}">Withdraw job</button></footer>` : ''}
      </article>`;
    }).join('') : '<div class="fleet-empty">No jobs have been posted to your driver network.</div>';

    return `<section class="fleet-hero exchange-hero">
      <div><small>PRIVATE KLS DRIVER NETWORK</small><h2>Driver Exchange</h2><p>Post work to approved drivers, receive offers and choose who gets the job. Customer prices remain private.</p></div>
      <strong>${openJobs.length} open</strong>
    </section>
    <section class="exchange-layout">
      <div>${panel('Post a job to the network',`<form id="network-job-form">
        <label>Link an existing KLS job (optional)<select name="linked_job_id"><option value="">Standalone network job</option>${jobOptions}</select></label>
        <div class="grid two">
          <label>Collection address or area<input name="collection_address" required></label>
          <label>Collection postcode<input name="collection_postcode"></label>
          <label>Delivery address or area<input name="delivery_address" required></label>
          <label>Delivery postcode<input name="delivery_postcode"></label>
          <label>Collection date<input name="collection_date" type="date" value="${todayISO()}" required></label>
          <label>Collection time<input name="collection_time" type="time"></label>
          <label>Vehicle required<select name="vehicle_required"><option>Small Van</option><option>Medium Van</option><option>LWB</option><option>XLWB</option><option>Luton</option><option selected>Luton Tail Lift</option><option>Any suitable vehicle</option></select></label>
          <label>Approx. mileage<input name="mileage" type="number" min="0" step="1"></label>
          <label>Weight (kg)<input name="weight_kg" type="number" min="0" step="1"></label>
          <label>Load description<input name="goods_description"></label>
        </div>
        <label>Driver notes<textarea name="notes" rows="3"></textarea></label>
        <div class="actions"><button class="primary">Send to Driver Network</button></div>
      </form>`,'Drivers do not see the customer charge, your costs or your margin.')}</div>
      <aside class="exchange-summary">
        ${card('Open jobs',openJobs.length,'Waiting for offers')}
        ${card('Offers',submittedOffers.length,'Awaiting your choice')}
        ${card('Awarded',awardedJobs.length,'Given to drivers')}
        ${card('Withdrawn',withdrawnJobs.length,'No longer available')}
      </aside>
    </section>
    ${panel('Network jobs',`<div class="exchange-job-list">${cards}</div>`,'Jobs stay open until you award or withdraw them. There is no bid-closing time.')}`;
  }

  function settingsView() {
    const fields = { trading_name:'Trading name',legal_name:'Legal company name',phone:'Telephone',whatsapp:'WhatsApp',email:'Email',website:'Website',address_line:'Business address',bank_name:'Bank name',sort_code:'Sort code',account_number:'Account number',default_terms:'Payment terms (days)' };
    const linked = state.portalAccessUsers.length ? `<div class="portal-access-list">${state.portalAccessUsers.map(u=>`<article><div><b>${esc(u.customers?.company||'Customer')}</b><small>${esc(u.email)}</small></div><span class="portal-status ${u.active?'approved':'cancelled'}">${u.active?'Active':'Disabled'}</span>${u.active?`<button class="danger" data-portal-revoke="${u.id}">Disable</button>`:''}</article>`).join('')}</div>` : '<div class="fleet-empty">No customer portal accounts linked yet.</div>';
    return panel('Business settings', `<form id="settings-form"><div class="grid two">${Object.entries(fields).map(([key,label]) => `<label>${label}<input name="${key}" value="${esc(state.settings[key] ?? '')}" ${key === 'default_terms' ? 'type="number"' : ''}></label>`).join('')}</div><div class="actions"><button class="primary">Save Settings</button></div></form><p class="saved">✓ Saved securely in Supabase.</p><hr class="portal-divider"><div class="portal-section-head"><div><h2>Customer Portal Access</h2><p>Ask the customer to create an account using their email address, then link that login here.</p></div><span>${state.portalAccessUsers.filter(u=>u.active).length} active</span></div><form id="portal-access-form"><div class="grid two"><label>Customer<select name="customer_id" required><option value="">Choose customer</option>${state.customers.map(c=>`<option value="${c.id}">${esc(c.company)}</option>`).join('')}</select></label><label>Customer login email<input name="email" type="email" required></label></div><div class="actions"><button class="primary">Enable Customer Portal</button></div></form><h3 class="linked-title">Linked customer accounts</h3>${linked}`);
  }

  function render() {
    const params = new URLSearchParams(location.search);
    const quoteToken = params.get('quote');
    if (quoteToken) { document.getElementById('app').innerHTML = publicQuoteView(state.publicQuote, state.loading, state.notice?.type === 'error' ? state.notice.text : ''); bindPublicQuote(); return; }
    if (params.get('request') === 'quote') { document.getElementById('app').innerHTML = publicRequestView(); bindPublicRequest(); return; }
    const trackToken = params.get('track');
    if (trackToken) { document.getElementById('app').innerHTML = publicTrackingView(state.publicTracking, state.loading, state.notice?.type === 'error' ? state.notice.text : ''); setTimeout(initialisePublicTrackingExtras, 0); return; }
    if (state.loading) { document.getElementById('app').innerHTML = '<div class="loading">Loading KLS SameDay Office…</div>'; return; }
    if (!state.user) { document.getElementById('app').innerHTML = authView(); bindAuth(); return; }
    if (state.portalUser) { document.getElementById('app').innerHTML = customerPortalView(); bindCustomerPortal(); return; }
    const views = { dashboard, smart: smartDispatchView, routes: routePlannerView, operations: operationsView, dispatch: dispatchView, drivers: driversManagementView, exchange: driverExchangeView, driver: driverView, tracking: liveTrackingView, fleet: fleetView, schedule: scheduleView, newquote: newQuote, quotes: quotesView, jobs: jobsView, invoices: invoicesView, accounts: accountsView, portalrequests: portalRequestsView, quoterequests: quoteRequestsView, customers: customersView, settings: settingsView };
    document.getElementById('app').innerHTML = layout(views[state.page]());
    bindApp();
    if (state.page === 'dashboard') initialiseCommandMap();
    if (state.page === 'dispatch') initialiseDispatchMap();
    if (state.page === 'tracking') initialiseTrackingCentreMap();
  }


  let commandMap = null;
  function initialiseCommandMap() {
    const mapNode = document.getElementById('command-map');
    if (!mapNode || !window.L) return;
    if (commandMap) { commandMap.remove(); commandMap = null; }
    const jobs = state.jobs.filter(j => j.last_latitude && j.last_longitude && !['Cancelled','Delivered'].includes(j.job_status));
    const empty = document.getElementById('command-map-empty');
    if (!jobs.length) { mapNode.classList.add('hidden'); empty?.classList.remove('hidden'); return; }
    mapNode.classList.remove('hidden'); empty?.classList.add('hidden');
    commandMap = L.map(mapNode,{zoomControl:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(commandMap);
    const bounds=[];
    jobs.forEach(job=>{ const lat=Number(job.last_latitude),lng=Number(job.last_longitude); if(!Number.isFinite(lat)||!Number.isFinite(lng))return; bounds.push([lat,lng]); const age=trackingAge(job); L.marker([lat,lng]).addTo(commandMap).bindPopup(`<b>${esc(job.assigned_driver_name||'Unassigned')}</b><br>${esc(job.job_number||'Job')} · ${esc(job.job_status||'')}<br><small>${esc(age.label)}</small>`); });
    if(bounds.length===1)commandMap.setView(bounds[0],13);else commandMap.fitBounds(bounds,{padding:[30,30]});
    setTimeout(()=>commandMap?.invalidateSize(),60);
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


  let trackingCentreMap = null;
  function initialiseTrackingCentreMap() {
    const mapNode = document.getElementById('tracking-centre-map');
    if (!mapNode || !window.L) return;
    if (trackingCentreMap) { trackingCentreMap.remove(); trackingCentreMap = null; }
    const jobs = state.jobs.filter(j => j.last_latitude && j.last_longitude && !['Cancelled','Delivered'].includes(j.job_status));
    const empty = document.getElementById('tracking-centre-empty');
    if (!jobs.length) { mapNode.classList.add('hidden'); empty?.classList.remove('hidden'); return; }
    mapNode.classList.remove('hidden'); empty?.classList.add('hidden');
    trackingCentreMap = L.map(mapNode);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(trackingCentreMap);
    const bounds=[];
    jobs.forEach(job=>{ const lat=Number(job.last_latitude),lng=Number(job.last_longitude); if(!Number.isFinite(lat)||!Number.isFinite(lng))return; bounds.push([lat,lng]); const age=trackingAge(job); L.marker([lat,lng]).addTo(trackingCentreMap).bindPopup(`<b>${esc(job.assigned_driver_name||'Unassigned')}</b><br>${esc(job.job_number||'Job')} · ${esc(job.job_status||'')}<br><small>${esc(age.label)}</small>`); });
    if(bounds.length===1)trackingCentreMap.setView(bounds[0],13);else trackingCentreMap.fitBounds(bounds,{padding:[35,35]});
    setTimeout(()=>trackingCentreMap?.invalidateSize(),50);
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
      const { data: portalUser, error: portalLookupError } = await db.from('customer_users').select('*, customers(*)').eq('auth_user_id', state.user.id).eq('active', true).maybeSingle();
      if (portalLookupError && portalLookupError.code !== '42P01') throw portalLookupError;
      if (portalUser) {
        state.portalUser = portalUser;
        state.portalCustomer = portalUser.customers || null;
        const [bookings, jobs, invoices, addresses, settings] = await Promise.all([
          db.from('portal_bookings').select('*').eq('customer_id', portalUser.customer_id).order('created_at',{ascending:false}),
          db.from('jobs').select('*').eq('customer_id', portalUser.customer_id).eq('customer_visible', true).order('created_at',{ascending:false}),
          db.from('invoices').select('*').eq('customer_id', portalUser.customer_id).eq('portal_visible', true).order('created_at',{ascending:false}),
          db.from('customer_addresses').select('*').eq('customer_id', portalUser.customer_id).order('label',{ascending:true}),
          db.from('business_settings').select('*').eq('user_id', portalUser.owner_id).maybeSingle()
        ]);
        for (const result of [bookings,jobs,invoices,addresses,settings]) if(result.error) throw result.error;
        state.portalBookings=bookings.data||[]; state.portalJobs=jobs.data||[]; state.portalInvoices=invoices.data||[]; state.portalAddresses=addresses.data||[]; state.settings={...defaults,...(settings.data||{})};
        state.loading=false; render(); return;
      }
      state.portalUser = null;
      const claimResult = await db.rpc('claim_public_quote_requests');
      if (claimResult?.error && !['42883', 'PGRST202'].includes(claimResult.error.code)) throw claimResult.error;

      const queries = {
        customers: db.from('customers').select('*').order('created_at', { ascending: false }),
        drivers: db.from('drivers').select('*').order('name', { ascending: true }),
        fleet: db.from('vehicles').select('*').order('created_at', { ascending: false }),
        fuelLogs: db.from('fuel_logs').select('*').order('log_date', { ascending: false }),
        maintenance: db.from('vehicle_maintenance').select('*').order('log_date', { ascending: false }),
        recurringJobs: db.from('recurring_jobs').select('*').order('next_run_date', { ascending: true }),
        quotes: db.from('quotes').select('*').order('created_at', { ascending: false }),
        jobs: db.from('jobs').select('*').order('created_at', { ascending: false }),
        invoices: db.from('invoices').select('*').order('created_at', { ascending: false }),
        expenses: db.from('expenses').select('*').order('expense_date', { ascending: false }),
        portalBookings: db.from('portal_bookings').select('*').order('created_at', { ascending: false }),
        portalAccessUsers: db.from('customer_users').select('*, customers(company)').order('created_at', { ascending: false }),
        routeStops: db.from('route_stops').select('*').order('stop_order', { ascending: true }),
        quoteRequests: db.from('public_quote_requests').select('*').order('created_at', { ascending: false }),
        driverAccounts: db.from('driver_accounts').select('*').order('created_at', { ascending: false }),
        exchangeJobs: db.from('driver_network_jobs').select('*').order('created_at', { ascending: false }),
        exchangeBids: db.from('driver_network_offer_summary').select('*').order('submitted_at', { ascending: false }),
        settings: db.from('business_settings').select('*').maybeSingle()
      };
      const queryNames = Object.keys(queries);
      const queryResults = await Promise.all(Object.values(queries));
      const loaded = Object.fromEntries(queryNames.map((name, index) => [name, queryResults[index]]));
      for (const [name, result] of Object.entries(loaded)) {
        if (!result) throw new Error(`No database response received for ${name}.`);
        if (result.error) throw new Error(`${name}: ${result.error.message}`);
      }
      const { customers, drivers, fleet, fuelLogs, maintenance, recurringJobs, quotes, jobs, invoices, expenses, portalBookings, portalAccessUsers, routeStops, quoteRequests, driverAccounts, exchangeJobs, exchangeBids, settings } = loaded;
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
      state.portalBookings = portalBookings.data || [];
      state.portalAccessUsers = portalAccessUsers.data || [];
      state.routeStops = routeStops.data || [];
      state.quoteRequests = quoteRequests.data || [];
      state.driverAccounts = driverAccounts.data || [];
      state.exchangeJobs = exchangeJobs.data || [];
      state.exchangeBids = exchangeBids.data || [];
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

  function bindPublicQuote() {
    const form=document.getElementById('public-quote-response');
    if(!form||!state.publicQuote)return;
    const respond=async response=>{ const values=Object.fromEntries(new FormData(form)); const button=form.querySelector('button.primary'); if(button){button.disabled=true;button.textContent='Saving…';} const token=new URLSearchParams(location.search).get('quote'); const {data,error}=await db.rpc('respond_public_quote',{p_token:token,p_response:response,p_customer_name:values.customer_name,p_customer_message:values.customer_message||null}); if(error){state.notice={text:error.message,type:'error'};}else{state.publicQuote=Array.isArray(data)?data[0]:data;state.notice=null;} state.loading=false;render(); };
    form.onsubmit=e=>{e.preventDefault();respond('Accepted')};
    document.querySelector('[data-public-decline]')?.addEventListener('click',()=>respond('Declined'));
  }

  function bindPublicRequest() {
    const form=document.getElementById('public-request-form'); if(!form)return;
    form.onsubmit=async e=>{e.preventDefault();const button=form.querySelector('button.primary');button.disabled=true;button.textContent='Sending…';const values=Object.fromEntries(new FormData(form));values.miles=values.miles?Number(values.miles):null;const {error}=await db.from('public_quote_requests').insert(values);if(error){button.disabled=false;button.textContent='Send quote request';alert(error.message);return;}document.querySelector('.public-quote-card').innerHTML='<div class="public-quote-brand"><b>KLS</b><span>SameDay</span></div><div class="request-success"><b>Request received</b><p>Thank you. KLS SameDay will review the delivery and contact you shortly.</p></div><footer>0330 043 5237 · info@klssameday.co.uk</footer>';};
  }

  function bindApp() {
    const networkForm = document.getElementById('network-job-form');
    if (networkForm) networkForm.onsubmit = async event => {
      event.preventDefault();
      const button = networkForm.querySelector('button.primary');
      const values = Object.fromEntries(new FormData(networkForm));
      try {
        button.disabled = true; button.textContent = 'Posting…';
        const collectionAt = values.collection_date
          ? new Date(`${values.collection_date}T${values.collection_time || '09:00'}:00`).toISOString()
          : null;
        const { error } = await db.rpc('office_create_network_job', {
          p_linked_job_id: values.linked_job_id || null,
          p_reference: null,
          p_collection_company: null,
          p_collection_address: values.collection_address,
          p_collection_postcode: values.collection_postcode || null,
          p_collection_contact_name: null,
          p_collection_contact_phone: null,
          p_delivery_company: null,
          p_delivery_address: values.delivery_address,
          p_delivery_postcode: values.delivery_postcode || null,
          p_delivery_contact_name: null,
          p_delivery_contact_phone: null,
          p_collection_at: collectionAt,
          p_vehicle_required: values.vehicle_required,
          p_goods_description: values.goods_description || null,
          p_quantity: null,
          p_weight_kg: values.weight_kg ? Number(values.weight_kg) : null,
          p_mileage: values.mileage ? Number(values.mileage) : null,
          p_notes: values.notes || null,
          p_customer_price: null,
          p_status: 'open'
        });
        if (error) throw error;
        await loadAll(); state.page='exchange';
        showNotice('Job sent to your driver network.','ok'); render();
      } catch (error) {
        button.disabled = false; button.textContent = 'Send to Driver Network';
        showNotice(error.message,'error'); render();
      }
    };

    document.querySelectorAll('[data-award-offer]').forEach(button => button.onclick = async () => {
      if (!confirm('Award this job to the selected driver?')) return;
      const { error } = await db.rpc('office_award_network_offer',{p_offer_id:button.dataset.awardOffer});
      if (error) { showNotice(error.message,'error'); render(); return; }
      await loadAll(); state.page='exchange'; showNotice('Job awarded to the driver.','ok'); render();
    });

    document.querySelectorAll('[data-withdraw-network]').forEach(button => button.onclick = async () => {
      const reason = prompt('Reason for withdrawing the job (optional):') || null;
      const { error } = await db.rpc('office_withdraw_network_job',{p_network_job_id:button.dataset.withdrawNetwork,p_reason:reason});
      if (error) { showNotice(error.message,'error'); render(); return; }
      await loadAll(); state.page='exchange'; showNotice('Network job withdrawn.','ok'); render();
    });
    document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => { state.page = button.dataset.page; render(); });
    document.getElementById('route-date')?.addEventListener('change', event => { state.routeDate = event.target.value || todayISO(); render(); });
    document.querySelectorAll('[data-route-job]').forEach(card => {
      card.addEventListener('dragstart', event => { card.classList.add('dragging'); event.dataTransfer.effectAllowed='move'; event.dataTransfer.setData('text/plain', card.dataset.routeJob); });
      card.addEventListener('dragend', () => card.classList.remove('dragging'));
    });
    document.querySelectorAll('[data-route-drop]').forEach(zone => {
      zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('drag-over'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
      zone.addEventListener('drop', async event => {
        event.preventDefault(); zone.classList.remove('drag-over');
        const jobId = event.dataTransfer.getData('text/plain');
        const driverId = zone.dataset.routeDrop || null;
        const date = state.routeDate || todayISO();
        const sameLane = state.routeStops.filter(stop => stop.route_date===date && (stop.driver_id||null)===(driverId||null) && stop.job_id!==jobId).sort((a,b)=>Number(a.stop_order)-Number(b.stop_order));
        const payload = { user_id: state.user.id, job_id: jobId, driver_id: driverId, route_date: date, stop_order: sameLane.length + 1 };
        const { data, error } = await db.from('route_stops').upsert(payload,{onConflict:'user_id,job_id,route_date'}).select().single();
        if(error){ showNotice(error.message,'error'); render(); return; }
        state.routeStops = state.routeStops.filter(stop => !(stop.job_id===jobId && stop.route_date===date)); state.routeStops.push(data);
        const job = state.jobs.find(j=>j.id===jobId); const driver = state.drivers.find(d=>d.id===driverId);
        if(job){ job.assigned_driver_id=driverId; job.assigned_driver_name=driver?.name||null; await db.from('jobs').update({assigned_driver_id:driverId,assigned_driver_name:driver?.name||null}).eq('id',jobId); }
        showNotice(driver ? `${job?.job_number||'Job'} added to ${driver.name}'s route.` : `${job?.job_number||'Job'} moved to unassigned.`,'ok'); render();
      });
    });
    document.querySelectorAll('[data-driver-open]').forEach(button => button.onclick = () => { state.selectedDriverJobId = button.dataset.driverOpen; render(); });
    document.querySelectorAll('[data-driver-filter]').forEach(button => button.onclick = () => { state.driverFilter = button.dataset.driverFilter; render(); });
    document.querySelectorAll('[data-action="driver-close"]').forEach(button => button.onclick = () => { state.selectedDriverJobId = null; render(); });
    document.querySelectorAll('[data-driver-nav]').forEach(button => button.onclick = () => { const j=state.jobs.find(x=>x.id===button.dataset.driverNav); if(!j)return; const target=button.dataset.navTarget==='collection'?j.collection_address:(button.dataset.navTarget==='delivery'?j.delivery_address:(['Booked','En Route to Collection','Arrived at Collection'].includes(j.job_status)?j.collection_address:j.delivery_address)); window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target||'')}&travelmode=driving`,'_blank','noopener'); });
    document.querySelectorAll('[data-driver-share]').forEach(button => button.onclick = async () => { const j=state.jobs.find(x=>x.id===button.dataset.driverShare); if(!j)return; const text=`${j.job_number||'KLS Job'}\nCollect: ${j.collection_address||''}\nDeliver: ${j.delivery_address||''}\nStatus: ${j.job_status||'Booked'}`; try{ if(navigator.share) await navigator.share({title:j.job_number||'KLS Job',text}); else {await navigator.clipboard.writeText(text);showNotice('Job details copied.','ok');render();} }catch(error){ if(error.name!=='AbortError'){showNotice('Unable to share job details.','error');render();} } });
    document.querySelectorAll('[data-copy-track]').forEach(button => button.onclick = async () => { const j=state.jobs.find(x=>x.id===button.dataset.copyTrack); if(!j?.tracking_token){showNotice('Run the v9 Supabase upgrade first.','error');render();return;} await navigator.clipboard.writeText(trackingUrl(j)); showNotice('Customer tracking link copied.','ok'); render(); });
    document.querySelectorAll('[data-share-track]').forEach(button => button.onclick = async () => { const j=state.jobs.find(x=>x.id===button.dataset.shareTrack); if(!j)return; const text=`${state.settings.trading_name}: Your delivery ${j.job_number || ''} is ${j.job_status || 'booked'}.${j.eta_at ? ` ETA ${new Date(j.eta_at).toLocaleString('en-GB')}.` : ''} Track here: ${trackingUrl(j)}`; if(navigator.share){await navigator.share({title:'KLS SameDay tracking',text,url:trackingUrl(j)}).catch(()=>{});}else{await navigator.clipboard.writeText(text);showNotice('Tracking message copied.','ok');render();} });
    document.querySelectorAll('[data-assign-job],[data-driver-assign]').forEach(select => select.onchange = async () => { const jobId=select.dataset.assignJob||select.dataset.driverAssign; const driver=state.drivers.find(d=>d.id===select.value); const payload={assigned_driver_id:driver?.id||null,assigned_driver_name:driver?.name||null}; const {error}=await db.from('jobs').update(payload).eq('id',jobId); if(error){showNotice(error.message,'error');render();return;} const job=state.jobs.find(j=>j.id===jobId); if(job)Object.assign(job,payload); showNotice(driver?`${job.job_number} assigned to ${driver.name}.`:`${job.job_number} unassigned.`,'ok'); render(); });
    document.querySelectorAll('[data-save-eta]').forEach(button => button.onclick = async () => { const input=document.querySelector(`[data-job-eta="${button.dataset.saveEta}"]`); const eta=input?.value ? new Date(input.value).toISOString() : null; const {error}=await db.from('jobs').update({eta_at:eta}).eq('id',button.dataset.saveEta); if(error){showNotice(error.message,'error');render();return;} const job=state.jobs.find(j=>j.id===button.dataset.saveEta); if(job)job.eta_at=eta; showNotice('Customer ETA saved.','ok'); render(); });
    document.querySelectorAll('[data-driver-availability]').forEach(select => select.onchange = async () => { const driver=state.drivers.find(d=>d.id===select.dataset.driverAvailability); if(!driver)return; const previous=driver.availability_status||'Available'; driver.availability_status=select.value; const {error}=await db.from('drivers').update({availability_status:select.value,last_seen_at:new Date().toISOString()}).eq('id',driver.id); if(error){driver.availability_status=previous;showNotice(error.message,'error');render();return;} showNotice(`${driver.name} is now ${select.value}.`,'ok');render(); });
    document.querySelector('[data-action="refresh-map"]')?.addEventListener('click', initialiseDispatchMap);
    document.querySelector('[data-action="refresh-tracking"]')?.addEventListener('click', async()=>{ await loadAll(); state.page='tracking'; render(); });
    document.querySelectorAll('[data-driver-status]').forEach(button => button.onclick = async () => { const job=state.jobs.find(j=>j.id===button.dataset.driverStatus); if(!job)return; const previous=job.job_status; const nextStatus=button.dataset.status; job.job_status=nextStatus; render(); const payload={job_status:nextStatus}; const now=new Date().toISOString(); if(nextStatus==='En Route to Collection') payload.started_at=now; if(nextStatus==='Collected') payload.collected_at=now; if(nextStatus==='Delivered') payload.delivered_at=now; const {error}=await db.from('jobs').update(payload).eq('id',job.id); if(error){job.job_status=previous;showNotice(error.message,'error');render();return;} Object.assign(job,payload); if(nextStatus==='En Route to Collection') startLocationTracking(job.id); else {showNotice(`${job.job_number||'Job'} updated to ${nextStatus}.`,'ok');render();} });
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
    document.getElementById('dispatch-search')?.addEventListener('input', event => { state.dispatchSearch = event.target.value; render(); });
    document.getElementById('dispatch-driver-filter')?.addEventListener('change', event => { state.dispatchDriverFilter = event.target.value; render(); });
    document.querySelector('[data-action="refresh-dispatch"]')?.addEventListener('click', async () => { await loadAll(); state.page='dispatch'; render(); });
    document.querySelector('[data-action="menu-open"]')?.addEventListener('click', () => document.getElementById('side').classList.add('open'));
    document.querySelector('[data-action="menu-close"]')?.addEventListener('click', () => document.getElementById('side').classList.remove('open'));
    document.querySelector('[data-action="notice-close"]')?.addEventListener('click', () => { state.notice = null; render(); });
    document.querySelector('[data-action="signout"]')?.addEventListener('click', async () => { await db.auth.signOut(); state.user = null; state.customers=[]; state.drivers=[]; state.fleet=[]; state.fuelLogs=[]; state.maintenance=[]; state.recurringJobs=[]; state.quotes=[]; state.jobs=[]; state.invoices=[]; state.expenses=[]; render(); });

    const driverForm = document.getElementById('driver-form');
    if(driverForm) driverForm.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(driverForm));const loginEmail=String(values.login_email||'').trim().toLowerCase();delete values.login_email;values.user_id=state.user.id;values.active=true;values.availability_status='Available';values.last_seen_at=new Date().toISOString();try{const{data,error}=await db.from('drivers').insert(values).select().single();if(error)throw error;const{data:account,error:accountError}=await db.from('driver_accounts').insert({owner_id:state.user.id,driver_id:data.id,email:loginEmail,active:true}).select().single();if(accountError){await db.from('drivers').delete().eq('id',data.id);throw accountError;}state.drivers.push(data);state.driverAccounts.unshift(account);showNotice(`${data.name} added. Driver login: ${loginEmail}`,'ok');render();}catch(error){showNotice(error.message,'error');render();}};
    const driverLinkForm = document.getElementById('driver-link-form');
    if(driverLinkForm) driverLinkForm.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(driverLinkForm));try{const email=String(values.email||'').trim().toLowerCase();const{data,error}=await db.from('driver_accounts').insert({owner_id:state.user.id,driver_id:values.driver_id,email,active:true}).select().single();if(error)throw error;state.driverAccounts.unshift(data);const driver=state.drivers.find(d=>d.id===values.driver_id);showNotice(`${driver?.name||'Driver'} linked to ${email}.`,'ok');render();}catch(error){showNotice(error.message,'error');render();}};


    document.querySelectorAll('[data-link-driver]').forEach(button => button.onclick = () => {
      const select = document.querySelector('#driver-link-form select[name="driver_id"]');
      const email = document.querySelector('#driver-link-form input[name="email"]');
      if (select) select.value = button.dataset.linkDriver;
      if (email) email.focus();
    });
    document.querySelectorAll('[data-delete-driver]').forEach(button => button.onclick = async () => {
      const driver = state.drivers.find(d => d.id === button.dataset.deleteDriver);
      if (!driver || !confirm(`Delete ${driver.name}? This will also remove the Driver App link.`)) return;
      try {
        const {error: accountError} = await db.from('driver_accounts').delete().eq('driver_id', driver.id);
        if (accountError) throw accountError;
        const {error} = await db.from('drivers').delete().eq('id', driver.id);
        if (error) throw error;
        state.driverAccounts = state.driverAccounts.filter(a => a.driver_id !== driver.id);
        state.drivers = state.drivers.filter(d => d.id !== driver.id);
        showNotice(`${driver.name} deleted.`, 'ok'); render();
      } catch(error) { showNotice(error.message, 'error'); render(); }
    });

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
          if(state.pendingRequest){await db.from('public_quote_requests').update({status:'Converted'}).eq('id',state.pendingRequest.id);state.pendingRequest=null;}
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

    document.querySelectorAll('[data-publish-quote]').forEach(button=>button.onclick=async()=>{
      const quote=state.quotes.find(q=>q.id===button.dataset.publishQuote); if(!quote)return;
      if(!quote.public_token){const expiry=new Date(Date.now()+30*86400000).toISOString();const {data,error}=await db.from('quotes').update({public_token:crypto.randomUUID(),public_expires_at:expiry,customer_response:'Awaiting reply'}).eq('id',quote.id).select().single();if(error)return showNotice(error.message,'error'),render();Object.assign(quote,data);}
      const url=quotePublicUrl(quote);try{await navigator.clipboard.writeText(url);showNotice('Secure quotation link copied.','ok');}catch(_e){prompt('Copy this quotation link:',url);}render();
    });
    document.querySelectorAll('[data-copy-request-link]').forEach(button=>button.onclick=async()=>{const url=`${location.origin}${location.pathname}?request=quote`;try{await navigator.clipboard.writeText(url);showNotice('Public quote request link copied.','ok');}catch(_e){prompt('Copy this request link:',url);}render();});
    document.querySelectorAll('[data-request-convert]').forEach(button=>button.onclick=async()=>{const r=state.quoteRequests.find(x=>x.id===button.dataset.requestConvert);if(!r)return;state.quoteCustomerId=null;state.page='newquote';state.pendingRequest=r;render();setTimeout(()=>{const f=document.getElementById('quote-form');if(!f)return;['company','contact_name','email','phone','collection_date','collection_time','collection_address','delivery_address','vehicle','miles','goods_description'].forEach(k=>{if(f[k]&&r[k]!=null)f[k].value=r[k];});},0);});
    document.querySelectorAll('[data-request-reject]').forEach(button=>button.onclick=async()=>{const {error}=await db.from('public_quote_requests').update({status:'Rejected'}).eq('id',button.dataset.requestReject);if(error)return showNotice(error.message,'error'),render();const r=state.quoteRequests.find(x=>x.id===button.dataset.requestReject);if(r)r.status='Rejected';showNotice('Request rejected.','ok');render();});

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


    document.querySelectorAll('[data-portal-approve]').forEach(button=>button.addEventListener('click',async()=>{
      const request=state.portalBookings.find(b=>b.id===button.dataset.portalApprove); if(!request)return;
      const customer=state.customers.find(c=>c.id===request.customer_id);
      try{
        const payload={user_id:state.user.id,customer_id:request.customer_id,customer_name:customer?.company||'Customer',contact_name:customer?.contact_name||customer?.company||'Customer',customer_email:customer?.email||null,collection_date:request.collection_date,collection_time:request.collection_time||null,collection_address:request.collection_address,delivery_address:request.delivery_address,vehicle:request.vehicle||'Luton Tail Lift',total_price:0,base_price:0,extras:0,costs:0,job_status:'Booked',quote_status:'Portal Booking',invoice_status:'Not Invoiced',booking_notes:[request.load_description,request.special_instructions].filter(Boolean).join(' — ')||null,customer_visible:true};
        const {data:job,error:jobError}=await db.from('jobs').insert(payload).select().single(); if(jobError)throw jobError;
        const {error}=await db.from('portal_bookings').update({status:'Converted',office_notes:`Created ${job.job_number||'job'}`}).eq('id',request.id); if(error)throw error;
        request.status='Converted'; state.jobs.unshift(job); showNotice(`${job.job_number||'Job'} created from portal request.`,'ok'); render();
      }catch(error){showNotice(error.message,'error');render();}
    }));
    document.querySelectorAll('[data-portal-reject]').forEach(button=>button.addEventListener('click',async()=>{
      const request=state.portalBookings.find(b=>b.id===button.dataset.portalReject); if(!request)return;
      const {error}=await db.from('portal_bookings').update({status:'Rejected'}).eq('id',request.id); if(error)showNotice(error.message,'error'); else {request.status='Rejected';showNotice('Portal request rejected.','ok');} render();
    }));

    const portalAccessForm = document.getElementById('portal-access-form');
    if (portalAccessForm) portalAccessForm.onsubmit = async e => {
      e.preventDefault();
      try {
        const form=Object.fromEntries(new FormData(portalAccessForm));
        const {data,error}=await db.rpc('link_customer_portal',{p_customer_id:form.customer_id,p_email:form.email});
        if(error)throw error;
        const {data:links}=await db.from('customer_users').select('*, customers(company)').order('created_at',{ascending:false}); state.portalAccessUsers=links||[]; showNotice(data || 'Customer portal access enabled.','ok'); render();
      } catch(error){showNotice(error.message,'error');render();}
    };

    document.querySelectorAll('[data-portal-revoke]').forEach(button=>button.addEventListener('click',async()=>{
      if(!confirm('Disable this customer portal login?'))return;
      const {error}=await db.from('customer_users').update({active:false}).eq('id',button.dataset.portalRevoke);
      if(error)showNotice(error.message,'error'); else {const item=state.portalAccessUsers.find(u=>u.id===button.dataset.portalRevoke);if(item)item.active=false;showNotice('Customer portal access disabled.','ok');}
      render();
    }));

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


  function initialisePublicTrackingExtras() {
    const node=document.getElementById('public-track-map');
    if(node && window.L){ const lat=Number(node.dataset.lat),lng=Number(node.dataset.lng); if(Number.isFinite(lat)&&Number.isFinite(lng)){ const map=L.map(node,{zoomControl:false,attributionControl:true}).setView([lat,lng],13); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap'}).addTo(map); L.marker([lat,lng]).addTo(map).bindPopup('Latest driver location').openPopup(); setTimeout(()=>map.invalidateSize(),50); } }
    const countdown=document.querySelector('[data-eta]');
    if(countdown){ const update=()=>{ const ms=new Date(countdown.dataset.eta).getTime()-Date.now(); if(ms<=0){countdown.textContent='Estimated arrival time has passed — check the latest status above.';return;} const mins=Math.ceil(ms/60000); const h=Math.floor(mins/60),m=mins%60; countdown.textContent=`Estimated arrival in ${h?`${h} hr `:''}${m} min`; }; update(); setTimeout(update,60000); }
  }

  function startOfficeRealtime() {
    if (!db || !state.user || state.portalUser) return;
    if (officeRealtimeChannel) db.removeChannel(officeRealtimeChannel);
    const queueRefresh = () => {
      clearTimeout(realtimeRefreshTimer);
      realtimeRefreshTimer = setTimeout(async () => {
        const currentPage = state.page;
        try { await loadAll(); state.page = currentPage; render(); } catch (_error) {}
      }, 450);
    };
    officeRealtimeChannel = db.channel(`kls-office-${state.user.id}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'jobs',filter:`user_id=eq.${state.user.id}`},queueRefresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'drivers',filter:`user_id=eq.${state.user.id}`},queueRefresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'driver_network_jobs',filter:`user_id=eq.${state.user.id}`},queueRefresh)
      .on('postgres_changes',{event:'*',schema:'public',table:'driver_network_offers',filter:`user_id=eq.${state.user.id}`},queueRefresh)
      .subscribe();
  }

  async function initialise() {
    const params = new URLSearchParams(location.search);
    const quoteToken = params.get('quote');
    if (quoteToken) {
      state.loading = true; render();
      if (!configured) { state.loading = false; state.notice = {text:'Quotation service is not configured.',type:'error'}; render(); return; }
      const { data, error } = await db.rpc('get_public_quote', { p_token: quoteToken });
      state.publicQuote = Array.isArray(data) ? data[0] : data;
      state.notice = error ? {text:error.message,type:'error'} : null;
      state.loading = false; render(); return;
    }
    if (params.get('request') === 'quote') { state.loading = false; render(); return; }
    const trackToken = params.get('track');
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
