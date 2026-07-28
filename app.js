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
    customerContacts: [],
    customerFollowups: [],
    drivers: [],
    fleet: [],
    fuelLogs: [],
    maintenance: [],
    recurringJobs: [],
    scheduleMonth: new Date().toISOString().slice(0,7),
    quotes: [],
    jobs: [],
    archivedJobs: [],
    invoices: [],
    expenses: [],
    portalUser: null,
    portalCustomer: null,
    portalBookings: [],
    portalJobs: [],
    portalInvoices: [],
    portalQuotes: [],
    portalMessages: [],
    portalAddresses: [],
    portalFavouriteRoutes: JSON.parse(localStorage.getItem('kls_portal_routes') || '[]'),
    portalAccessUsers: [],
    settings: { ...defaults },
    notice: null,
    loading: true,
    jobEditorId: null,
    jobSearch: '',
    jobArchiveMode: false,
    authMode: 'signin',
    selectedCustomerId: null,
    quoteCustomerId: null,
    selectedDriverJobId: null,
    selectedDispatchJobId: null,
    selectedDriverId: null,
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
    dispatchDriverFilter: 'all',
    dispatchPriorityFilter: 'all',
    dispatchDateFilter: 'all',
    dispatchSelectedJobs: [],
    invoiceSearch: '',
    invoiceFilter: 'all',
    reportPeriod: new Date().toISOString().slice(0,7),
    leads: JSON.parse(localStorage.getItem('kls_sales_leads') || '[]'),
    leadFilter: 'all',
    leadSearch: '',
    fleetDefects: JSON.parse(localStorage.getItem('kls_fleet_defects') || '[]'),
    fleetTab: 'overview',
    communications: JSON.parse(localStorage.getItem('kls_communications') || '[]'),
    communicationTemplates: JSON.parse(localStorage.getItem('kls_communication_templates') || 'null') || [],
    communicationTab: 'overview',
    communicationSearch: '',
    financeTab: 'overview',
    financeForecastDays: 30,
    biMonths: 6,
    profitSettings: JSON.parse(localStorage.getItem('kls_profit_settings') || 'null') || { fuelPrice: 1.48, mpg: 28, wearPerMile: 0.22, hourlyCost: 18, fixedJobCost: 12, targetMargin: 30 }
  };

  if (!localStorage.getItem('kls_profit_mpg_28_migrated')) {
    if (Number(state.profitSettings.mpg) === 25) {
      state.profitSettings = { ...state.profitSettings, mpg: 28 };
      localStorage.setItem('kls_profit_settings', JSON.stringify(state.profitSettings));
    }
    localStorage.setItem('kls_profit_mpg_28_migrated', '1');
  }

  const companyRegistration = {
    number: '16165066',
    registeredOffice: '171 Slade Road, Clacton-On-Sea, England, CO15 5EG'
  };

  function allJobRecords() {
    return [...state.jobs, ...state.archivedJobs];
  }

  function podRecipient(job) {
    return job?.recipient_name || job?.pod_recipient_name || job?.delivered_to || '';
  }

  function hasCompletePod(job) {
    return Boolean(podRecipient(job) && job?.pod_photo_url && job?.pod_signature_url);
  }

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
      <div class="authswitch">${signUp ? 'Already registered?' : 'First time using the system?'} <button data-auth-mode="${signUp ? 'signin' : 'signup'}">${signUp ? 'Sign in' : 'Create account'}</button></div>${!signUp ? '<div class="authswitch"><button data-password-reset>Forgot password?</button></div>' : ''}
    </section></div>`;
  }

  const navGroups = [
    ['Core', [
      ['dashboard','Dashboard'],
      ['aiassistant','AI Dispatch Assistant'],
      ['operations','Today’s Planner'],
      ['dispatch','Live Dispatch'],
      ['jobs','Jobs']
    ]],
    ['Sales & Customers', [
      ['newquote','New Quote'],
      ['quotes','Quotes'],
      ['quoterequests','Online Requests'],
      ['pipeline','Sales Pipeline'],
      ['customers','Customers'],
      ['portalrequests','Customer Portal'],
      ['communications','Communications']
    ]],
    ['Drivers & Tracking', [
      ['drivers','Driver Control'],
      ['fleetcentre','Driver & Fleet Centre'],
      ['tracking','Live Tracking'],
      ['exchange','Driver Exchange'],
      ['routes','Route Planner'],
      ['schedule','Booking Calendar']
    ]],
    ['Finance', [
      ['invoices','Invoices'],
      ['documents','Delivery Documents'],
      ['accounts','Finance Centre'],
      ['businessintel','BI Dashboard'],
      ['profitcentre','Job Profit Control'],
      ['reports','Business Reports']
    ]],
    ['System', [
      ['settings','Settings']
    ]]
  ];

  const pageTitles = {
    dashboard:'Dashboard', aiassistant:'AI Dispatch Assistant', smart:'Smart Dispatch', routes:'Route Planner', operations:'Today’s Planner',
    dispatch:'Live Dispatch', drivers:'Driver Control', exchange:'Driver Exchange', driver:'Driver App', tracking:'Live Tracking',
    fleet:'Fleet Management', fleetcentre:'Driver & Fleet Centre', schedule:'Booking Calendar', portalrequests:'Customer Portal',
    quoterequests:'Online Requests', pipeline:'Sales Pipeline', newquote:'New Quote', quotes:'Quotes', jobs:'Jobs',
    invoices:'Invoices', documents:'Delivery Documents', accounts:'Finance Centre', businessintel:'Business Intelligence Dashboard', profitcentre:'Job Profit Control', reports:'Business Reports', customers:'Customers', communications:'Automated Communications', settings:'Settings'
  };

  const navIcons = {
    dashboard:'⌂', aiassistant:'✦', operations:'◷', dispatch:'⇄', jobs:'▤', newquote:'＋', quotes:'◫',
    quoterequests:'↧', pipeline:'◆', customers:'◎', portalrequests:'◉', drivers:'♙', fleetcentre:'▣', driver:'♙', tracking:'⌖',
    exchange:'⇆', routes:'◇', schedule:'□', invoices:'£', documents:'▧', accounts:'◌', businessintel:'◈', profitcentre:'%', reports:'▥', communications:'✉', settings:'⚙'
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
    const historicalJobs = allJobRecords();
    const now = Date.now();
    const startOfWeek = new Date();
    startOfWeek.setHours(0,0,0,0);
    startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const activeJobs = state.jobs.filter(j => !['Delivered','Cancelled'].includes(j.job_status));
    const todayJobs = historicalJobs.filter(j => j.job_status !== 'Cancelled' && String(j.collection_date || '').slice(0,10) === today);
    const completedJobs = historicalJobs.filter(j => j.job_status === 'Delivered');
    const liveJobs = activeJobs.filter(j => j.last_latitude && j.last_longitude);
    const availableDrivers = state.drivers.filter(d => String(d.status || d.availability_status || '').toLowerCase() === 'available');
    const onJobDrivers = state.drivers.filter(d => ['on job','on_job','busy','assigned'].includes(String(d.status || d.availability_status || '').toLowerCase()));
    const offlineDrivers = state.drivers.filter(d => ['offline','inactive'].includes(String(d.status || d.availability_status || '').toLowerCase()));
    const unpaid = state.invoices.filter(inv => !['Paid','Cancelled'].includes(inv.status));
    const overdue = unpaid.filter(inv => inv.due_date && String(inv.due_date).slice(0,10) < today);
    const pendingQuotes = state.quotes.filter(q => q.status === 'Pending');
    const pendingPortal = state.portalBookings.filter(b => b.status === 'Pending');
    const todayRevenue = todayJobs.reduce((sum,j)=>sum+Number(j.total_price||0),0);
    const weekJobs = historicalJobs.filter(j => j.job_status !== 'Cancelled' && new Date(j.collection_date || j.created_at || 0) >= startOfWeek);
    const monthJobs = historicalJobs.filter(j => j.job_status !== 'Cancelled' && new Date(j.collection_date || j.created_at || 0) >= startOfMonth);
    const weekRevenue = weekJobs.reduce((sum,j)=>sum+Number(j.total_price||0),0);
    const monthRevenue = monthJobs.reduce((sum,j)=>sum+Number(j.total_price||0),0);
    const averageJob = historicalJobs.filter(j=>j.job_status!=='Cancelled').length ? historicalJobs.filter(j=>j.job_status!=='Cancelled').reduce((s,j)=>s+Number(j.total_price||0),0) / historicalJobs.filter(j=>j.job_status!=='Cancelled').length : 0;
    const deliveredTodayCount = completedJobs.filter(j=>String(j.collection_date||j.updated_at||'').slice(0,10)===today).length;
    const completionRate = todayJobs.length ? Math.round((deliveredTodayCount / todayJobs.length) * 100) : 0;
    const driverUtilisation = state.drivers.length ? Math.round((onJobDrivers.length / state.drivers.length) * 100) : 0;
    const nextCollection = todayJobs.filter(j=>j.collection_time && !['Collected','In Transit','Delivered','Cancelled'].includes(j.job_status)).sort((a,b)=>String(a.collection_time).localeCompare(String(b.collection_time)))[0];

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
      const current = activeJobs.find(j => String(j.assigned_driver_id||'') === String(d.id||'') || (j.assigned_driver_name && j.assigned_driver_name === (d.name||d.full_name)));
      return `<button class="command-driver" data-page="tracking"><i class="${String(status).toLowerCase().replace(/\s+/g,'-')}"></i><span><b>${esc(d.name||d.full_name||'Driver')}</b><small>${esc(current ? `${current.job_number||'Job'} · ${current.job_status||'Active'}` : vehicle)}</small></span><strong>${esc(status)}</strong></button>`;
    }).join('') || '<div class="command-empty">No drivers added yet.</div>';

    const activity = historicalJobs.map(j=>({
      time:new Date(j.updated_at || j.created_at || j.collection_date || 0),
      icon:j.job_status==='Delivered'?'✓':j.job_status==='In Transit'?'→':j.job_status==='Collected'?'□':j.assigned_driver_name?'♙':'＋',
      title:`${j.job_number||'Job'} · ${j.job_status||'Booked'}`,
      text:j.job_status==='Delivered' ? `POD completed${podRecipient(j) ? ` for ${podRecipient(j)}` : ''}` : (j.assigned_driver_name ? `${j.assigned_driver_name} · ${j.customer_name||j.contact_name||'Customer'}` : `${j.customer_name||j.contact_name||'Customer'} · awaiting driver`),
      page:'jobs'
    })).filter(a=>Number.isFinite(a.time.getTime())).sort((a,b)=>b.time-a.time).slice(0,8);

    const lastSeven = Array.from({length:7},(_,i)=>{ const d=new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate()-(6-i)); const iso=d.toISOString().slice(0,10); const jobs=historicalJobs.filter(j=>j.job_status!=='Cancelled' && String(j.collection_date||'').slice(0,10)===iso); return {label:d.toLocaleDateString('en-GB',{weekday:'short'}), jobs:jobs.length, revenue:jobs.reduce((s,j)=>s+Number(j.total_price||0),0)}; });
    const maxJobs = Math.max(1,...lastSeven.map(d=>d.jobs));
    const maxRevenue = Math.max(1,...lastSeven.map(d=>d.revenue));
    const jobsChart = lastSeven.map(d=>`<div class="ops-bar-item"><span style="height:${Math.max(5,(d.jobs/maxJobs)*100)}%" title="${d.jobs} jobs"></span><b>${d.jobs}</b><small>${d.label}</small></div>`).join('');
    const revenueChart = lastSeven.map(d=>`<div class="ops-bar-item"><span style="height:${Math.max(5,(d.revenue/maxRevenue)*100)}%" title="${money(d.revenue)}"></span><b>${d.revenue ? money(d.revenue).replace('.00','') : '£0'}</b><small>${d.label}</small></div>`).join('');

    return `<section class="command-hero command-hero-v29"><div><small>OPERATIONS COMMAND CENTRE</small><h2>Good ${new Date().getHours()<12?'morning':new Date().getHours()<18?'afternoon':'evening'}, KLS</h2><p>${new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'})} · Your live business position at a glance.</p></div><div class="command-hero-actions"><div class="command-live-clock"><span class="pulse-dot"></span><div><small>LIVE SYSTEM</small><b id="command-clock">${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</b></div></div><button class="secondary" data-action="refresh-dispatch">↻ Refresh</button><button class="primary" data-page="newquote">＋ New Job</button></div></section>
      <section class="command-pulse"><div><small>NEXT COLLECTION</small><b>${nextCollection ? `${String(nextCollection.collection_time).slice(0,5)} · ${esc(nextCollection.customer_name||nextCollection.contact_name||'Customer')}` : 'No collection due'}</b><span>${nextCollection ? esc(nextCollection.collection_address||'Address not set') : 'Your schedule is currently clear'}</span></div><div><small>COMPLETION RATE</small><b>${completionRate}%</b><span>${deliveredTodayCount} of ${todayJobs.length} jobs delivered</span></div><div><small>DRIVER UTILISATION</small><b>${driverUtilisation}%</b><span>${onJobDrivers.length} of ${state.drivers.length} drivers active</span></div><div><small>SYSTEM POSITION</small><b>${alerts.length ? `${alerts.length} alert${alerts.length===1?'':'s'}` : 'All clear'}</b><span>${alerts.length ? 'Review attention items' : 'Operations running normally'}</span></div></section>
      <section class="command-kpis ops-kpis">${card('Jobs today',todayJobs.length,`${activeJobs.length} currently active`,'jobs')}${card('In progress',activeJobs.length,`${unassigned.length} unassigned`,'dispatch')}${card('Completed',completedJobs.length,`${deliveredTodayCount} today`,'jobs')}${card('Active drivers',onJobDrivers.length,`${availableDrivers.length} available`,'drivers')}${card('Today’s revenue',money(todayRevenue),`${todayJobs.length} scheduled`,'jobs')}${card('Needs attention',alerts.length,alerts.length?'Action required':'All clear','dashboard')}</section>
      <section class="ops-finance-strip"><div><small>TODAY</small><b>${money(todayRevenue)}</b></div><div><small>THIS WEEK</small><b>${money(weekRevenue)}</b></div><div><small>THIS MONTH</small><b>${money(monthRevenue)}</b></div><div><small>AVERAGE JOB</small><b>${money(averageJob)}</b></div><button data-page="accounts">Open accounts →</button></section>
      <section class="command-layout"><div class="command-main">
        <section class="command-map-panel"><header><div><small>LIVE FLEET</small><h2>Driver map</h2></div><button class="secondary" data-page="tracking">Full tracking</button></header><div id="command-map" class="command-map"></div><div id="command-map-empty" class="command-map-empty hidden"><b>No live GPS positions</b><span>Drivers appear here when location tracking starts.</span></div></section>
        <section class="command-board-panel"><header><div><small>LIVE OPERATIONS</small><h2>Dispatch snapshot</h2></div><button class="secondary" data-page="dispatch">Open full board</button></header><div class="command-board">${board}</div></section>
        <section class="ops-chart-grid"><section class="ops-chart-panel"><header><div><small>LAST 7 DAYS</small><h2>Jobs completed</h2></div></header><div class="ops-bar-chart">${jobsChart}</div></section><section class="ops-chart-panel"><header><div><small>LAST 7 DAYS</small><h2>Booked revenue</h2></div></header><div class="ops-bar-chart revenue">${revenueChart}</div></section></section>
      </div><aside class="command-side">
        <section class="command-panel"><header><div><small>ATTENTION</small><h2>Smart alerts</h2></div><b>${alerts.length}</b></header><div class="command-alerts">${alerts.slice(0,7).map(a=>`<button class="${a.level}" data-page="${a.page}"><span></span><div><b>${esc(a.title)}</b><small>${esc(a.text)}</small></div>→</button>`).join('') || '<div class="command-all-clear"><b>✓ All clear</b><span>Nothing urgent needs your attention.</span></div>'}</div></section>
        <section class="command-panel"><header><div><small>FLEET STATUS</small><h2>Drivers</h2></div><button data-page="drivers">Driver control</button></header><div class="command-drivers">${driverRows}</div><footer><span>${availableDrivers.length} available</span><span>${onJobDrivers.length} on jobs</span><span>${offlineDrivers.length} offline</span></footer></section>
        <section class="command-panel ops-activity"><header><div><small>RECENT ACTIVITY</small><h2>Live updates</h2></div><button data-page="jobs">All jobs</button></header><div>${activity.map(a=>`<button data-page="${a.page}"><span>${a.icon}</span><div><b>${esc(a.title)}</b><small>${esc(a.text)}</small></div><time>${a.time.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</time></button>`).join('') || '<div class="command-empty">No recent activity yet.</div>'}</div></section>
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
    const repeat = state.repeatJobDraft || {};
    return panel('Smart Quote Builder', `<form id="quote-form">
      <div class="quote-builder-head"><div><small>KLS PRICING ENGINE</small><h3>Build a consistent quote in seconds</h3><p>Enter the route mileage, choose a vehicle and add any extras. The total updates instantly.</p></div><div class="rate-pill">Minimum or mileage rate — whichever is higher</div></div>
      <div class="grid"><label>Customer / company *<input name="company" required value="${esc(selected.company || '')}"></label><label>Contact name<input name="contact_name" value="${esc(selected.contact_name || '')}"></label><label>Telephone / WhatsApp<input name="phone" value="${esc(selected.phone || '')}"></label></div>
      <div class="grid"><label>Email<input name="email" type="email" value="${esc(selected.email || '')}"></label><label>Collection date<input name="collection_date" type="date" value="${todayISO()}"></label><label>Collection time<input name="collection_time" type="time"></label></div>
      <div class="grid two"><label>Collection address / postcode *<textarea name="collection_address" required>${esc(repeat.collection_address || '')}</textarea></label><label>Main delivery address / postcode *<textarea name="delivery_address" required>${esc(repeat.delivery_address || '')}</textarea></label></div><label>Additional delivery stops (one per line)<textarea name="route_stops" placeholder="Drop 2 address\nDrop 3 address\nDrop 4 address"></textarea><em>These are saved to the quote and job as a multi-drop route.</em></label>
      <div class="route-tools"><button type="button" class="secondary" data-action="open-route">Open route in Google Maps</button><span>Use the route mileage shown by Google Maps, then enter it below.</span></div>
      <div class="grid"><label>Vehicle<select name="vehicle">${Object.keys(vehicles).map(v => `<option ${repeat.vehicle===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Distance (miles)<input name="miles" type="number" min="0" step="0.1" value="0"></label><label>Base delivery charge<input name="base_charge" type="number" readonly></label></div>
      <div class="extras-box"><div class="extras-title"><div><small>OPTIONAL EXTRAS</small><h3>Add only what applies</h3></div><button type="button" class="secondary" data-action="clear-extras">Clear extras</button></div>
        <div class="extras-grid">
          <label>Waiting after free 30 mins (hours)<input name="waiting_hours" type="number" min="0" step="0.25" value="0"><em>£60 per hour</em></label>
          <label>Loading assistance<select name="loading_ends"><option value="0">None</option><option value="1">One end — £20</option><option value="2">Both ends — £40</option></select></label>
          <label>Extra drops<input name="extra_drops" type="number" min="0" step="1" value="0"><em>£25 each</em></label>
          <label>Manual charges<input name="manual_extras" type="number" min="0" step="0.01" value="0"><em>Tolls, ULEZ, congestion, ferry</em></label>
          <label>Surcharge<select name="surcharge"><option value="0">None</option><option value="0.25">Night +25%</option><option value="0.30">Saturday +30%</option><option value="0.50">Sunday / Bank Holiday +50%</option></select></label>
        </div>
      </div>
      <div class="quote-total-card"><div><small>SUGGESTED TOTAL</small><strong id="suggestion">£85.00</strong><span id="price-breakdown">Small Van minimum charge</span></div><label>Your final quoted price<input name="quoted_price" type="number" min="0" step="0.01" value="${esc(repeat.quoted_price || '')}"></label></div>
      <label>Goods description<input name="goods_description" value="${esc(repeat.goods_description || '')}"></label><label>Notes<textarea name="notes"></textarea></label>
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
    return table(['Job','Customer','Route','Vehicle','Price','Status','Assigned driver','Actions'], rows.map(j => [
      `<button type="button" class="job-open-link" data-open-job="${j.id}">${esc(j.job_number || 'Pending')}</button>`,
      esc(j.customer_name || j.contact_name || ''), `${esc(j.collection_address)}<br><i>→ ${esc(j.delivery_address)}</i>`, esc(j.vehicle), money(j.total_price),
      `<select data-job-status="${j.id}">${['Booked','En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery','Delivered','Cancelled'].map(s => `<option ${j.job_status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>`,
      `<select class="job-driver-select" data-job-driver="${j.id}"><option value="">Unassigned</option>${state.drivers.map(d=>`<option value="${d.id}" ${j.assigned_driver_id===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select>`,
      `<div class="job-row-actions"><button type="button" class="primary" data-open-job="${j.id}">Open</button><button data-invoice="${j.id}" ${j.job_status !== 'Delivered' ? 'disabled' : ''}>Invoice</button></div>`
    ]));
  }

  function jobStatusGroup(status) {
    if (status === 'Delivered') return 'delivered';
    if (status === 'Cancelled') return 'cancelled';
    if (['En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery'].includes(status)) return 'active';
    return 'waiting';
  }

  function jobBoardCard(job) {
    const driver = state.drivers.find(d => d.id === job.assigned_driver_id);
    const podReady = Boolean(job.pod_photo_url || job.pod_signature_url || job.recipient_name);
    return `<article class="jobs-board-card status-${jobStatusGroup(job.job_status)}" data-job-card="${job.id}">
      <button type="button" class="jobs-card-open" data-open-job="${job.id}" aria-label="Open ${esc(job.job_number || 'job')}"></button>
      <div class="jobs-card-top"><strong>${esc(job.job_number || 'Pending')}</strong><span class="jobs-status-pill">${esc(job.job_status || 'Booked')}</span></div>
      <h3>${esc(job.customer_name || job.contact_name || 'Customer')}</h3>
      <div class="jobs-board-route"><p><small>COLLECT</small>${esc(job.collection_address || 'Address TBC')}</p><span>↓</span><p><small>DELIVER</small>${esc(job.delivery_address || 'Address TBC')}</p></div>
      <div class="jobs-card-meta"><span>${esc(job.vehicle || 'Vehicle TBC')}</span><span>${fmtDate(job.collection_date)} ${esc(String(job.collection_time || '').slice(0,5))}</span></div>
      <label class="jobs-driver-control">Assigned driver<select class="job-driver-select" data-job-driver="${job.id}"><option value="">Unassigned</option>${state.drivers.map(d=>`<option value="${d.id}" ${job.assigned_driver_id===d.id?'selected':''}>${esc(d.name)}</option>`).join('')}</select></label>
      <footer><span>${driver ? esc(driver.name) : 'Needs driver'}</span><b>${money(job.total_price)}</b>${podReady ? '<em>POD ✓</em>' : ''}</footer>
    </article>`;
  }

  function jobWorkflow(job) {
    const quote = state.quotes.find(item => item.job_id === job.id || (job.quote_id && item.id === job.quote_id));
    const invoice = state.invoices.find(item => item.job_id === job.id);
    const paid = invoice && invoiceBalance(invoice) <= 0;
    return [
      {label:'Quoted', done:Boolean(quote || job.quote_status), date:quote?.created_at || job.created_at},
      {label:'Booked', done:true, date:job.created_at || job.collection_date},
      {label:'Assigned', done:Boolean(job.assigned_driver_id), date:job.assigned_at || job.updated_at},
      {label:'Collected', done:Boolean(job.collected_at || ['Collected','In Transit','Arrived at Delivery','Delivered'].includes(job.job_status)), date:job.collected_at},
      {label:'Delivered', done:Boolean(job.delivered_at || job.job_status === 'Delivered'), date:job.delivered_at},
      {label:'Invoiced', done:Boolean(invoice || job.invoice_status === 'Invoiced'), date:invoice?.issue_date || job.invoice_date},
      {label:'Paid', done:Boolean(paid), date:paid ? (invoice.paid_date || invoice.updated_at) : null}
    ];
  }

  function jobNavigationUrl(address) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address || '')}`;
  }

  function jobCustomer(job) {
    return state.customers.find(customer => customer.id === job.customer_id) || {};
  }

  function jobEditorModal() {
    const job = state.jobs.find(j => j.id === state.jobEditorId);
    if (!job) return '';
    const driver = state.drivers.find(d => d.id === job.assigned_driver_id);
    const customer = jobCustomer(job);
    const workflow = jobWorkflow(job);
    const invoice = state.invoices.find(item => item.job_id === job.id);
    const pod = job.pod_photo_url || job.pod_signature_url || job.recipient_name;
    const nextStatus = ({'Booked':'En Route to Collection','En Route to Collection':'Arrived at Collection','Arrived at Collection':'Collected','Collected':'In Transit','In Transit':'Arrived at Delivery','Arrived at Delivery':'Delivered'})[job.job_status];
    const etaText = `${state.settings.trading_name}: ${job.job_number || 'Your delivery'} is ${job.job_status || 'booked'}${job.eta_at ? `. ETA ${new Date(job.eta_at).toLocaleString('en-GB')}` : ''}. ${job.tracking_token ? `Track: ${trackingUrl(job)}` : ''}`;
    return `<div class="modalback" data-action="job-close"><section class="customermodal job-editor-modal job-command-drawer" onclick="event.stopPropagation()">
      <div class="modalhead"><div><small>OPERATIONS WORKFLOW</small><h2>${esc(job.job_number || 'Job')}</h2><p>${esc(job.customer_name || job.contact_name || '')}</p></div><button type="button" data-action="job-close">×</button></div>
      <div class="job-workflow">${workflow.map(step=>`<div class="${step.done?'done':''}"><span>${step.done?'✓':''}</span><b>${step.label}</b><small>${step.date?fmtDate(step.date):'Pending'}</small></div>`).join('')}</div>
      <div class="job-action-bar">
        <button class="secondary" type="button" data-focus-driver>Assign driver</button>
        ${nextStatus?`<button class="primary" type="button" data-job-next-status="${esc(nextStatus)}">Mark ${esc(nextStatus)}</button>`:''}
        <a class="secondary button-link" target="_blank" rel="noopener" href="${jobNavigationUrl(job.collection_address)}">Navigate collection</a>
        <a class="secondary button-link" target="_blank" rel="noopener" href="${jobNavigationUrl(job.delivery_address)}">Navigate delivery</a>
        <button class="secondary" type="button" data-send-job-eta data-message="${esc(etaText)}">Send ETA</button>
        ${job.job_status==='Arrived at Delivery'&&!invoice?`<button class="primary" type="button" data-deliver-invoice="${job.id}">Deliver & invoice</button>`:''}
        ${job.job_status==='Delivered'&&!invoice?`<button class="primary" type="button" data-invoice="${job.id}">Create invoice</button>`:''}
        ${invoice?`<button class="secondary" type="button" data-page="invoices">Open invoice</button>`:''}
        ${pod?`<button class="secondary" type="button" data-print-pod="${job.id}">Open POD</button>`:''}
        ${['Delivered','Cancelled'].includes(job.job_status)?`<button class="secondary" type="button" data-archive-job="${job.id}">Archive job</button>`:''}
      </div>
      <div class="job-command-summary"><div><small>STATUS</small><b>${esc(job.job_status || 'Booked')}</b></div><div><small>DRIVER</small><b>${esc(driver?.name || 'Unassigned')}</b></div><div><small>VEHICLE</small><b>${esc(job.vehicle || 'TBC')}</b></div><div><small>VALUE</small><b>${money(job.total_price)}</b></div></div>
      <div class="job-command-layout"><form id="job-editor-form" class="job-command-form"><div class="grid two"><label>Collection date<input name="collection_date" type="date" value="${esc(String(job.collection_date||'').slice(0,10))}"></label><label>Collection time<input name="collection_time" type="time" value="${esc(String(job.collection_time||'').slice(0,5))}"></label><label>Vehicle<select name="vehicle">${Object.keys(vehicles).map(v=>`<option ${job.vehicle===v?'selected':''}>${v}</option>`).join('')}</select></label><label>Status<select name="job_status">${['Booked','En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery','Delivered','Cancelled'].map(v=>`<option ${job.job_status===v?'selected':''}>${v}</option>`).join('')}</select></label><label id="job-driver-field">Assigned driver<select name="assigned_driver_id"><option value="">Unassigned</option>${state.drivers.map(d=>`<option value="${d.id}" ${job.assigned_driver_id===d.id?'selected':''}>${esc(d.name)} · ${esc(d.vehicle||'Vehicle TBC')}</option>`).join('')}</select></label><label>Job price (£)<input name="total_price" type="number" min="0" step="0.01" value="${Number(job.total_price||0)}"></label></div><label>Collection address<textarea name="collection_address" required>${esc(job.collection_address||'')}</textarea></label><label>Delivery address<textarea name="delivery_address" required>${esc(job.delivery_address||'')}</textarea></label><label>Goods / job details<textarea name="goods_description">${esc(job.goods_description||'')}</textarea></label><div class="actions"><button type="button" class="secondary" data-action="job-close">Cancel</button><button class="primary">Save job</button></div></form>
      <aside class="job-command-side"><section><h3>Customer contact</h3><div class="job-contact-card"><b>${esc(customer.contact_name || job.contact_name || job.customer_name || 'Customer')}</b><span>${esc(customer.phone || job.contact_phone || 'No phone saved')}</span><span>${esc(customer.email || job.contact_email || 'No email saved')}</span>${customer.phone?`<a class="secondary button-link" href="tel:${esc(customer.phone)}">Call customer</a>`:''}</div></section><section><h3>Proof of delivery</h3>${pod ? `<div class="job-pod-preview">${job.pod_photo_url?`<a href="${esc(job.pod_photo_url)}" target="_blank" rel="noopener">View delivery photo</a>`:''}${job.pod_signature_url?`<a href="${esc(job.pod_signature_url)}" target="_blank" rel="noopener">View signature</a>`:''}${job.recipient_name?`<p><small>RECEIVED BY</small><b>${esc(job.recipient_name)}</b></p>`:''}${job.pod_notes?`<p>${esc(job.pod_notes)}</p>`:''}</div>`:'<p class="muted">POD will appear here after delivery.</p>'}</section></aside></div>
    </section></div>`;
  }

  function jobsView() {
    const term = String(state.jobSearch || '').trim().toLowerCase();
    if (state.jobArchiveMode) {
      const archived = state.archivedJobs.filter(job => {
        if (!term) return true;
        const haystack = [job.job_number,job.customer_name,job.contact_name,job.collection_address,job.delivery_address,job.vehicle,job.job_status].join(' ').toLowerCase();
        return haystack.includes(term);
      });
      return `<section class="jobs-command-hero"><div><small>ADMIN JOB RECORDS</small><h2>Archived Jobs</h2><p>Restore jobs to active records or permanently remove test data and mistakes.</p></div><div class="jobs-live-mark archive-mark">${state.archivedJobs.length} archived</div></section>
        <div class="jobs-board-toolbar"><label class="search">Search archived jobs <input id="job-search" value="${esc(state.jobSearch||'')}" placeholder="Job, customer, postcode, vehicle or status"></label><span class="jobs-search-count">${archived.length} shown</span><button class="secondary" data-job-archive-view="active">Back to active jobs</button></div>
        <section class="archive-job-list">${archived.length ? archived.map(job=>`<article class="archive-job-card"><div class="archive-job-main"><div><small>${esc(job.job_status||'Job')}</small><h3>${esc(job.job_number||'Job')}</h3><p>${esc(job.customer_name||job.contact_name||'Customer')}</p></div><span>Archived ${fmtDate(job.archived_at)}</span></div><div class="archive-job-route"><p><small>COLLECT</small>${esc(job.collection_address||'Address TBC')}</p><b>→</b><p><small>DELIVER</small>${esc(job.delivery_address||'Address TBC')}</p></div><footer><span>${esc(job.vehicle||'Vehicle TBC')} · ${money(job.total_price)}</span><div><button class="secondary" data-restore-job="${job.id}">Restore</button><button class="danger" data-delete-archived-job="${job.id}">Delete permanently</button></div></footer></article>`).join('') : '<div class="jobs-board-empty">No archived jobs match this search.</div>'}</section>`;
    }
    const visibleJobs = state.jobs.filter(job => {
      if (!term) return true;
      const customer = jobCustomer(job);
      const driver = state.drivers.find(item => item.id === job.assigned_driver_id);
      const haystack = [job.job_number,job.customer_name,job.contact_name,job.collection_address,job.delivery_address,job.vehicle,job.job_status,driver?.name,customer.phone,customer.email].join(' ').toLowerCase();
      return haystack.includes(term);
    });
    const columns = [
      ['waiting','Waiting',visibleJobs.filter(j=>jobStatusGroup(j.job_status)==='waiting')],
      ['active','In progress',visibleJobs.filter(j=>jobStatusGroup(j.job_status)==='active')],
      ['delivered','Delivered',visibleJobs.filter(j=>jobStatusGroup(j.job_status)==='delivered')],
      ['cancelled','Cancelled',visibleJobs.filter(j=>jobStatusGroup(j.job_status)==='cancelled')]
    ];
    const activeCount = state.jobs.filter(j=>jobStatusGroup(j.job_status)==='active').length;
    const unassigned = state.jobs.filter(j=>!j.assigned_driver_id && !['Delivered','Cancelled'].includes(j.job_status)).length;
    return `<section class="jobs-command-hero"><div><small>V26.39 OPERATIONS WORKFLOW</small><h2>Jobs Control Centre</h2><p>Search, assign, navigate, update, invoice and open POD without leaving the job.</p></div><div class="jobs-live-mark"><span class="dot"></span> Live updates</div></section>
      <div class="jobs-command-kpis"><div><small>ALL JOBS</small><b>${state.jobs.length}</b></div><div><small>IN PROGRESS</small><b>${activeCount}</b></div><div><small>UNASSIGNED</small><b>${unassigned}</b></div><div><small>DELIVERED</small><b>${state.jobs.filter(j=>jobStatusGroup(j.job_status)==='delivered').length}</b></div></div>
      <div class="jobs-board-toolbar"><label class="search">Search every job field <input id="job-search" value="${esc(state.jobSearch||'')}" placeholder="Job, customer, phone, postcode, vehicle or driver"></label><span class="jobs-search-count">${visibleJobs.length} shown</span><button class="secondary" data-job-archive-view="archived">Archived (${state.archivedJobs.length})</button><button class="primary" data-page="newquote">+ New quote</button></div>
      <div class="jobs-kanban">${columns.map(([key,title,jobs])=>`<section class="jobs-board-column column-${key}"><header><div><h3>${title}</h3><small>${jobs.length} job${jobs.length===1?'':'s'}</small></div><span>${jobs.length}</span></header><div class="jobs-board-list">${jobs.length?jobs.map(jobBoardCard).join(''):`<div class="jobs-board-empty">No ${title.toLowerCase()} jobs</div>`}</div></section>`).join('')}</div>${jobEditorModal()}`;
  }

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
      return `<article class="driver-card ${active ? 'active' : ''}"><div class="driver-card-head"><div><small>${fmtDate(job.collection_date)} ${esc(String(job.collection_time || '').slice(0,5))}</small><h3>${esc(job.job_number || 'Job')}</h3></div><span>${esc(job.job_status || 'Booked')}</span></div><b>${esc(job.customer_name || 'Customer')}</b><div class="driver-progress" aria-label="Job progress">${driverStatuses.map((status,i)=>`<span class="${i<=progress?'done':''}" title="${esc(status)}"></span>`).join('')}</div><div class="driver-route"><p><small>COLLECT</small>${esc(job.collection_address || '')}</p><p><small>DELIVER</small>${esc(job.delivery_address || '')}</p></div><div class="driver-quick-grid"><button class="secondary" data-dispatch-open="${job.id}">Quick edit</button><button class="secondary" data-driver-nav="${job.id}" data-nav-target="${destinationLabel.toLowerCase()}">Navigate to ${destinationLabel}</button>${phone ? `<a class="secondary button-link" href="tel:${esc(phone)}">Call customer</a>` : ''}<button class="secondary" data-driver-share="${job.id}">Share job</button></div>${next ? `<button class="driver-next primary" data-driver-status="${job.id}" data-status="${esc(next)}">${job.job_status === 'Booked' ? 'Start Job' : esc(next)}</button>` : `<button class="driver-next secondary" data-driver-open="${job.id}">View POD</button>`}</article>`;
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
    const available = state.drivers.filter(d => (d.availability_status || 'Available') === 'Available').length;
    const onJob = state.drivers.filter(d => ['On Job','Busy'].includes(d.availability_status || '')).length;
    const linked = state.drivers.filter(d => accountFor(d.id)).length;
    const rows = state.drivers.map(driver => {
      const account = accountFor(driver.id);
      const jobs = activeJobsFor(driver.id);
      const current = jobs[0];
      const live = current && current.last_latitude && current.last_longitude;
      return `<article class="driver-control-card">
        <div class="driver-control-main"><span class="driver-status-dot ${driver.active===false||driver.availability_status==='Offline'?'off':''}"></span><div><h3>${esc(driver.name || 'Driver')}</h3><p>${esc(driver.phone || 'No phone')} · ${esc(driver.vehicle || 'Vehicle not set')}</p></div></div>
        <div class="driver-control-details"><div><small>LOGIN EMAIL</small><b>${esc(account?.email || 'Not linked')}</b></div><div><small>STATUS</small><select data-driver-availability="${driver.id}">${['Available','On Job','Break','Offline'].map(x=>`<option ${String(driver.availability_status||'Available')===x?'selected':''}>${x}</option>`).join('')}</select></div><div><small>ACTIVE JOBS</small><b>${jobs.length}</b></div><div><small>GPS</small><b>${live?'Live':'Not reporting'}</b></div></div>
        ${current ? `<div class="driver-current-job"><small>CURRENT JOB</small><b>${esc(current.job_number || 'Job')} · ${esc(current.customer_name || current.contact_name || 'Customer')}</b><span>${esc(current.job_status || 'Booked')}</span></div>` : '<div class="driver-current-job empty-job">No active job assigned</div>'}
        <footer>${!account ? `<button class="secondary" data-link-driver="${driver.id}">Link login</button>` : ''}${account && String(account.email||'').trim().toLowerCase()===String(state.user?.email||'').trim().toLowerCase() ? `<button class="primary" data-repair-driver-login="${driver.id}">Relink this login</button>` : ''}${live ? `<a class="secondary button-link" target="_blank" href="https://www.google.com/maps?q=${current.last_latitude},${current.last_longitude}">Open GPS</a>` : ''}<a class="secondary button-link" href="/driver.html" target="_blank" rel="noopener">Open app</a><button class="secondary" data-edit-driver="${driver.id}">Edit</button><button class="danger" data-delete-driver="${driver.id}">Delete</button></footer>
      </article>`;
    }).join('');
    const unlinked = state.drivers.filter(d => !accountFor(d.id));
    const selected = state.drivers.find(d => d.id === state.selectedDriverId);
    const selectedAccount = selected ? accountFor(selected.id) : null;
    const editModal = selected ? `<div class="modalback" data-action="driver-admin-close"><section class="customermodal driver-admin-modal" onclick="event.stopPropagation()"><div class="modalhead"><div><small>DRIVER RECORD</small><h2>Edit ${esc(selected.name)}</h2><p>Update the office record and Driver App login.</p></div><button data-action="driver-admin-close">×</button></div><form id="driver-edit-form"><div class="grid two"><label>Driver name<input name="name" required value="${esc(selected.name||'')}"></label><label>Telephone<input name="phone" value="${esc(selected.phone||'')}"></label><label>Vehicle<input name="vehicle" value="${esc(selected.vehicle||'')}"></label><label>Availability<select name="availability_status">${['Available','On Job','Break','Offline'].map(x=>`<option ${String(selected.availability_status||'Available')===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Driver App login email<input name="login_email" type="email" value="${esc(selectedAccount?.email||'')}"></label><label>Account active<select name="active"><option value="true" ${selected.active!==false?'selected':''}>Active</option><option value="false" ${selected.active===false?'selected':''}>Inactive</option></select></label></div><div class="actions"><button type="button" class="secondary" data-action="driver-admin-close">Cancel</button><button class="primary">Save Driver</button></div></form></section></div>` : '';
    return `<section class="drivers-hero"><div><small>DRIVER ADMINISTRATION</small><h2>Driver Control</h2><p>Manage drivers, app access, availability, live jobs and GPS from one screen.</p></div><div class="driver-hero-actions"><button class="primary" type="button" data-scroll-add-driver>+ Add driver</button><a class="secondary button-link" href="/driver.html" target="_blank" rel="noopener">Open Driver App ↗</a></div></section>
      <section class="driver-control-kpis">${card('Drivers',state.drivers.length,'Total driver records')}${card('Available',available,'Ready for work')}${card('On jobs',onJob,'Currently working')}${card('App linked',linked,'Can sign in')}</section>
      <section class="driver-control-grid"><div class="panel" id="add-driver-panel"><div class="panelhead"><div><h2>Add a driver</h2><p>The login email must exactly match the Driver App email.</p></div><button class="primary driver-add-top" type="submit" form="driver-form">+ Add driver</button></div><form id="driver-form" class="driver-admin-form"><label>Driver name<input name="name" required></label><label>Telephone<input name="phone"></label><label>Vehicle<input name="vehicle" placeholder="Luton Tail Lift"></label><label>Driver App login email<input name="login_email" type="email" required placeholder="driver@example.co.uk"></label><button class="primary driver-add-submit" type="submit">+ Add Driver & Link Login</button></form></div>
      <div class="panel"><div class="panelhead"><div><h2>Link an existing driver</h2><p>Use this when the app says “Account not linked”.</p></div></div>${unlinked.length ? `<form id="driver-link-form" class="driver-admin-form"><label>Driver<select name="driver_id" required><option value="">Select driver</option>${unlinked.map(d=>`<option value="${d.id}">${esc(d.name)}</option>`).join('')}</select></label><label>Exact Driver App email<input name="email" type="email" required value="${esc(state.user?.email || '')}"></label><button class="primary">Link Driver Login</button></form>` : '<div class="empty">Every driver is already linked to a login.</div>'}</div></section>
      <section class="panel"><div class="panelhead"><div><h2>Your drivers</h2><p>${state.drivers.length} driver${state.drivers.length===1?'':'s'} in the system.</p></div></div><div class="driver-control-list">${rows || '<div class="empty">No drivers yet. Add your first driver above.</div>'}</div></section>${editModal}`;
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
    const priorityFilter = String(state.dispatchPriorityFilter || 'all');
    const dateFilter = String(state.dispatchDateFilter || 'all');
    const selectedJobs = Array.isArray(state.dispatchSelectedJobs) ? state.dispatchSelectedJobs : [];

    const matches = job => {
      const text = [job.job_number,job.customer_name,job.contact_name,job.collection_address,job.delivery_address,job.assigned_driver_name,job.vehicle].join(' ').toLowerCase();
      const searchOk = !query || text.includes(query);
      const driverOk = driverFilter === 'all' || (driverFilter === 'unassigned' ? !job.assigned_driver_id : job.assigned_driver_id === driverFilter);
      const priority = String(job.priority || 'Normal');
      const priorityOk = priorityFilter === 'all' || priority.toLowerCase() === priorityFilter.toLowerCase();
      const jobDate = String(job.collection_date || '').slice(0,10);
      const dateOk = dateFilter === 'all' || (dateFilter === 'today' ? jobDate === today : (dateFilter === 'tomorrow' ? jobDate === new Date(Date.now()+86400000).toISOString().slice(0,10) : jobDate === dateFilter));
      return searchOk && driverOk && priorityOk && dateOk;
    };

    const compactCard = job => {
      const time = job.collection_time ? String(job.collection_time).slice(0,5) : 'TBC';
      const driver = job.assigned_driver_name || 'Unassigned';
      const liveAge = job.location_updated_at ? Math.max(0, Math.round((Date.now()-new Date(job.location_updated_at).getTime())/60000)) : null;
      const assignOptions = state.drivers.map(d=>`<option value="${d.id}" ${job.assigned_driver_id===d.id?'selected':''}>${esc(d.name)} · ${esc(d.availability_status||'Available')}</option>`).join('');
      const priority = String(job.priority || 'Normal');
      const deadline = job.delivery_deadline ? String(job.delivery_deadline).slice(0,5) : '';
      const checked = selectedJobs.includes(job.id);
      return `<article class="dispatch-board-card priority-${priority.toLowerCase()} ${checked?'selected':''}" draggable="true" data-dispatch-job="${job.id}">
        <header><div class="dispatch-card-title"><input type="checkbox" data-dispatch-select="${job.id}" ${checked?'checked':''} aria-label="Select ${esc(job.job_number||'job')}"><div><small>${esc(time)}${deadline?` → ${esc(deadline)}`:''}</small><b>${esc(job.job_number || 'Job')}</b></div></div><div class="dispatch-card-badges"><button type="button" class="priority-badge ${priority.toLowerCase()}" data-job-priority="${job.id}" data-priority="${priority==='Urgent'?'Normal':'Urgent'}">${esc(priority)}</button><span class="dispatch-status-pill">${esc(job.job_status || 'Booked')}</span></div></header>
        <h3>${esc(job.customer_name || job.contact_name || 'Customer')}</h3>
        <div class="dispatch-board-route"><p><small>COLLECT</small>${esc(job.collection_address || 'Not set')}</p><i>↓</i><p><small>DELIVER</small>${esc(job.delivery_address || 'Not set')}</p></div>
        <div class="dispatch-board-meta"><span>🚚 ${esc(job.vehicle || 'Vehicle TBC')}</span><span>👤 ${esc(driver)}</span>${liveAge !== null ? `<span class="live-chip">● GPS ${liveAge < 1 ? 'now' : `${liveAge}m`}</span>` : ''}</div>
        <label class="dispatch-quick-assign"><span>ASSIGN DRIVER</span><select data-assign-job="${job.id}"><option value="">Unassigned</option>${assignOptions}</select></label>
        <footer><strong>${money(job.total_price)}</strong><div><button class="secondary" data-dispatch-open="${job.id}">Quick edit</button></div></footer>
      </article>`;
    };

    const column = (key,label,subtitle,jobs,status) => {
      const filtered = jobs.filter(matches);
      return `<section class="dispatch-board-column" data-drop-status="${esc(status)}"><header><div><small>${esc(subtitle)}</small><h3>${esc(label)}</h3></div><b>${filtered.length}</b></header><div class="dispatch-board-stack">${filtered.map(compactCard).join('') || '<div class="dispatch-board-empty">Drop jobs here</div>'}</div></section>`;
    };

    const driverOptions = state.drivers.map(d=>`<option value="${d.id}" ${driverFilter===d.id?'selected':''}>${esc(d.name)}</option>`).join('');
    const liveCount = active.filter(j=>j.last_latitude&&j.last_longitude).length;
    const lateCount = active.filter(j=>j.collection_date && `${j.collection_date}T${String(j.collection_time||'23:59').slice(0,5)}` < new Date().toISOString().slice(0,16) && ['Booked','En Route to Collection'].includes(j.job_status)).length;
    const activity = searchable.flatMap(job => {
      const driver = job.assigned_driver_name || state.drivers.find(d=>d.id===job.assigned_driver_id)?.name || 'Unassigned';
      const rows = [];
      if (job.delivered_at) rows.push({at:job.delivered_at,icon:'✓',title:`${job.job_number || 'Job'} delivered`,detail:`POD received · ${driver}`,job});
      else if (job.job_status) rows.push({at:job.updated_at || job.created_at,icon:'●',title:`${job.job_number || 'Job'} · ${job.job_status}`,detail:`${driver} · ${job.customer_name || job.contact_name || 'Customer'}`,job});
      if (job.location_updated_at && !['Delivered','Cancelled'].includes(job.job_status)) rows.push({at:job.location_updated_at,icon:'⌖',title:`Live GPS from ${driver}`,detail:job.job_number || 'Active job',job});
      return rows;
    }).filter(x=>x.at).sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,12);
    const activityHtml = activity.length ? activity.map(item=>`<button type="button" class="dispatch-activity-row" data-dispatch-open="${item.job.id}"><span>${item.icon}</span><div><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></div><time>${new Date(item.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</time></button>`).join('') : '<div class="dispatch-board-empty">No job activity yet.</div>';
    const deliveryRisk = active.filter(job => {
      if (!job.delivery_deadline || !job.collection_date || ['Delivered','Cancelled'].includes(job.job_status)) return false;
      const due = new Date(`${String(job.collection_date).slice(0,10)}T${String(job.delivery_deadline).slice(0,5)}`);
      return Number.isFinite(due.getTime()) && due.getTime() - Date.now() <= 45 * 60000;
    });
    const alertRows = [
      ...unassigned.map(job=>({level:'urgent',title:`${job.job_number || 'Job'} needs a driver`,detail:job.collection_address || 'Collection address not set',job})),
      ...active.filter(job=>job.collection_date && `${job.collection_date}T${String(job.collection_time||'23:59').slice(0,5)}` < new Date().toISOString().slice(0,16) && ['Booked','En Route to Collection'].includes(job.job_status)).map(job=>({level:'late',title:`${job.job_number || 'Job'} collection alert`,detail:`${job.collection_time ? String(job.collection_time).slice(0,5) : 'Time TBC'} · ${job.collection_address || 'Address TBC'}`,job})),
      ...deliveryRisk.map(job=>({level:'late',title:`${job.job_number || 'Job'} delivery deadline`,detail:`Due ${String(job.delivery_deadline).slice(0,5)} · ${job.delivery_address || 'Delivery address TBC'}`,job}))
    ].slice(0,10);
    const alertsHtml = alertRows.length ? alertRows.map(item=>`<button type="button" class="dispatch-alert-row ${item.level}" data-dispatch-open="${item.job.id}"><span>!</span><div><b>${esc(item.title)}</b><small>${esc(item.detail)}</small></div></button>`).join('') : '<div class="dispatch-all-clear"><span>✓</span><div><b>All clear</b><small>No unassigned or late collections.</small></div></div>';
    const driverLiveCards = state.drivers.map(driver => {
      const jobs = active.filter(j=>j.assigned_driver_id===driver.id);
      const current = jobs[0];
      const gpsAge = current?.location_updated_at ? Math.max(0,Math.round((Date.now()-new Date(current.location_updated_at).getTime())/60000)) : null;
      const availability = driver.active===false ? 'Offline' : (driver.availability_status||'Available');
      return `<article class="dispatch-live-driver ${String(availability).toLowerCase().replace(/\s+/g,'-')}"><div class="dispatch-live-driver-head"><span class="driver-status-dot ${availability==='Offline'?'off':''}"></span><div><b>${esc(driver.name||'Driver')}</b><small>${esc(driver.vehicle||'Vehicle TBC')}</small></div><strong>${esc(availability)}</strong></div>${current?`<button type="button" data-dispatch-open="${current.id}"><small>CURRENT JOB</small><b>${esc(current.job_number||'Job')} · ${esc(current.job_status||'Booked')}</b><span>${gpsAge===null?'GPS not started':`GPS ${gpsAge<1?'live':`${gpsAge}m ago`}`}</span></button>`:'<p>No active job</p>'}</article>`;
    }).join('') || '<div class="dispatch-board-empty">No drivers added.</div>';

    return `<section class="dispatch-v4-hero"><div><small>KLS LIVE CONTROL</small><h2>Dispatch Centre</h2><p>Live jobs, drivers, GPS, alerts and POD from one control screen.</p></div><div><button class="secondary" data-action="refresh-dispatch">↻ Refresh</button><button class="primary" data-page="newquote">＋ New Job</button></div></section>
      <section class="dispatch-v4-kpis">${card('Active jobs',active.length,'Currently moving','jobs')}${card('Unassigned',unassigned.length,'Needs a driver','dispatch')}${card('Live GPS',liveCount,'Reporting now','tracking')}${card('Collection alerts',lateCount,lateCount ? 'Check immediately' : 'No late collections','dispatch')}</section>
      <section class="dispatch-v4-tools"><label>Search<input id="dispatch-search" value="${esc(state.dispatchSearch||'')}" placeholder="Job, customer, postcode or driver"></label><label>Driver<select id="dispatch-driver-filter"><option value="all">All drivers</option><option value="unassigned" ${driverFilter==='unassigned'?'selected':''}>Unassigned only</option>${driverOptions}</select></label><label>Priority<select id="dispatch-priority-filter"><option value="all">All priorities</option>${['Urgent','Timed','VIP','Normal'].map(x=>`<option value="${x}" ${priorityFilter===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Date<select id="dispatch-date-filter"><option value="all">All dates</option><option value="today" ${dateFilter==='today'?'selected':''}>Today</option><option value="tomorrow" ${dateFilter==='tomorrow'?'selected':''}>Tomorrow</option></select></label><div class="realtime-indicator"><span></span> Driver App connected</div><div class="dispatch-last-sync">Updated ${new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div></section>
      ${selectedJobs.length ? `<section class="dispatch-bulk-bar"><b>${selectedJobs.length} job${selectedJobs.length===1?'':'s'} selected</b><label>Assign<select id="dispatch-bulk-driver"><option value="">Choose driver</option>${state.drivers.map(d=>`<option value="${d.id}">${esc(d.name)} · ${esc(d.availability_status||'Available')}</option>`).join('')}</select></label><label>Priority<select id="dispatch-bulk-priority"><option value="">Choose priority</option>${['Normal','Urgent','Timed','VIP'].map(x=>`<option value="${x}">${x}</option>`).join('')}</select></label><button class="secondary" data-bulk-status="Booked">Booked</button><button class="secondary" data-bulk-status="In Transit">In Transit</button><button class="primary" data-bulk-status="Delivered">Delivered</button><button class="secondary" data-action="dispatch-clear-selection">Clear</button></section>` : ''}
      <section class="dispatch-live-drivers"><header><div><small>LIVE DRIVER APP STATUS</small><h2>Your drivers now</h2></div><button class="secondary" data-page="drivers">Manage drivers</button></header><div>${driverLiveCards}</div></section>
      <section class="dispatch-board">
        ${column('unassigned','Unassigned','WAITING FOR DRIVER',unassigned,'Booked')}
        ${column('assigned','Assigned','HEADING TO COLLECTION',assigned,'En Route to Collection')}
        ${column('collection','At Collection','LOADING / COLLECTED',collection,'Collected')}
        ${column('transit','In Transit','HEADING TO DELIVERY',transit,'In Transit')}
        ${column('delivered','Delivered','COMPLETED TODAY',deliveredToday,'Delivered')}
      </section>
      <section class="dispatch-v4-lower"><div class="live-map-panel"><div class="live-map-head"><div><small>LIVE FLEET MAP</small><h2>Driver locations</h2><p>Latest GPS positions from active jobs.</p></div><button class="secondary" data-action="refresh-map">Refresh map</button></div><div id="dispatch-map" class="dispatch-map"></div><div id="map-empty" class="map-empty hidden">No live GPS positions yet. Start tracking from the Driver App.</div></div>
      <aside class="dispatch-driver-strip"><header><div><small>DRIVER STATUS</small><h2>Available drivers</h2></div><button class="secondary" data-page="drivers">Driver control</button></header>${state.drivers.map(driver=>{const jobs=active.filter(j=>j.assigned_driver_id===driver.id);const current=jobs[0];const gpsAge=current?.location_updated_at?Math.max(0,Math.round((Date.now()-new Date(current.location_updated_at).getTime())/60000)):null;return `<div class="dispatch-driver-row"><span class="driver-status-dot ${driver.active===false||driver.availability_status==='Offline'?'off':''}"></span><div><b>${esc(driver.name)}</b><small>${esc(driver.vehicle||'Vehicle TBC')} · ${jobs.length} active${gpsAge!==null?` · GPS ${gpsAge<1?'now':`${gpsAge}m`}`:''}</small></div><select data-driver-availability="${driver.id}">${['Available','On Job','Break','Offline'].map(x=>`<option ${String(driver.availability_status||'Available')===x?'selected':''}>${x}</option>`).join('')}</select></div>`;}).join('') || '<div class="dispatch-board-empty">No drivers added.</div>'}</aside></section>
      <section class="dispatch-command-lower"><div class="dispatch-command-panel"><header><div><small>OPERATIONS ALERTS</small><h2>Needs attention</h2></div><b>${alertRows.length}</b></header><div class="dispatch-alert-list">${alertsHtml}</div></div><div class="dispatch-command-panel"><header><div><small>LIVE ACTIVITY</small><h2>Latest updates</h2></div><span class="dispatch-sync-label">Auto-refresh 5s</span></header><div class="dispatch-activity-list">${activityHtml}</div></div></section>${dispatchJobModal()}`;
  }


  function dispatchJobModal() {
    const job = state.jobs.find(j => j.id === state.selectedDispatchJobId);
    if (!job) return '';
    const driverOptions = state.drivers.map(d=>`<option value="${d.id}" ${job.assigned_driver_id===d.id?'selected':''}>${esc(d.name)} · ${esc(d.availability_status||'Available')}</option>`).join('');
    return `<div class="modalback dispatch-editor-backdrop" data-action="dispatch-editor-close"><section class="customermodal dispatch-editor" onclick="event.stopPropagation()"><div class="modalhead"><div><small>DISPATCH QUICK EDIT</small><h2>${esc(job.job_number || 'Job')}</h2><p>${esc(job.customer_name || job.contact_name || 'Customer')}</p></div><button type="button" data-action="dispatch-editor-close">×</button></div>
      <div class="dispatch-editor-route"><div><small>COLLECTION</small><b>${esc(job.collection_address || 'Not set')}</b></div><span>→</span><div><small>DELIVERY</small><b>${esc(job.delivery_address || 'Not set')}</b></div></div>
      <form id="dispatch-editor-form"><div class="grid two"><label>Status<select name="job_status">${dispatchStatuses.map(x=>`<option ${job.job_status===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Priority<select name="priority">${['Normal','Urgent','Timed','VIP'].map(x=>`<option ${String(job.priority||'Normal')===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Assigned driver<select name="assigned_driver_id"><option value="">Unassigned</option>${driverOptions}</select></label><label>Collection date<input name="collection_date" type="date" value="${esc(String(job.collection_date||'').slice(0,10))}"></label><label>Collection time<input name="collection_time" type="time" value="${esc(String(job.collection_time||'').slice(0,5))}"></label><label>Delivery deadline<input name="delivery_deadline" type="time" value="${esc(String(job.delivery_deadline||'').slice(0,5))}"></label><label>Customer ETA<input name="eta_at" type="datetime-local" value="${job.eta_at?esc(String(job.eta_at).slice(0,16)):''}"></label><label>Vehicle<input name="vehicle" value="${esc(job.vehicle||'')}"></label></div><label>Dispatch notes<textarea name="dispatch_notes" rows="4" placeholder="Office-only notes, access details or instructions">${esc(job.dispatch_notes||'')}</textarea></label><div class="actions"><button type="button" class="secondary" data-action="dispatch-editor-close">Cancel</button><button type="button" class="secondary" data-dispatch-full-job="${job.id}">Open full job</button><button class="primary">Save changes</button></div></form>
    </section></div>`;
  }


  function invoicesView() {
    const deliveredQueue = allJobRecords().filter(job => job.job_status === 'Delivered' && !state.invoices.some(inv => inv.job_id === job.id));
    const outstandingInvoices = state.invoices.filter(inv => invoiceBalance(inv) > 0 && inv.status !== 'Cancelled');
    const overdueInvoices = outstandingInvoices.filter(inv => inv.due_date && inv.due_date < todayISO());
    const outstandingTotal = outstandingInvoices.reduce((sum, inv) => sum + invoiceBalance(inv), 0);
    const search = String(state.invoiceSearch || '').trim().toLowerCase();
    const filter = state.invoiceFilter || 'all';
    const visibleInvoices = state.invoices.filter(inv => {
      const status = invoiceDisplayStatus(inv);
      const overdue = invoiceBalance(inv) > 0 && inv.due_date && inv.due_date < todayISO();
      const matchesFilter = filter === 'all' || (filter === 'outstanding' && invoiceBalance(inv) > 0) || (filter === 'overdue' && overdue) || (filter === 'paid' && status === 'Paid');
      const haystack = [inv.invoice_number, inv.customer_name, inv.issue_date, inv.due_date, status].join(' ').toLowerCase();
      return matchesFilter && (!search || haystack.includes(search));
    });
    const queueHtml = deliveredQueue.length ? deliveredQueue.map(job => `<article class="billing-queue-card"><div><small>READY TO INVOICE</small><b>${esc(job.job_number || 'Job')}</b><span>${esc(job.customer_name || job.contact_name || 'Customer')}</span><p>${esc(job.collection_address || '')} → ${esc(job.delivery_address || '')}</p></div><strong>${money(job.total_price)}</strong><button class="primary" data-invoice="${job.id}">Create invoice</button></article>`).join('') : '<div class="billing-clear"><span>✓</span><div><b>Billing queue clear</b><small>Every delivered job has an invoice.</small></div></div>';
    const rows = visibleInvoices.map(inv => {
      const overdue = invoiceBalance(inv) > 0 && inv.due_date && inv.due_date < todayISO();
      return [
        `<b>${esc(inv.invoice_number)}</b>${overdue ? '<small class="invoice-overdue-note">OVERDUE</small>' : ''}`, esc(inv.customer_name), fmtDate(inv.issue_date), fmtDate(inv.due_date), money(inv.total), money(invoicePaid(inv)), money(invoiceBalance(inv)),
        `<span class="account-status ${invoiceDisplayStatus(inv).toLowerCase().replace(/[^a-z]/g,'')}">${esc(invoiceDisplayStatus(inv))}</span>`,
        `<div class="invoice-actions"><button class="primary" data-print-invoice="${inv.id}">Open invoice</button><button data-email-invoice="${inv.id}">Email</button><button data-whatsapp-invoice="${inv.id}">WhatsApp</button>${invoiceBalance(inv)>0 ? `<button data-record-payment="${inv.id}">Payment</button><button data-remind-invoice="${inv.id}">Reminder</button>` : '<span>Paid in full</span>'}</div>`
      ];
    });
    return `<section class="billing-hero"><div><small>KLS BILLING CONTROL</small><h2>Invoices & payment chasing</h2><p>Create professional invoices from completed work, share them with customers and record payments.</p></div><button class="primary" data-create-all-invoices ${deliveredQueue.length ? '' : 'disabled'}>Create all ${deliveredQueue.length || ''}</button></section>
      <section class="billing-kpis">${card('Ready to invoice',deliveredQueue.length,'Completed jobs waiting','invoices')}${card('Outstanding',money(outstandingTotal),`${outstandingInvoices.length} unpaid invoice${outstandingInvoices.length===1?'':'s'}`,'accounts')}${card('Overdue',overdueInvoices.length,overdueInvoices.length?`${money(overdueInvoices.reduce((s,i)=>s+invoiceBalance(i),0))} needs chasing`:'Nothing overdue','invoices')}${card('Paid',state.invoices.filter(i=>invoiceBalance(i)<=0 && i.status!=='Cancelled').length,'Invoices settled','accounts')}</section>
      <section class="billing-layout"><div>${panel('Billing queue',`<div class="billing-queue">${queueHtml}</div>`,'Delivered jobs appear here automatically.')}</div><div>${panel('Invoice register',`<div class="invoice-register-tools"><label>Search invoices<input id="invoice-search" value="${esc(state.invoiceSearch || '')}" placeholder="Invoice number or customer"></label><label>Status<select id="invoice-filter"><option value="all" ${filter==='all'?'selected':''}>All invoices</option><option value="outstanding" ${filter==='outstanding'?'selected':''}>Outstanding</option><option value="overdue" ${filter==='overdue'?'selected':''}>Overdue</option><option value="paid" ${filter==='paid'?'selected':''}>Paid</option></select></label><span>${visibleInvoices.length} shown</span></div>${table(['Invoice','Customer','Issue','Due','Total','Paid','Balance','Status','Actions'],rows)}`,'Open Invoice provides a print-ready document that can be saved as PDF.')}</div></section>`;
  }


  function deliveryDocumentsView() {
    const delivered = allJobRecords().filter(job => job.job_status === 'Delivered').sort((a,b)=>new Date(b.delivered_at || b.updated_at || b.created_at || 0)-new Date(a.delivered_at || a.updated_at || a.created_at || 0));
    const withPod = delivered.filter(hasCompletePod);
    const withoutPod = delivered.filter(job => !hasCompletePod(job));
    const thisMonth = todayISO().slice(0,7);
    const monthCount = delivered.filter(job => String(job.delivered_at || job.collection_date || '').slice(0,7) === thisMonth).length;
    const cards = delivered.map(job => {
      const invoice = state.invoices.find(inv => inv.job_id === job.id);
      const completed = job.delivered_at ? new Date(job.delivered_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}) : fmtDate(job.collection_date);
      const podReady = hasCompletePod(job);
      return `<article class="document-card" data-document-card>
        <header><div><small>${podReady ? 'POD COMPLETE' : 'POD NEEDS REVIEW'}</small><h3>${esc(job.job_number || 'Delivered job')}</h3><p>${esc(job.customer_name || job.contact_name || 'Customer')}</p></div><span class="document-status ${podReady?'ready':'missing'}">${podReady?'Ready':'Missing POD'}</span></header>
        <div class="document-route"><p><small>COLLECTION</small>${esc(job.collection_address || '—')}</p><p><small>DELIVERY</small>${esc(job.delivery_address || '—')}</p></div>
        <div class="document-meta"><span><small>Delivered</small><b>${esc(completed)}</b></span><span><small>Received by</small><b>${esc(podRecipient(job) || 'Not recorded')}</b></span><span><small>Invoice</small><b>${esc(invoice?.invoice_number || 'Not raised')}</b></span></div>
        ${job.pod_notes ? `<p class="document-note"><small>DRIVER NOTES</small>${esc(job.pod_notes)}</p>` : ''}
        <footer><button class="primary" data-print-pod="${job.id}" ${podReady?'':'disabled'}>Open POD certificate</button><button data-share-pod="${job.id}" ${podReady?'':'disabled'}>Share</button>${job.pod_photo_url?`<a class="button-link secondary" href="${esc(job.pod_photo_url)}" target="_blank" rel="noopener">Photo</a>`:''}${job.pod_signature_url?`<a class="button-link secondary" href="${esc(job.pod_signature_url)}" target="_blank" rel="noopener">Signature</a>`:''}</footer>
      </article>`;
    }).join('') || '<div class="billing-clear"><span>✓</span><div><b>No delivered jobs yet</b><small>Completed deliveries will appear here automatically.</small></div></div>';
    return `<section class="documents-hero"><div><small>KLS DELIVERY RECORDS</small><h2>POD & Delivery Documents</h2><p>Open, print and share professional proof-of-delivery certificates from completed jobs.</p></div><label>Search documents<input id="document-search" placeholder="Job, customer, address or recipient"></label></section>
      <section class="documents-kpis">${card('Delivered jobs',delivered.length,'All completed work','documents')}${card('POD ready',withPod.length,'Certificates available','documents')}${card('Needs review',withoutPod.length,withoutPod.length?'Missing POD details':'Everything complete','jobs')}${card('This month',monthCount,'Deliveries completed','documents')}</section>
      ${panel('Delivery document library',`<div class="document-grid">${cards}</div>`,'Use your browser print screen to save any certificate as a PDF.')}`;
  }

  function accountsView() {
    const active = state.invoices.filter(i => i.status !== 'Cancelled');
    const totalInvoiced = active.reduce((s,i)=>s+Number(i.total||0),0);
    const totalPaid = active.reduce((s,i)=>s+invoicePaid(i),0);
    const outstanding = active.reduce((s,i)=>s+invoiceBalance(i),0);
    const today = todayISO();
    const overdueInvoices = active.filter(i=>invoiceBalance(i)>0 && i.due_date && i.due_date < today);
    const overdue = overdueInvoices.reduce((s,i)=>s+invoiceBalance(i),0);
    const month = today.slice(0,7);
    const monthIncome = active.filter(i=>String(i.paid_date||'').slice(0,7)===month).reduce((s,i)=>s+invoicePaid(i),0);
    const monthExpenses = state.expenses.filter(e=>String(e.expense_date||'').slice(0,7)===month).reduce((s,e)=>s+Number(e.amount||0),0);
    const monthProfit = monthIncome-monthExpenses;
    const dueSoonDate = new Date(); dueSoonDate.setDate(dueSoonDate.getDate()+Number(state.financeForecastDays||30));
    const dueSoonISO = dueSoonDate.toISOString().slice(0,10);
    const expectedIncome = active.filter(i=>invoiceBalance(i)>0 && i.due_date && i.due_date<=dueSoonISO).reduce((s,i)=>s+invoiceBalance(i),0);
    const projectedCash = monthProfit + expectedIncome;
    const tab = state.financeTab || 'overview';
    const tabs = `<div class="finance-tabs"><button class="${tab==='overview'?'active':''}" data-finance-tab="overview">Overview</button><button class="${tab==='receivables'?'active':''}" data-finance-tab="receivables">Money owed</button><button class="${tab==='expenses'?'active':''}" data-finance-tab="expenses">Expenses</button><button class="${tab==='forecast'?'active':''}" data-finance-tab="forecast">Cash forecast</button></div>`;

    const ageingBuckets = [
      ['Not overdue', active.filter(i=>invoiceBalance(i)>0 && (!i.due_date || i.due_date>=today)).reduce((s,i)=>s+invoiceBalance(i),0)],
      ['1–7 days', overdueInvoices.filter(i=>Math.ceil((new Date(today)-new Date(i.due_date))/86400000)<=7).reduce((s,i)=>s+invoiceBalance(i),0)],
      ['8–30 days', overdueInvoices.filter(i=>{const d=Math.ceil((new Date(today)-new Date(i.due_date))/86400000);return d>7&&d<=30;}).reduce((s,i)=>s+invoiceBalance(i),0)],
      ['31+ days', overdueInvoices.filter(i=>Math.ceil((new Date(today)-new Date(i.due_date))/86400000)>30).reduce((s,i)=>s+invoiceBalance(i),0)]
    ];
    const maxAge=Math.max(1,...ageingBuckets.map(x=>x[1]));
    const ageing=`<div class="finance-ageing">${ageingBuckets.map(([label,value])=>`<article><span><b>${esc(label)}</b><small>${money(value)}</small></span><div><i style="width:${Math.max(value?4:0,value/maxAge*100)}%"></i></div></article>`).join('')}</div>`;

    const invoiceRows = active.sort((a,b)=>String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))).map(inv=>[
      esc(inv.invoice_number), esc(inv.customer_name), fmtDate(inv.issue_date), fmtDate(inv.due_date), money(inv.total), money(invoicePaid(inv)), money(invoiceBalance(inv)),
      `<span class="finance-status ${invoiceBalance(inv)<=0?'paid':(inv.due_date&&inv.due_date<today?'overdue':'due')}">${esc(invoiceDisplayStatus(inv))}</span>`,
      invoiceBalance(inv)>0 ? `<button data-record-payment="${inv.id}">Record payment</button>` : '<span>Paid in full</span>'
    ]);
    const expenseRows = [...state.expenses].sort((a,b)=>String(b.expense_date||'').localeCompare(String(a.expense_date||''))).map(e=>[fmtDate(e.expense_date),esc(e.category),esc(e.supplier||'—'),esc(e.description||'—'),money(e.amount),`<button class="danger" data-delete-expense="${e.id}">Delete</button>`]);
    const categoryTotals = new Map(); state.expenses.filter(e=>String(e.expense_date||'').slice(0,7)===month).forEach(e=>categoryTotals.set(e.category||'Other',(categoryTotals.get(e.category||'Other')||0)+Number(e.amount||0)));
    const categoryList=[...categoryTotals.entries()].sort((a,b)=>b[1]-a[1]);
    const expenseBreakdown=categoryList.length?`<div class="finance-breakdown">${categoryList.map(([name,value])=>`<article><span><b>${esc(name)}</b><small>${money(value)}</small></span><strong>${monthExpenses?Math.round(value/monthExpenses*100):0}%</strong></article>`).join('')}</div>`:'<div class="fleet-empty">No expenses recorded this month.</div>';

    let body='';
    if(tab==='receivables') body=`<section class="finance-grid"><div>${panel('Invoice ageing',ageing,'Focus collection work on the oldest balances first.')}</div><div>${panel('Collection summary',`<div class="finance-summary-list"><p><span>Invoices outstanding</span><b>${active.filter(i=>invoiceBalance(i)>0).length}</b></p><p><span>Overdue invoices</span><b>${overdueInvoices.length}</b></p><p><span>Average outstanding invoice</span><b>${money(active.filter(i=>invoiceBalance(i)>0).length?outstanding/active.filter(i=>invoiceBalance(i)>0).length:0)}</b></p><p><span>Collection rate</span><b>${totalInvoiced?Math.round(totalPaid/totalInvoiced*100):0}%</b></p></div>`,'Amounts use payments already recorded in the system.')}</div></section>${panel('Customer balances',table(['Invoice','Customer','Issued','Due','Total','Paid','Balance','Status','Action'],invoiceRows),'Part-payments automatically update the balance and status.')}`;
    else if(tab==='expenses') body=`<section class="finance-grid"><div>${panel('Record an expense',`<form id="expense-form" class="finance-expense-form"><div class="grid two"><label>Date<input name="expense_date" type="date" value="${today}" required></label><label>Category<select name="category"><option>Fuel</option><option>Vehicle</option><option>Insurance</option><option>Maintenance</option><option>Tolls & Parking</option><option>Office</option><option>Marketing</option><option>Subcontractor</option><option>Other</option></select></label></div><div class="grid two"><label>Supplier<input name="supplier"></label><label>Amount<input name="amount" type="number" step="0.01" min="0" required></label></div><label>Description<input name="description"></label><button class="primary">Save Expense</button></form>`,'Record all operating costs for accurate profit reporting.')}</div><div>${panel('This month by category',expenseBreakdown,`${money(monthExpenses)} recorded in ${new Date().toLocaleDateString('en-GB',{month:'long'})}.`)}</div></section>${panel('Expense ledger',table(['Date','Category','Supplier','Description','Amount',''],expenseRows),'Running business costs saved securely.')}`;
    else if(tab==='forecast') body=`<section class="forecast-hero"><div><small>NEXT ${state.financeForecastDays||30} DAYS</small><h3>${money(projectedCash)}</h3><p>Projected cash position based on this month’s recorded result and invoices due.</p></div><label>Forecast window<select id="finance-forecast-days"><option value="7" ${state.financeForecastDays==7?'selected':''}>7 days</option><option value="30" ${state.financeForecastDays==30?'selected':''}>30 days</option><option value="60" ${state.financeForecastDays==60?'selected':''}>60 days</option><option value="90" ${state.financeForecastDays==90?'selected':''}>90 days</option></select></label></section><section class="finance-grid"><div>${panel('Expected inflow',`<div class="forecast-number positive"><small>Invoices due</small><b>${money(expectedIncome)}</b><span>${active.filter(i=>invoiceBalance(i)>0&&i.due_date&&i.due_date<=dueSoonISO).length} invoice(s)</span></div>`,'Based on current due dates, not a payment guarantee.')}</div><div>${panel('Current month result',`<div class="forecast-number ${monthProfit>=0?'positive':'negative'}"><small>Cash received minus expenses</small><b>${money(monthProfit)}</b><span>${money(monthIncome)} in · ${money(monthExpenses)} out</span></div>`,'Only recorded payments and expenses are included.')}</div></section>${panel('Invoices feeding the forecast',table(['Invoice','Customer','Due','Balance','Status'],active.filter(i=>invoiceBalance(i)>0&&i.due_date&&i.due_date<=dueSoonISO).map(i=>[esc(i.invoice_number),esc(i.customer_name),fmtDate(i.due_date),money(invoiceBalance(i)),esc(invoiceDisplayStatus(i))])),'Use this list to plan follow-ups before cash becomes tight.')}`;
    else body=`<section class="finance-grid"><div>${panel('Cash position',`<div class="finance-cash-card"><div><small>RECEIVED THIS MONTH</small><b>${money(monthIncome)}</b></div><div><small>SPENT THIS MONTH</small><b>${money(monthExpenses)}</b></div><div class="${monthProfit>=0?'positive':'negative'}"><small>NET CASH RESULT</small><b>${money(monthProfit)}</b></div></div>`,'This is a cash view, not a full statutory profit-and-loss account.')}</div><div>${panel('Invoice health',`<div class="finance-summary-list"><p><span>Total invoiced</span><b>${money(totalInvoiced)}</b></p><p><span>Received</span><b>${money(totalPaid)}</b></p><p><span>Outstanding</span><b>${money(outstanding)}</b></p><p class="danger"><span>Overdue</span><b>${money(overdue)}</b></p></div>`,'KLS is currently recorded as not VAT registered, so figures are shown without VAT calculations.')}</div></section><section class="finance-grid"><div>${panel('Invoice ageing',ageing,'A quick view of where collection attention is needed.')}</div><div>${panel('This month costs',expenseBreakdown,'Add every business cost for better decisions.')}</div></section>`;

    return `<section class="accounts-hero finance-v2633-hero"><div><small>FINANCE & ACCOUNTS CENTRE</small><h2>Know exactly what is owed, paid and spent</h2><p>Cash flow, invoice collection, expenses and forward planning in one control centre.</p></div><button class="primary" data-page="invoices">Open invoices</button></section>
      <section class="cards accounts-kpis">${card('Total invoiced',money(totalInvoiced),'All active invoices','invoices')}${card('Received',money(totalPaid),'Payments recorded','accounts')}${card('Outstanding',money(outstanding),`${money(overdue)} overdue`,'accounts')}${card('This month result',money(monthProfit),`${money(monthIncome)} in · ${money(monthExpenses)} out`,'accounts')}</section>${tabs}${body}`;
  }



  function businessIntelligenceView() {
    const monthsCount = Math.max(3, Math.min(12, Number(state.biMonths || 6)));
    const now = new Date();
    const monthKeys = Array.from({length:monthsCount}, (_,offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (monthsCount - 1 - offset), 1, 12);
      return { key:d.toISOString().slice(0,7), label:d.toLocaleDateString('en-GB',{month:'short'}), full:d.toLocaleDateString('en-GB',{month:'long',year:'numeric'}) };
    });
    const activeJobs = allJobRecords().filter(j => j.job_status !== 'Cancelled');
    const validInvoices = state.invoices.filter(i => i.status !== 'Cancelled');
    const monthData = monthKeys.map(m => {
      const jobs = activeJobs.filter(j => String(j.collection_date || j.delivered_at || j.created_at || '').slice(0,7) === m.key);
      const invoices = validInvoices.filter(i => String(i.issue_date || i.created_at || '').slice(0,7) === m.key);
      const paid = validInvoices.filter(i => String(i.paid_date || '').slice(0,7) === m.key).reduce((sum,i)=>sum+invoicePaid(i),0);
      const costs = state.expenses.filter(e => String(e.expense_date || e.created_at || '').slice(0,7) === m.key).reduce((sum,e)=>sum+Number(e.amount||0),0);
      const revenue = jobs.reduce((sum,j)=>sum+Number(j.total_price||j.quoted_price||0),0);
      return {...m,jobs:jobs.length,revenue,invoiced:invoices.reduce((sum,i)=>sum+Number(i.total||0),0),paid,costs,profit:paid-costs};
    });
    const current = monthData[monthData.length-1] || {revenue:0,paid:0,costs:0,profit:0,jobs:0};
    const previous = monthData[monthData.length-2] || {revenue:0,paid:0,costs:0,profit:0,jobs:0};
    const change = (a,b) => b ? ((a-b)/Math.abs(b))*100 : (a ? 100 : 0);
    const trendNote = (value,label='vs last month') => `${value>=0?'▲':'▼'} ${Math.abs(value).toFixed(0)}% ${label}`;
    const allRangeKeys = new Set(monthKeys.map(m=>m.key));
    const rangeJobs = activeJobs.filter(j=>allRangeKeys.has(String(j.collection_date||j.delivered_at||j.created_at||'').slice(0,7)));
    const delivered = rangeJobs.filter(j=>j.job_status==='Delivered'||j.delivered_at);
    const rangeQuotes = state.quotes.filter(q=>allRangeKeys.has(String(q.created_at||q.quote_date||'').slice(0,7)));
    const acceptedQuotes = rangeQuotes.filter(q=>String(q.status||'').toLowerCase()==='accepted');
    const quoteConversion = rangeQuotes.length ? acceptedQuotes.length/rangeQuotes.length*100 : 0;
    const completionRate = rangeJobs.length ? delivered.length/rangeJobs.length*100 : 0;
    const totalRangeRevenue = rangeJobs.reduce((s,j)=>s+Number(j.total_price||j.quoted_price||0),0);
    const avgJob = rangeJobs.length ? totalRangeRevenue/rangeJobs.length : 0;
    const miles = rangeJobs.reduce((s,j)=>s+Number(j.miles||j.mileage||0),0);
    const revenuePerMile = miles ? totalRangeRevenue/miles : 0;
    const customerStats = new Map();
    rangeJobs.forEach(j=>{ const key=j.customer_id||j.customer_name||j.contact_name||'Unknown'; const row=customerStats.get(key)||{name:j.customer_name||j.contact_name||'Unknown',jobs:0,revenue:0}; row.jobs++; row.revenue+=Number(j.total_price||j.quoted_price||0); customerStats.set(key,row); });
    const customers=[...customerStats.values()].sort((a,b)=>b.revenue-a.revenue);
    const repeatCustomers=customers.filter(c=>c.jobs>1).length;
    const repeatRate=customers.length?repeatCustomers/customers.length*100:0;
    const topCustomerShare=totalRangeRevenue&&customers[0]?customers[0].revenue/totalRangeRevenue*100:0;
    const vehicleStats=new Map();
    rangeJobs.forEach(j=>{const key=j.vehicle||j.vehicle_type||'Not set';const row=vehicleStats.get(key)||{jobs:0,revenue:0};row.jobs++;row.revenue+=Number(j.total_price||j.quoted_price||0);vehicleStats.set(key,row)});
    const vehiclesRank=[...vehicleStats.entries()].map(([name,v])=>({name,...v,average:v.jobs?v.revenue/v.jobs:0})).sort((a,b)=>b.revenue-a.revenue);
    const maxTrend=Math.max(1,...monthData.flatMap(m=>[m.revenue,m.paid,m.costs]));
    const trendChart=monthData.map(m=>`<article class="bi-month"><div class="bi-bars"><i class="booked" style="height:${Math.max(m.revenue?5:1,m.revenue/maxTrend*100)}%" title="Booked ${money(m.revenue)}"></i><i class="received" style="height:${Math.max(m.paid?5:1,m.paid/maxTrend*100)}%" title="Received ${money(m.paid)}"></i><i class="cost" style="height:${Math.max(m.costs?5:1,m.costs/maxTrend*100)}%" title="Costs ${money(m.costs)}"></i></div><b>${esc(m.label)}</b><small>${m.jobs} job${m.jobs===1?'':'s'}</small></article>`).join('');
    const maxCustomer=Math.max(1,...customers.slice(0,6).map(c=>c.revenue));
    const customerRows=customers.slice(0,6).map((c,idx)=>`<article class="bi-rank-row"><strong>${idx+1}</strong><span><b>${esc(c.name)}</b><small>${c.jobs} job${c.jobs===1?'':'s'} · ${money(c.revenue)}</small><i><em style="width:${c.revenue/maxCustomer*100}%"></em></i></span><mark>${totalRangeRevenue?(c.revenue/totalRangeRevenue*100).toFixed(0):0}%</mark></article>`).join('')||'<div class="fleet-empty">No customer revenue in this period.</div>';
    const vehicleRows=vehiclesRank.slice(0,6).map(v=>[esc(v.name),v.jobs,money(v.revenue),money(v.average)]);
    const overdue=validInvoices.filter(i=>invoiceBalance(i)>0&&i.due_date&&i.due_date<todayISO());
    const unassigned=state.jobs.filter(j=>!['Delivered','Cancelled'].includes(j.job_status)&&!j.assigned_driver_id);
    const forecastBase=monthData.slice(-3);
    const forecastRevenue=forecastBase.length?forecastBase.reduce((s,m)=>s+m.revenue,0)/forecastBase.length:0;
    const openPipeline=state.leads.filter(l=>!['Won','Lost'].includes(l.stage)).reduce((s,l)=>s+Number(l.value||0),0);
    const forecastWithPipeline=forecastRevenue+(openPipeline*.25);
    const insights=[];
    if(change(current.revenue,previous.revenue)<-10) insights.push({tone:'warn',title:'Booked revenue is falling',text:`Revenue is ${Math.abs(change(current.revenue,previous.revenue)).toFixed(0)}% below last month. Prioritise quote follow-ups and dormant customers.`,page:'pipeline'});
    if(quoteConversion<35&&rangeQuotes.length>=3) insights.push({tone:'warn',title:'Quote conversion needs attention',text:`Only ${quoteConversion.toFixed(0)}% of quotes were accepted across the selected period.`,page:'quotes'});
    if(topCustomerShare>40) insights.push({tone:'warn',title:'Customer concentration risk',text:`${customers[0]?.name||'The top customer'} represents ${topCustomerShare.toFixed(0)}% of booked revenue.`,page:'customers'});
    if(overdue.length) insights.push({tone:'danger',title:`${overdue.length} overdue invoice${overdue.length===1?'':'s'}`,text:`${money(overdue.reduce((s,i)=>s+invoiceBalance(i),0))} needs collection action.`,page:'accounts'});
    if(unassigned.length) insights.push({tone:'warn',title:`${unassigned.length} unassigned active job${unassigned.length===1?'':'s'}`,text:'Assign drivers early to protect service performance.',page:'dispatch'});
    if(!insights.length) insights.push({tone:'good',title:'Business indicators are healthy',text:'No major commercial or operational risks were detected from the current records.',page:'dashboard'});
    return `<section class="bi-hero"><div><small>BUSINESS INTELLIGENCE</small><h2>Turn your KLS data into decisions</h2><p>Live commercial performance, customer value, operational efficiency and forward outlook.</p></div><label>Trend window<select id="bi-months"><option value="3" ${monthsCount===3?'selected':''}>3 months</option><option value="6" ${monthsCount===6?'selected':''}>6 months</option><option value="9" ${monthsCount===9?'selected':''}>9 months</option><option value="12" ${monthsCount===12?'selected':''}>12 months</option></select></label></section>
      <section class="bi-kpis">${card('Booked this month',money(current.revenue),trendNote(change(current.revenue,previous.revenue)),'jobs')}${card('Cash received',money(current.paid),trendNote(change(current.paid,previous.paid)),'accounts')}${card('Cash result',money(current.profit),`${money(current.costs)} costs recorded`,'accounts')}${card('Average job',money(avgJob),`${money(revenuePerMile)} revenue per mile`,'jobs')}${card('Quote conversion',`${quoteConversion.toFixed(0)}%`,`${acceptedQuotes.length} accepted from ${rangeQuotes.length}`,'quotes')}${card('Completion rate',`${completionRate.toFixed(0)}%`,`${delivered.length} of ${rangeJobs.length} delivered`,'dispatch')}</section>
      <section class="bi-grid"><div class="panel bi-trend"><div class="panelhead"><div><h2>Commercial trend</h2><p>Booked revenue, cash received and operating costs.</p></div><div class="bi-legend"><span><i class="booked"></i>Booked</span><span><i class="received"></i>Received</span><span><i class="cost"></i>Costs</span></div></div><div class="bi-trend-chart">${trendChart}</div></div><div class="panel"><div class="panelhead"><div><h2>Decision alerts</h2><p>Automatically identified priorities.</p></div></div><div class="bi-insights">${insights.map(x=>`<button class="${x.tone}" data-page="${x.page}"><span>!</span><div><b>${esc(x.title)}</b><small>${esc(x.text)}</small></div><strong>→</strong></button>`).join('')}</div></div></section>
      <section class="bi-summary"><article><small>REPEAT CUSTOMER RATE</small><b>${repeatRate.toFixed(0)}%</b><p>${repeatCustomers} of ${customers.length} customers booked more than once.</p></article><article><small>TOP CUSTOMER SHARE</small><b>${topCustomerShare.toFixed(0)}%</b><p>${esc(customers[0]?.name||'No customer data')} concentration across selected months.</p></article><article><small>NEXT MONTH OUTLOOK</small><b>${money(forecastWithPipeline)}</b><p>Three-month run rate plus 25% of open sales pipeline.</p></article><article><small>OPEN PIPELINE</small><b>${money(openPipeline)}</b><p>Current value of active sales opportunities.</p></article></section>
      <section class="bi-grid lower"><div class="panel"><div class="panelhead"><div><h2>Customer value concentration</h2><p>Top customers ranked by booked revenue.</p></div><button class="secondary" data-page="customers">Open CRM</button></div><div class="bi-rank">${customerRows}</div></div><div>${panel('Vehicle performance',table(['Vehicle','Jobs','Revenue','Average'],vehicleRows),'Use this to identify the vehicle types producing the strongest returns.')}</div></section>`;
  }

  function profitCentreView() {
    const cfg = state.profitSettings || {};
    const fuelPrice = Number(cfg.fuelPrice || 0);
    const mpg = Math.max(1, Number(cfg.mpg || 25));
    const wearPerMile = Number(cfg.wearPerMile || 0);
    const hourlyCost = Number(cfg.hourlyCost || 0);
    const fixedJobCost = Number(cfg.fixedJobCost || 0);
    const targetMargin = Math.min(90, Math.max(1, Number(cfg.targetMargin || 30)));
    const getMiles = j => Number(j.distance_miles || j.route_miles || j.mileage || j.miles || 0);
    const getRevenue = j => Number(j.total_price || j.quoted_price || j.price || 0);
    const estimate = j => {
      const miles = getMiles(j), revenue = getRevenue(j);
      const hours = Math.max(.75, Number(j.duration_hours || j.estimated_hours || 0) || (miles / 35 + .75));
      const fuel = miles / mpg * 4.54609 * fuelPrice;
      const wear = miles * wearPerMile;
      const labour = hours * hourlyCost;
      const cost = fuel + wear + labour + fixedJobCost;
      const profit = revenue - cost;
      const margin = revenue > 0 ? profit / revenue * 100 : 0;
      const recommended = cost / (1 - targetMargin / 100);
      return { ...j, miles, revenue, hours, fuel, wear, labour, cost, profit, margin, recommended };
    };
    const jobs = allJobRecords().filter(j => j.job_status !== 'Cancelled' && getRevenue(j) > 0).map(estimate).sort((a,b)=>String(b.collection_date||b.created_at||'').localeCompare(String(a.collection_date||a.created_at||'')));
    const totalRevenue = jobs.reduce((s,j)=>s+j.revenue,0), totalCost=jobs.reduce((s,j)=>s+j.cost,0), totalProfit=jobs.reduce((s,j)=>s+j.profit,0);
    const avgMargin = totalRevenue ? totalProfit/totalRevenue*100 : 0;
    const weak = jobs.filter(j=>j.margin<targetMargin), loss = jobs.filter(j=>j.profit<0);
    const vehicleMap = new Map();
    jobs.forEach(j=>{const key=j.vehicle_required||j.vehicle_type||j.vehicle||'Not specified';const row=vehicleMap.get(key)||{jobs:0,revenue:0,cost:0,profit:0};row.jobs++;row.revenue+=j.revenue;row.cost+=j.cost;row.profit+=j.profit;vehicleMap.set(key,row)});
    const vehicleRows=[...vehicleMap.entries()].map(([name,v])=>[esc(name),v.jobs,money(v.revenue),money(v.profit),`${(v.revenue?v.profit/v.revenue*100:0).toFixed(1)}%`]);
    const jobRows=jobs.slice(0,30).map(j=>{const tone=j.profit<0?'loss':j.margin<targetMargin?'warn':'good';return [esc(j.job_number||'Job'),fmtDate(j.collection_date||j.created_at),esc(j.customer_name||'Customer'),`${j.miles.toFixed(0)} mi`,money(j.revenue),money(j.cost),`<span class="profit-pill ${tone}">${money(j.profit)} · ${j.margin.toFixed(0)}%</span>`,j.revenue<j.recommended?`<b>${money(j.recommended)}</b>`:'On target'];});
    return `<section class="profit-hero"><div><small>V26.38 JOB PROFIT CONTROL</small><h2>Know the true profit before accepting the price</h2><p>Estimated fuel, vehicle wear, labour and fixed costs are measured against every priced job.</p></div><button class="primary" data-page="newquote">Create profitable quote</button></section>
      <section class="profit-kpis">${card('Estimated revenue',money(totalRevenue),`${jobs.length} priced jobs`,'jobs')}${card('Estimated operating cost',money(totalCost),'Fuel, wear, labour and fixed cost','accounts')}${card('Estimated profit',money(totalProfit),avgMargin>=targetMargin?'On target':'Below target','profitcentre')}${card('Average margin',`${avgMargin.toFixed(1)}%`,`Target ${targetMargin}%`,'profitcentre')}${card('Weak-margin jobs',weak.length,'Below your target','profitcentre')}${card('Loss-making jobs',loss.length,loss.length?'Immediate review needed':'None detected','profitcentre')}</section>
      <section class="profit-layout"><div>${panel('Recent job profitability',table(['Job','Date','Customer','Miles','Revenue','Est. cost','Profit / margin','Safer minimum'],jobRows),'Costs are estimates based on the assumptions shown. Update them to match your actual operation.')}</div><aside>${panel('Cost assumptions',`<form id="profit-settings-form"><div class="grid two"><label>Fuel price per litre (£)<input name="fuelPrice" type="number" min="0" step="0.01" value="${fuelPrice}"></label><label>Vehicle MPG<input name="mpg" type="number" min="1" step="0.1" value="${mpg}"></label><label>Wear per mile (£)<input name="wearPerMile" type="number" min="0" step="0.01" value="${wearPerMile}"></label><label>Driver cost per hour (£)<input name="hourlyCost" type="number" min="0" step="0.01" value="${hourlyCost}"></label><label>Fixed cost per job (£)<input name="fixedJobCost" type="number" min="0" step="0.01" value="${fixedJobCost}"></label><label>Target margin (%)<input name="targetMargin" type="number" min="1" max="90" step="1" value="${targetMargin}"></label></div><button class="primary full-width">Save assumptions</button></form>`,'These settings are saved on this device and do not change customer prices automatically.')}${panel('Pricing warning',weak.length?`<div class="profit-warning"><b>${weak.length} job${weak.length===1?'':'s'} below target</b><p>${money(weak.reduce((s,j)=>s+Math.max(0,j.recommended-j.revenue),0))} extra revenue would have brought them up to the selected target margin.</p></div>`:'<div class="all-clear"><b>Prices are on target</b><span>No priced jobs fall below your selected margin.</span></div>')}</aside></section>
      ${panel('Vehicle profitability',table(['Vehicle','Jobs','Revenue','Estimated profit','Margin'],[...vehicleMap.entries()].map(([name,v])=>[esc(name),v.jobs,money(v.revenue),money(v.profit),`${(v.revenue?v.profit/v.revenue*100:0).toFixed(1)}%`])),'Use this to compare the commercial return from each vehicle type.')}`;
  }

  function businessReportsView() {
    const period = state.reportPeriod || todayISO().slice(0,7);
    const periodDate = new Date(`${period}-01T12:00:00`);
    const periodLabel = Number.isNaN(periodDate.getTime()) ? period : periodDate.toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    const inPeriod = value => String(value || '').slice(0,7) === period;
    const periodJobs = allJobRecords().filter(job => inPeriod(job.collection_date || job.delivered_at || job.created_at) && job.job_status !== 'Cancelled');
    const delivered = periodJobs.filter(job => job.job_status === 'Delivered' || job.delivered_at);
    const periodInvoices = state.invoices.filter(inv => inv.status !== 'Cancelled' && inPeriod(inv.issue_date || inv.created_at));
    const periodExpenses = state.expenses.filter(exp => inPeriod(exp.expense_date || exp.created_at));
    const bookedRevenue = periodJobs.reduce((sum,job)=>sum+Number(job.total_price || job.quoted_price || 0),0);
    const invoicedRevenue = periodInvoices.reduce((sum,inv)=>sum+Number(inv.total || 0),0);
    const received = state.invoices.filter(inv=>inv.status!=='Cancelled' && inPeriod(inv.paid_date)).reduce((sum,inv)=>sum+invoicePaid(inv),0);
    const expenses = periodExpenses.reduce((sum,exp)=>sum+Number(exp.amount || 0),0);
    const operatingProfit = received - expenses;
    const avgJob = periodJobs.length ? bookedRevenue / periodJobs.length : 0;
    const completionRate = periodJobs.length ? delivered.length / periodJobs.length * 100 : 0;
    const paidInvoices = periodInvoices.filter(inv=>invoiceBalance(inv)<=0).length;
    const paymentRate = periodInvoices.length ? paidInvoices / periodInvoices.length * 100 : 0;

    const customerMap = new Map();
    periodJobs.forEach(job=>{
      const key=job.customer_id || job.customer_name || job.contact_name || 'Unknown customer';
      const row=customerMap.get(key)||{name:job.customer_name||job.contact_name||'Unknown customer',jobs:0,revenue:0};
      row.jobs += 1; row.revenue += Number(job.total_price || job.quoted_price || 0); customerMap.set(key,row);
    });
    const topCustomers=[...customerMap.values()].sort((a,b)=>b.revenue-a.revenue).slice(0,8);
    const maxCustomer=Math.max(1,...topCustomers.map(row=>row.revenue));
    const customerRows=topCustomers.map(row=>`<div class="report-rank-row"><span><b>${esc(row.name)}</b><small>${row.jobs} job${row.jobs===1?'':'s'}</small></span><div><i style="width:${Math.max(4,row.revenue/maxCustomer*100)}%"></i></div><strong>${money(row.revenue)}</strong></div>`).join('') || '<div class="fleet-empty">No customer activity for this month.</div>';

    const vehicleMap = new Map();
    periodJobs.forEach(job=>{
      const key=job.vehicle || 'Not specified'; const row=vehicleMap.get(key)||{vehicle:key,jobs:0,revenue:0};
      row.jobs += 1; row.revenue += Number(job.total_price || job.quoted_price || 0); vehicleMap.set(key,row);
    });
    const vehicleRows=[...vehicleMap.values()].sort((a,b)=>b.revenue-a.revenue).map(row=>[
      esc(row.vehicle), row.jobs, money(row.revenue), money(row.jobs?row.revenue/row.jobs:0)
    ]);

    const categoryMap = new Map();
    periodExpenses.forEach(exp=>categoryMap.set(exp.category||'Other',(categoryMap.get(exp.category||'Other')||0)+Number(exp.amount||0)));
    const categoryRows=[...categoryMap.entries()].sort((a,b)=>b[1]-a[1]).map(([category,total])=>[esc(category),money(total),expenses?`${(total/expenses*100).toFixed(0)}%`:'0%']);

    const daysInMonth = new Date(periodDate.getFullYear(), periodDate.getMonth()+1, 0).getDate();
    const daily = Array.from({length:daysInMonth},(_,idx)=>({day:idx+1,revenue:0,jobs:0}));
    periodJobs.forEach(job=>{ const date=new Date(job.collection_date||job.delivered_at||job.created_at); if(!Number.isNaN(date.getTime())){ const bucket=daily[date.getDate()-1]; if(bucket){bucket.jobs++;bucket.revenue+=Number(job.total_price||job.quoted_price||0);} } });
    const maxDaily=Math.max(1,...daily.map(item=>item.revenue));
    const chart=daily.map(item=>`<div class="report-chart-bar" title="${item.day} ${periodLabel}: ${item.jobs} jobs, ${money(item.revenue)}"><i style="height:${Math.max(item.revenue?6:1,item.revenue/maxDaily*100)}%"></i><small>${item.day}</small></div>`).join('');

    return `<section class="reports-hero"><div><small>KLS BUSINESS INTELLIGENCE</small><h2>Business Reports</h2><p>Monthly performance, customers, vehicles, cash received and operating costs in one place.</p></div><div class="reports-actions"><label>Reporting month<input id="report-period" type="month" value="${esc(period)}"></label><button class="primary" data-export-report>Export CSV</button></div></section>
      <section class="reports-kpis">${card('Booked revenue',money(bookedRevenue),`${periodJobs.length} job${periodJobs.length===1?'':'s'}`,'jobs')}${card('Cash received',money(received),`${paymentRate.toFixed(0)}% invoice payment rate`,'accounts')}${card('Operating costs',money(expenses),`${periodExpenses.length} expense${periodExpenses.length===1?'':'s'}`,'accounts')}${card('Cash result',money(operatingProfit),operatingProfit>=0?'Positive after recorded costs':'Costs exceeded receipts','reports')}</section>
      <section class="reports-summary"><article><small>REPORTING PERIOD</small><h3>${esc(periodLabel)}</h3><p>${delivered.length} of ${periodJobs.length} jobs delivered · ${completionRate.toFixed(0)}% completion rate</p></article><article><small>AVERAGE JOB VALUE</small><h3>${money(avgJob)}</h3><p>${money(invoicedRevenue)} invoiced during the month</p></article><article><small>INVOICE COLLECTION</small><h3>${paymentRate.toFixed(0)}%</h3><p>${paidInvoices} of ${periodInvoices.length} invoices paid</p></article></section>
      <section class="reports-grid"><div>${panel('Revenue by day',`<div class="report-chart">${chart}</div>`,`Booked job value across ${periodLabel}.`)}</div><div>${panel('Top customers',`<div class="report-rank">${customerRows}</div>`,'Ranked by booked job value.')}</div></section>
      <section class="reports-grid reports-grid-lower"><div>${panel('Vehicle performance',table(['Vehicle','Jobs','Revenue','Average'],vehicleRows),'Shows which vehicle types generated the most work.')}</div><div>${panel('Expense breakdown',table(['Category','Total','Share'],categoryRows),'Only expenses recorded in Finance Centre are included.')}</div></section>`;
  }

  function customerMetrics(customer) {
    const quotes = state.quotes.filter(q => q.customer_id === customer.id);
    const jobs = allJobRecords().filter(j => j.customer_id === customer.id);
    const invoices = state.invoices.filter(i => i.customer_id === customer.id);
    const invoiced = invoices.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const paid = invoices.filter(item => item.status === 'Paid').reduce((sum, item) => sum + Number(item.total || 0), 0);
    const outstanding = invoices.filter(item => !['Paid','Cancelled'].includes(item.status)).reduce((sum, item) => sum + Number(item.total || 0), 0);
    const sortedJobs = [...jobs].sort((a,b) => new Date(b.collection_date || b.created_at || 0) - new Date(a.collection_date || a.created_at || 0));
    const lastJob = sortedJobs[0];
    const accepted = quotes.filter(item => item.status === 'Accepted').length;
    const averageJob = jobs.length ? jobs.reduce((sum,item)=>sum+Number(item.total_price || item.quoted_price || 0),0)/jobs.length : 0;
    const lastActivityDate = [lastJob?.collection_date || lastJob?.created_at, ...quotes.map(x=>x.created_at), ...invoices.map(x=>x.issue_date||x.created_at)].filter(Boolean).sort((a,b)=>new Date(b)-new Date(a))[0];
    const daysInactive = lastActivityDate ? Math.max(0,Math.floor((Date.now()-new Date(lastActivityDate).getTime())/86400000)) : 999;
    let health = 'Inactive', healthClass = 'inactive';
    if (outstanding > Math.max(500,invoiced*.35)) { health='Needs attention'; healthClass='attention'; }
    else if (daysInactive <= 45 && jobs.length >= 3) { health='Excellent'; healthClass='excellent'; }
    else if (daysInactive <= 120 || quotes.length) { health='Good'; healthClass='good'; }
    const conversion = quotes.length ? Math.round(accepted/quotes.length*100) : 0;
    return { quotes, jobs, invoices, invoiced, paid, outstanding, lastJob, accepted, averageJob, lastActivityDate, daysInactive, health, healthClass, conversion };
  }

  function customersView() {
    const enriched = state.customers.map(customer => ({ customer, metrics: customerMetrics(customer) }))
      .sort((a,b) => b.metrics.invoiced - a.metrics.invoiced || String(a.customer.company).localeCompare(String(b.customer.company)));
    const totalRevenue = enriched.reduce((sum,row) => sum + row.metrics.invoiced, 0);
    const totalOutstanding = enriched.reduce((sum,row) => sum + row.metrics.outstanding, 0);
    const activeCustomers = enriched.filter(row => row.metrics.daysInactive <= 120).length;
    const attention = enriched.filter(row => row.metrics.healthClass === 'attention').length;
    const topCustomer = enriched[0];
    const rows = enriched.map(({customer:c, metrics:m}) => `<tr data-customer-row data-customer="${c.id}" tabindex="0"><td><div class="crm-company-cell"><span class="avatar">${esc((c.company || '?')[0].toUpperCase())}</span><span><b>${esc(c.company)}</b><small>${esc(c.contact_name || 'No contact name')}</small></span></div></td><td>${esc(c.phone || '—')}<small>${esc(c.email || '')}</small></td><td><span class="crm-health ${m.healthClass}">${esc(m.health)}</span></td><td>${m.jobs.length}</td><td>${money(m.invoiced)}</td><td class="${m.outstanding?'warning-text':''}">${money(m.outstanding)}</td><td>${m.lastActivityDate?fmtDate(m.lastActivityDate):'—'}</td><td><button class="secondary crm-row-open" data-customer="${c.id}">Open</button></td></tr>`).join('');
    return `<section class="crm-hero"><div><small>V26.24 CUSTOMER MANAGEMENT</small><h2>Customer CRM</h2><p>Manage every customer, account balance, quote, job and relationship from one place.</p></div><button class="primary" data-action="new-customer">＋ Add Customer</button></section>
      <section class="crm-kpis">${card('Total customers', state.customers.length, `${activeCustomers} active in 120 days`, '')}${card('Lifetime revenue', money(totalRevenue), 'Total invoices raised', '')}${card('Outstanding', money(totalOutstanding), `${attention} account${attention===1?'':'s'} need attention`, 'invoices')}${card('Top customer', topCustomer ? esc(topCustomer.customer.company) : '—', topCustomer ? money(topCustomer.metrics.invoiced) : 'No revenue yet', '')}</section>
      ${panel('Customer accounts', `<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>Customer</th><th>Contact</th><th>Health</th><th>Jobs</th><th>Revenue</th><th>Outstanding</th><th>Last activity</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="8"><div class="empty">No customers yet.</div></td></tr>'}</tbody></table></div>${customerModal()}`, 'Select a customer to open their complete 360° profile.', '<div class="customer-tools"><label class="search">Search <input id="customer-search" placeholder="Company, contact, phone or email"></label><select id="customer-health-filter"><option value="">All customer health</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="attention">Needs attention</option><option value="inactive">Inactive</option></select><button class="primary" data-action="new-customer">＋ Add Customer</button></div>')}`;
  }

  function customerModal() {
    const c = state.customers.find(x => x.id === state.selectedCustomerId);
    if (!c && !state.selectedCustomerId) return '';
    const isNew = state.selectedCustomerId === 'new';
    const customer = c || { company:'', contact_name:'', phone:'', email:'', billing_address:'', payment_terms:7, notes:'' };
    const metrics = isNew ? {quotes:[],jobs:[],invoices:[],invoiced:0,paid:0,outstanding:0,lastJob:null,accepted:0,averageJob:0,health:'New',healthClass:'good',conversion:0,lastActivityDate:null} : customerMetrics(customer);
    const contacts = isNew ? [] : state.customerContacts.filter(x => x.customer_id === customer.id);
    const followups = isNew ? [] : state.customerFollowups.filter(x => x.customer_id === customer.id).sort((a,b)=>String(a.due_date||'').localeCompare(String(b.due_date||'')));
    const activity = [
      ...metrics.quotes.map(item => ({date:item.created_at, type:'Quote', title:item.quote_number, value:item.quoted_price, status:item.status})),
      ...metrics.jobs.map(item => ({date:item.collection_date || item.created_at, type:'Job', title:item.job_number || 'Job', value:item.total_price, status:item.job_status})),
      ...metrics.invoices.map(item => ({date:item.issue_date || item.created_at, type:'Invoice', title:item.invoice_number, value:item.total, status:item.status}))
    ].sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0,20);
    const jobRows=metrics.jobs.slice().sort((a,b)=>new Date(b.collection_date||0)-new Date(a.collection_date||0)).slice(0,8).map(j=>[esc(j.job_number||'Job'),fmtDate(j.collection_date),esc(j.collection_address||'—'),esc(j.delivery_address||'—'),esc(j.job_status||'Booked'),money(j.total_price||j.quoted_price)]);
    const quoteRows=metrics.quotes.slice().sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,8).map(q=>[esc(q.quote_number||'Quote'),fmtDate(q.created_at),esc(q.status||'Draft'),money(q.quoted_price)]);
    const invoiceRows=metrics.invoices.slice().sort((a,b)=>new Date(b.issue_date||b.created_at||0)-new Date(a.issue_date||a.created_at||0)).slice(0,8).map(i=>[esc(i.invoice_number||'Invoice'),fmtDate(i.issue_date||i.created_at),esc(i.status||'Draft'),money(i.total)]);
    return `<div class="modalback" data-action="customer-close"><section class="customermodal crm-modal crm-v24-modal" onclick="event.stopPropagation()"><div class="modalhead"><div><small>${isNew ? 'NEW CUSTOMER' : 'CUSTOMER 360° PROFILE'}</small><h2>${esc(customer.company || 'Add customer')}</h2>${!isNew ? `<p>${esc(customer.contact_name || '')}${customer.phone ? ` · ${esc(customer.phone)}` : ''} <span class="crm-health ${metrics.healthClass}">${esc(metrics.health)}</span></p>` : ''}</div><button data-action="customer-close">×</button></div>
      ${isNew ? '' : `<div class="crm-profile-actions"><button class="primary" data-new-quote-customer="${customer.id}">＋ New Quote</button>${metrics.lastJob?`<button class="secondary" data-repeat-customer-job="${metrics.lastJob.id}">Repeat Last Job</button>`:''}${customer.phone ? `<a class="secondary button-link" href="tel:${esc(customer.phone)}">Call</a><a class="secondary button-link" target="_blank" rel="noopener" href="https://wa.me/${esc(String(customer.phone).replace(/\D/g,'').replace(/^0/,'44'))}">WhatsApp</a>` : ''}${customer.email ? `<a class="secondary button-link" href="mailto:${esc(customer.email)}">Email</a>` : ''}</div>`}
      <form id="customer-form"><div class="grid two"><label>Company *<input name="company" required value="${esc(customer.company)}"></label><label>Main contact<input name="contact_name" value="${esc(customer.contact_name || '')}"></label><label>Telephone<input name="phone" value="${esc(customer.phone || '')}"></label><label>Email<input name="email" type="email" value="${esc(customer.email || '')}"></label><label>Billing address<textarea name="billing_address">${esc(customer.billing_address || '')}</textarea></label><label>Payment terms (days)<input name="payment_terms" type="number" min="0" value="${Number(customer.payment_terms || 7)}"></label><label>Account status<select name="account_status">${['Active','Prospect','On hold','Inactive'].map(x=>`<option ${customer.account_status===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Preferred vehicle<select name="preferred_vehicle"><option value="">Not set</option>${Object.keys(vehicles).map(x=>`<option ${customer.preferred_vehicle===x?'selected':''}>${x}</option>`).join('')}</select></label></div><label>Customer tags<input name="tags" value="${esc(customer.tags || '')}" placeholder="Trade, Priority, Film & TV"></label><label>Relationship notes<textarea name="notes" placeholder="Usual routes, buying preferences, site instructions, follow-ups or agreed rates">${esc(customer.notes || '')}</textarea></label><div class="actions"><button type="button" class="secondary" data-action="customer-close">Cancel</button><button class="primary">${isNew ? 'Save Customer' : 'Save Changes'}</button></div></form>
      ${isNew ? '' : `<div class="customerstats crm-profile-stats"><div><small>Total invoiced</small><b>${money(metrics.invoiced)}</b></div><div><small>Paid</small><b>${money(metrics.paid)}</b></div><div><small>Outstanding</small><b>${money(metrics.outstanding)}</b></div><div><small>Jobs</small><b>${metrics.jobs.length}</b></div><div><small>Average job</small><b>${money(metrics.averageJob)}</b></div><div><small>Quote conversion</small><b>${metrics.conversion}%</b></div></div>
      <div class="crm-record-sections"><details open><summary>Activity timeline <span>${activity.length}</span></summary><div class="crm-timeline">${activity.map(item => `<div class="crm-event"><span>${esc(item.type)}</span><div><b>${esc(item.title || item.type)}</b><small>${fmtDate(item.date)} · ${esc(item.status || '')}</small></div><strong>${money(item.value)}</strong></div>`).join('') || '<p class="muted">No customer activity yet.</p>'}</div></details><details><summary>Jobs <span>${metrics.jobs.length}</span></summary>${table(['Job','Date','Collection','Delivery','Status','Value'],jobRows)}</details><details><summary>Quotes <span>${metrics.quotes.length}</span></summary>${table(['Quote','Date','Status','Value'],quoteRows)}</details><details><summary>Invoices <span>${metrics.invoices.length}</span></summary>${table(['Invoice','Date','Status','Value'],invoiceRows)}</details></div>
      <div class="crm-v35-grid"><section class="crm-v35-card"><div class="crm-v35-head"><h3>Contacts</h3><span>${contacts.length}</span></div><form id="customer-contact-form" class="crm-mini-form"><input name="name" placeholder="Contact name" required><input name="role" placeholder="Role / department"><input name="phone" placeholder="Phone"><input name="email" type="email" placeholder="Email"><button class="secondary">Add contact</button></form><div class="crm-v35-list">${contacts.map(x=>`<article><div><b>${esc(x.name)}</b><small>${esc(x.role||'Contact')}</small></div><div><span>${esc(x.phone||'')}</span><span>${esc(x.email||'')}</span></div><button class="danger" data-contact-delete="${x.id}">Remove</button></article>`).join('')||'<p class="muted">No additional contacts saved.</p>'}</div></section><section class="crm-v35-card"><div class="crm-v35-head"><h3>Follow-ups</h3><span>${followups.filter(x=>!x.completed_at).length} open</span></div><form id="customer-followup-form" class="crm-mini-form"><input name="title" placeholder="Call, email or chase quote" required><input name="due_date" type="date" value="${todayISO()}" required><textarea name="notes" placeholder="Follow-up notes"></textarea><button class="secondary">Add follow-up</button></form><div class="crm-v35-list">${followups.map(x=>`<article class="${x.completed_at?'done':''}"><div><b>${esc(x.title)}</b><small>${fmtDate(x.due_date)}${x.notes?` · ${esc(x.notes)}`:''}</small></div><button class="${x.completed_at?'secondary':'primary'}" data-followup-toggle="${x.id}">${x.completed_at?'Reopen':'Complete'}</button><button class="danger" data-followup-delete="${x.id}">Remove</button></article>`).join('')||'<p class="muted">No follow-ups scheduled.</p>'}</div></section></div><div class="crm-account crm-account-wide"><h3>Account summary</h3><div class="crm-account-grid"><p><span>Payment terms</span><b>${Number(customer.payment_terms || 7)} days</b></p><p><span>Last activity</span><b>${metrics.lastActivityDate ? fmtDate(metrics.lastActivityDate) : '—'}</b></p><p><span>Last job status</span><b>${metrics.lastJob ? esc(metrics.lastJob.job_status || 'Booked') : '—'}</b></p><p><span>Outstanding balance</span><b>${money(metrics.outstanding)}</b></p></div><h3>Relationship notes</h3><div class="crm-notes">${esc(customer.notes || 'No relationship notes saved.')}</div></div>`}
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
    const paidTotal = state.portalInvoices.reduce((sum, inv) => sum + Math.max(0, Number(inv.total||0)-invoiceBalance(inv)), 0);
    const lifetimeSpend = state.portalInvoices.reduce((sum, inv) => sum + Number(inv.total||0), 0);
    const docs = state.portalJobs.filter(j=>j.pod_photo_url || j.pod_signature_url).slice(0,8);
    const portalQuotes = state.portalQuotes.slice(0,8);
    const portalMessages = state.portalMessages.slice(0,8);
    return `<div class="portal-shell"><header class="portal-top"><div class="portal-brand"><b>KLS</b><span>SameDay Customer Portal</span></div><div><strong>${esc(customer.company || state.user?.email || 'Customer')}</strong><button class="secondary" data-action="portal-signout">Sign out</button></div></header><main class="portal-main">
      ${state.notice ? `<div class="notice ${state.notice.type}">${esc(state.notice.text)}<button data-action="notice-close">×</button></div>` : ''}
      <section class="portal-hero"><div><small>WELCOME TO KLS SAMEDAY</small><h1>${esc(customer.company || 'Your account')}</h1><p>Book collections, follow active deliveries and access your account documents.</p></div><button class="primary" data-action="portal-book-focus">＋ Book a collection</button></section>
      <section class="portal-kpis">${card('Active jobs',active.length,'Currently in progress')}${card('Completed jobs',completed.length,'Delivery history')}${card('Outstanding',money(outstanding),`${state.portalInvoices.filter(i=>invoiceBalance(i)>0).length} invoice${state.portalInvoices.filter(i=>invoiceBalance(i)>0).length===1?'':'s'}`)}${card('Booking requests',state.portalBookings.filter(b=>b.status==='Pending').length,'Awaiting office approval')}${card('Lifetime spend',money(lifetimeSpend),'Account total')}</section>
      <section class="portal-grid"><div>
        ${panel('Book a collection', `<form id="portal-booking-form"><div class="portal-form-section"><h3>Collection and delivery</h3><div class="grid two"><label>Collection date<input name="collection_date" type="date" min="${todayISO()}" value="${todayISO()}" required></label><label>Ready time<input name="collection_time" type="time"></label><label>Required delivery date<input name="required_delivery_date" type="date" min="${todayISO()}"></label><label>Required delivery time<input name="required_delivery_time" type="time"></label><label>Saved collection address<select data-fill-address="collection_address"><option value="">Choose saved address</option>${state.portalAddresses.map(a=>`<option value="${esc(a.address)}">${esc(a.label)}</option>`).join('')}</select></label><label>Saved delivery address<select data-fill-address="delivery_address"><option value="">Choose saved address</option>${state.portalAddresses.map(a=>`<option value="${esc(a.address)}">${esc(a.label)}</option>`).join('')}</select></label><label>Collection address<textarea name="collection_address" required></textarea></label><label>Delivery address<textarea name="delivery_address" required></textarea></label></div></div><div class="portal-form-section"><h3>Load details</h3><div class="grid two"><label>Vehicle required<select name="vehicle">${Object.keys(vehicles).map(v=>`<option>${v}</option>`).join('')}</select></label><label>Approximate weight (kg)<input name="weight_kg" type="number" min="0" step="1"></label><label>Dimensions / pallet count<input name="dimensions" placeholder="e.g. 2 pallets or 120 × 80 × 100 cm"></label><label>Collection contact<input name="collection_contact"></label><label>Delivery contact<input name="delivery_contact"></label><label>Contact telephone<input name="contact_phone" value="${esc(customer.phone || '')}"></label><label>Load description<textarea name="load_description"></textarea></label><label>Special instructions<textarea name="special_instructions"></textarea></label></div></div><div class="actions"><button class="primary">Submit booking request</button></div></form>`, 'The KLS office will review the request, confirm the price and assign the correct vehicle.')}
        ${panel('Your jobs', recentJobs.length ? `<div class="portal-job-list">${recentJobs.map(j=>`<article><div><b>${esc(j.job_number||'Job')}</b>${portalStatusBadge(j.job_status)}</div><h3>${fmtDate(j.collection_date)} ${esc(String(j.collection_time||'').slice(0,5))}</h3><p><small>COLLECT</small>${esc(j.collection_address||'')}</p><p><small>DELIVER</small>${esc(j.delivery_address||'')}</p><footer>${j.tracking_token ? `<a class="secondary button-link" href="?track=${encodeURIComponent(j.tracking_token)}">Track job</a>` : ''}${j.pod_photo_url ? `<a class="secondary button-link" href="${esc(j.pod_photo_url)}" target="_blank" rel="noopener">View POD</a>` : ''}<button class="secondary" data-portal-rebook="${j.id}">Rebook</button></footer></article>`).join('')}</div>` : '<div class="fleet-empty">No jobs are visible on your account yet.</div>', 'Live and completed deliveries.')}
      </div><aside class="portal-side">
        ${panel('Booking requests', requests.length ? `<div class="portal-request-list">${requests.map(b=>`<p><span><b>${fmtDate(b.collection_date)}</b><small>${esc(b.collection_address)} → ${esc(b.delivery_address)}</small></span>${portalStatusBadge(b.status)}</p>`).join('')}</div>` : '<div class="fleet-empty">No booking requests yet.</div>')}
        ${panel('Quotes', portalQuotes.length ? `<div class="portal-quote-list">${portalQuotes.map(q=>`<article><div><span><b>${esc(q.quote_number||'Quotation')}</b><small>${fmtDate(q.created_at)} · ${esc(q.status||'Sent')}</small></span><strong>${money(q.total_price||q.total||0)}</strong></div><p>${esc(q.collection_address||'')} → ${esc(q.delivery_address||'')}</p><footer>${['Accepted','Declined'].includes(q.status)?portalStatusBadge(q.status):`<button class="primary" data-portal-quote="${q.id}" data-status="Accepted">Accept</button><button class="danger" data-portal-quote="${q.id}" data-status="Declined">Decline</button>`}</footer></article>`).join('')}</div>` : '<div class="fleet-empty">No quotations available.</div>', 'Review and respond to quotations online.')}
        ${panel('Invoices', state.portalInvoices.length ? `<div class="portal-invoice-list">${state.portalInvoices.slice(0,10).map(inv=>`<p><span><b>${esc(inv.invoice_number||'Invoice')}</b><small>Due ${fmtDate(inv.due_date)}</small></span><strong>${money(invoiceBalance(inv))}</strong><button class="secondary portal-invoice-print" data-portal-invoice="${inv.id}">Print / PDF</button></p>`).join('')}</div>` : '<div class="fleet-empty">No invoices available.</div>', `Outstanding balance ${money(outstanding)}`)}
        ${panel('Favourite routes', `<form id="portal-route-form"><label>Route name<input name="label" placeholder="Colchester to Birmingham" required></label><label>Collection address<textarea name="collection_address" required></textarea></label><label>Delivery address<textarea name="delivery_address" required></textarea></label><div class="actions"><button class="primary">Save route</button></div></form>${state.portalFavouriteRoutes.length?`<div class="portal-address-list">${state.portalFavouriteRoutes.map(r=>`<article><span><b>${esc(r.label)}</b><small>${esc(r.collection_address)} → ${esc(r.delivery_address)}</small></span><div><button class="secondary" data-use-route="${r.id}">Use</button><button class="danger" data-delete-route="${r.id}">×</button></div></article>`).join('')}</div>`:'<div class="fleet-empty">No favourite routes yet.</div>'}`, 'Save regular journeys for one-click booking.')}
        ${panel('Documents', docs.length?`<div class="portal-invoice-list">${docs.map(j=>`<p><span><b>${esc(j.job_number||'POD')}</b><small>${fmtDate(j.collection_date)} · Delivered</small></span><a class="secondary button-link" href="${esc(j.pod_photo_url)}" target="_blank" rel="noopener">Open POD</a></p>`).join('')}</div>`:'<div class="fleet-empty">No POD documents available yet.</div>', `${docs.length} POD document${docs.length===1?'':'s'}`)}
        ${panel('Account summary', `<div class="portal-help"><p>Payment terms <b>${esc(String(customer.payment_terms||state.settings.default_terms||7))} days</b></p><p>Lifetime spend <b>${money(lifetimeSpend)}</b></p><p>Payments recorded <b>${money(paidTotal)}</b></p><p>Outstanding <b>${money(outstanding)}</b></p></div>`)}
        ${panel('Saved addresses', `<form id="portal-address-form"><label>Address name<input name="label" placeholder="Main warehouse" required></label><label>Full address<textarea name="address" required></textarea></label><div class="actions"><button class="primary">Save address</button></div></form>${state.portalAddresses.length?`<div class="portal-address-list">${state.portalAddresses.map(a=>`<article><span><b>${esc(a.label)}</b><small>${esc(a.address)}</small></span><button class="danger" data-delete-address="${a.id}">×</button></article>`).join('')}</div>`:'<div class="fleet-empty">No saved addresses yet.</div>'}`, 'Use saved locations to make repeat bookings faster.')}
        ${panel('Messages', `<form id="portal-message-form"><label>Subject<input name="subject" required placeholder="How can we help?"></label><label>Message<textarea name="message" required></textarea></label><div class="actions"><button class="primary">Send to KLS</button></div></form>${portalMessages.length?`<div class="portal-message-list">${portalMessages.map(m=>`<article><div><b>${esc(m.subject||'Message')}</b><small>${fmtDate(m.created_at)} · ${esc(m.sender_type==='office'?'KLS SameDay':'You')}</small></div><p>${esc(m.message||'')}</p></article>`).join('')}</div>`:'<div class="fleet-empty">No messages yet.</div>'}`, 'Keep customer queries linked to the account.')}
        ${panel('Need help?', `<div class="portal-help"><p><a href="tel:${esc(String(state.settings.phone||'').replace(/\s/g,''))}">Call <b>${esc(state.settings.phone)}</b></a></p><p><a href="https://wa.me/44${esc(String(state.settings.whatsapp||'').replace(/\D/g,'').replace(/^0/,''))}" target="_blank" rel="noopener">WhatsApp <b>${esc(state.settings.whatsapp)}</b></a></p><p><a href="mailto:${esc(state.settings.email)}">Email <b>${esc(state.settings.email)}</b></a></p></div>`)}
      </aside></section></main></div>`;
  }

  function bindCustomerPortal() {
    document.querySelector('[data-action="portal-signout"]')?.addEventListener('click', async()=>{ await db.auth.signOut(); state.user=null; state.portalUser=null; state.portalCustomer=null; state.loading=false; render(); });
    document.querySelector('[data-action="notice-close"]')?.addEventListener('click',()=>{state.notice=null;render();});
    document.querySelector('[data-action="portal-book-focus"]')?.addEventListener('click',()=>document.querySelector('#portal-booking-form input')?.focus());
    document.querySelectorAll('[data-fill-address]').forEach(select=>select.addEventListener('change',()=>{ const target=document.querySelector(`[name="${select.dataset.fillAddress}"]`); if(target && select.value) target.value=select.value; }));

    document.getElementById('portal-route-form')?.addEventListener('submit', e=>{e.preventDefault();const form=Object.fromEntries(new FormData(e.currentTarget));state.portalFavouriteRoutes.unshift({...form,id:crypto.randomUUID()});localStorage.setItem('kls_portal_routes',JSON.stringify(state.portalFavouriteRoutes));showNotice('Favourite route saved.','ok');render();});
    document.querySelectorAll('[data-use-route]').forEach(btn=>btn.addEventListener('click',()=>{const r=state.portalFavouriteRoutes.find(x=>x.id===btn.dataset.useRoute);if(!r)return;document.querySelector('[name="collection_address"]').value=r.collection_address;document.querySelector('[name="delivery_address"]').value=r.delivery_address;document.querySelector('#portal-booking-form')?.scrollIntoView({behavior:'smooth'});}));
    document.querySelectorAll('[data-delete-route]').forEach(btn=>btn.addEventListener('click',()=>{state.portalFavouriteRoutes=state.portalFavouriteRoutes.filter(x=>x.id!==btn.dataset.deleteRoute);localStorage.setItem('kls_portal_routes',JSON.stringify(state.portalFavouriteRoutes));showNotice('Favourite route removed.','ok');render();}));
    document.getElementById('portal-address-form')?.addEventListener('submit', async e=>{ e.preventDefault(); try{ const form=Object.fromEntries(new FormData(e.currentTarget)); const payload={...form,customer_id:state.portalCustomer.id,owner_id:state.portalUser.owner_id,auth_user_id:state.user.id}; const {data,error}=await db.from('customer_addresses').insert(payload).select().single(); if(error)throw error; state.portalAddresses.push(data); showNotice('Address saved.','ok'); render(); }catch(error){showNotice(error.message,'error');render();} });
    document.querySelectorAll('[data-delete-address]').forEach(btn=>btn.addEventListener('click',async()=>{ if(!confirm('Remove this saved address?'))return; const {error}=await db.from('customer_addresses').delete().eq('id',btn.dataset.deleteAddress); if(error)showNotice(error.message,'error'); else {state.portalAddresses=state.portalAddresses.filter(a=>a.id!==btn.dataset.deleteAddress);showNotice('Address removed.','ok');} render(); }));
    document.getElementById('portal-booking-form')?.addEventListener('submit', async e=>{
      e.preventDefault();
      try {
        const form=Object.fromEntries(new FormData(e.currentTarget));
        const payload={...form,customer_id:state.portalCustomer.id,owner_id:state.portalUser.owner_id,auth_user_id:state.user.id,status:'Pending'};
        const {data,error}=await db.from('portal_bookings').insert(payload).select().single();
        if(error)throw error;
        state.portalBookings.unshift(data); showNotice('Booking request sent to KLS SameDay.','ok'); render();
      } catch(error){showNotice(error.message,'error');render();}
    });
    document.querySelectorAll('[data-portal-rebook]').forEach(btn=>btn.addEventListener('click', async()=>{
      const job=state.portalJobs.find(j=>j.id===btn.dataset.portalRebook); if(!job)return;
      try{const payload={owner_id:state.portalUser.owner_id,customer_id:state.portalCustomer.id,auth_user_id:state.user.id,collection_date:todayISO(),collection_time:job.collection_time||null,collection_address:job.collection_address,delivery_address:job.delivery_address,vehicle:job.vehicle||'Luton Tail Lift',load_description:`Rebook of ${job.job_number||'previous job'}`,status:'Pending'};const{data,error}=await db.from('portal_bookings').insert(payload).select().single();if(error)throw error;state.portalBookings.unshift(data);showNotice('Rebooking request sent. Choose the final date with the office if needed.','ok');render();}catch(error){showNotice(error.message,'error');render();}
    }));
    document.querySelectorAll('[data-portal-quote]').forEach(btn=>btn.addEventListener('click',async()=>{try{const status=btn.dataset.status;const {error}=await db.from('quotes').update({status}).eq('id',btn.dataset.portalQuote);if(error)throw error;const quote=state.portalQuotes.find(q=>q.id===btn.dataset.portalQuote);if(quote)quote.status=status;showNotice(`Quotation ${status.toLowerCase()}.`,'ok');render();}catch(error){showNotice(error.message,'error');render();}}));
    document.querySelectorAll('[data-portal-invoice]').forEach(btn=>btn.addEventListener('click',()=>{const inv=state.portalInvoices.find(i=>i.id===btn.dataset.portalInvoice);if(inv)printDocument(inv,'invoice');}));
    document.getElementById('portal-message-form')?.addEventListener('submit',async e=>{e.preventDefault();try{const form=Object.fromEntries(new FormData(e.currentTarget));const payload={owner_id:state.portalUser.owner_id,customer_id:state.portalCustomer.id,auth_user_id:state.user.id,sender_type:'customer',subject:form.subject,message:form.message};const {data,error}=await db.from('portal_messages').insert(payload).select().single();if(error)throw error;state.portalMessages.unshift(data);showNotice('Message sent to KLS SameDay.','ok');render();}catch(error){showNotice(error.message,'error');render();}});
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



  function aiDriverSuggestion(job) {
    const active = state.jobs.filter(j => !['Delivered','Cancelled'].includes(j.job_status));
    const drivers = state.drivers.filter(d => d.active !== false);
    if (!drivers.length) return null;
    const wanted = String(job.vehicle || job.vehicle_required || '').toLowerCase();
    return drivers.map(driver => {
      const workload = active.filter(j => j.assigned_driver_id === driver.id).length;
      const availability = String(driver.availability_status || 'Available').toLowerCase();
      const driverVehicle = String(driver.vehicle || '').toLowerCase();
      let score = 100 - workload * 18;
      if (availability.includes('available') || availability.includes('online')) score += 25;
      if (availability.includes('off') || availability.includes('unavailable')) score -= 80;
      if (wanted && driverVehicle && (driverVehicle.includes(wanted) || wanted.includes(driverVehicle))) score += 35;
      else if (wanted && driverVehicle) score -= 12;
      return { driver, workload, score };
    }).sort((a,b)=>b.score-a.score)[0];
  }

  function aiDispatchAlerts() {
    const now = new Date();
    const alerts = [];
    state.jobs.filter(j => !['Delivered','Cancelled'].includes(j.job_status)).forEach(job => {
      if (!job.assigned_driver_id) alerts.push({type:'urgent',title:`${job.job_number||'Job'} is unassigned`,detail:job.collection_address||'Collection address not entered',job});
      const date = String(job.collection_date||'').slice(0,10);
      const time = String(job.collection_time||'09:00').slice(0,5);
      if (date) {
        const due = new Date(`${date}T${time}:00`);
        if (Number.isFinite(due.getTime()) && due < now && ['Booked','Pending','Quoted'].includes(job.job_status||'Booked')) alerts.push({type:'late',title:`${job.job_number||'Job'} may be late`,detail:`Collection was due ${due.toLocaleString('en-GB')}`,job});
      }
    });
    state.jobs.filter(j => j.job_status === 'Delivered' && !j.pod_photo_url && !j.pod_signature_url).forEach(job => alerts.push({type:'pod',title:`POD missing for ${job.job_number||'job'}`,detail:job.customer_name||'Customer',job}));
    return alerts.slice(0,12);
  }

  function aiDispatchAssistantView() {
    const today = todayISO();
    const todayJobs = state.jobs.filter(j => String(j.collection_date||'').slice(0,10) === today);
    const activeJobs = state.jobs.filter(j => !['Delivered','Cancelled'].includes(j.job_status));
    const unassigned = activeJobs.filter(j => !j.assigned_driver_id);
    const availableDrivers = state.drivers.filter(d => d.active !== false && !String(d.availability_status||'').toLowerCase().includes('off'));
    const alerts = aiDispatchAlerts();
    const revenue = todayJobs.reduce((sum,j)=>sum+Number(j.total_price||j.quoted_price||0),0);
    const completed = todayJobs.filter(j=>j.job_status==='Delivered');
    const onTime = completed.length ? Math.round(completed.filter(j=>!j.delivered_at || !j.delivery_date || new Date(j.delivered_at) <= new Date(`${String(j.delivery_date).slice(0,10)}T${String(j.delivery_time||'23:59').slice(0,5)}:00`)).length/completed.length*100) : 100;
    const recommendations = unassigned.slice(0,10).map(job => ({job,suggestion:aiDriverSuggestion(job)}));
    const recommendationRows = recommendations.length ? recommendations.map(({job,suggestion})=>{
      const estimate=smartRecommendation(job);
      return `<article class="ai-recommendation"><div class="ai-route"><small>${esc(job.job_number||'JOB')}</small><b>${esc(job.customer_name||'Customer')}</b><p>${esc(job.collection_address||'Collection not entered')} <span>→</span> ${esc(job.delivery_address||'Delivery not entered')}</p></div><div class="ai-profit"><small>EST. PROFIT</small><b>${money(estimate.profit)}</b><span>${estimate.margin.toFixed(0)}% margin</span></div><div class="ai-driver"><small>BEST DRIVER</small><b>${esc(suggestion?.driver?.name||'No driver available')}</b><span>${suggestion?`${esc(suggestion.driver.vehicle||'Vehicle not set')} · ${suggestion.workload} active job(s)`:''}</span></div>${suggestion?`<button class="primary" data-ai-assign="${job.id}" data-driver-id="${suggestion.driver.id}">Assign</button>`:`<button class="secondary" data-page="drivers">Add driver</button>`}</article>`;
    }).join('') : '<div class="ai-all-clear"><span>✓</span><div><b>No unassigned jobs</b><small>Every active job currently has a driver.</small></div></div>';
    const alertRows = alerts.length ? alerts.map(a=>`<button class="ai-alert ${a.type}" data-page="dispatch"><span>${a.type==='late'?'◷':a.type==='pod'?'▧':'!'}</span><div><b>${esc(a.title)}</b><small>${esc(a.detail)}</small></div></button>`).join('') : '<div class="ai-all-clear"><span>✓</span><div><b>Operations clear</b><small>No urgent dispatch warnings found.</small></div></div>';
    const workload = state.drivers.filter(d=>d.active!==false).map(d=>{const count=activeJobs.filter(j=>j.assigned_driver_id===d.id).length;return `<div class="ai-workload-row"><span><b>${esc(d.name)}</b><small>${esc(d.vehicle||'Vehicle not set')} · ${esc(d.availability_status||'Available')}</small></span><strong>${count} active</strong></div>`}).join('') || '<div class="fleet-empty">No drivers added yet.</div>';
    return `<section class="ai-hero"><div><small>V26.30 AI DISPATCH ASSISTANT</small><h2>Your live dispatch co-pilot</h2><p>Analyses workload, availability, vehicle suitability, deadlines and estimated profit to help you make faster dispatch decisions.</p></div><button class="primary" data-page="newquote">＋ Add work</button></section>
      <section class="ai-kpis">${card('Jobs today',todayJobs.length,'Collections scheduled today')}${card('Unassigned',unassigned.length,unassigned.length?'Needs attention':'All work allocated')}${card('Drivers available',availableDrivers.length,`${state.drivers.length} total drivers`)}${card('Revenue today',money(revenue),'Booked job value')}${card('On-time',`${onTime}%`,`${completed.length} completed today`)}</section>
      <section class="ai-command-grid"><div>${panel('Recommended assignments',`<div class="ai-recommendations">${recommendationRows}</div>`,'Suggestions are rule-based and should be checked before assignment.')}</div><aside>${panel('Priority alerts',`<div class="ai-alerts">${alertRows}</div>`,`${alerts.length} warning${alerts.length===1?'':'s'} detected`)}${panel('Driver workload',`<div class="ai-workload">${workload}</div>`,'Balanced using active assigned jobs.')}</aside></section>
      <section class="panel ai-guidance"><div><small>AI RECOMMENDATION</small><h3>${unassigned.length?`Assign ${esc(unassigned[0].job_number||'the next job')} before taking more work.`:'Current workload is under control.'}</h3><p>${alerts.length?`${alerts.length} operational item${alerts.length===1?' needs':'s need'} attention.`:'No urgent operational risks were detected.'}</p></div><button class="secondary" data-page="dispatch">Open Live Dispatch</button></section>`;
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
    const messages=state.portalMessages.length?`<div class="portal-admin-list">${state.portalMessages.map(message=>{const customer=state.customers.find(c=>c.id===message.customer_id);return `<article><div><span><b>${esc(message.subject||'Customer message')}</b><small>${esc(customer?.company||'Customer')} · ${fmtDate(message.created_at)} · ${message.sender_type==='office'?'Sent by KLS':'From customer'}</small></span></div><p>${esc(message.message||'')}</p>${message.sender_type!=='office'?`<form class="portal-reply-form" data-portal-reply="${message.id}"><label>Reply<textarea name="message" required placeholder="Write your reply to ${esc(customer?.company||'the customer')}"></textarea></label><button class="primary">Send reply</button></form>`:''}</article>`}).join('')}</div>`:'<div class="fleet-empty">No customer messages yet.</div>';
    return `<section class="fleet-hero"><div><small>V31.0.1 CUSTOMER PORTAL</small><h2>Customer Portal</h2><p>Review requests and messages sent directly by customer accounts.</p></div><strong>${pending.length} pending · ${state.portalMessages.filter(m=>m.sender_type!=='office').length} messages</strong></section>${panel('Customer requests',rows,'Approved requests create a confirmed job in your booking calendar.')}${panel('Customer messages',messages,'Replies appear inside the customer’s secure portal.')}`;
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


  function saveLeads(){ localStorage.setItem('kls_sales_leads', JSON.stringify(state.leads)); }
  function leadValue(lead){ return Number(lead.value || 0); }
  function salesPipelineView(){
    const stages=['New Lead','Contacted','Quote Requested','Quote Sent','Won','Lost'];
    const search=String(state.leadSearch||'').toLowerCase();
    const visible=state.leads.filter(l => (state.leadFilter==='all'||l.stage===state.leadFilter) && (!search||`${l.company} ${l.contact} ${l.email} ${l.phone}`.toLowerCase().includes(search)));
    const open=state.leads.filter(l=>!['Won','Lost'].includes(l.stage));
    const openValue=open.reduce((s,l)=>s+leadValue(l),0);
    const wonValue=state.leads.filter(l=>l.stage==='Won').reduce((s,l)=>s+leadValue(l),0);
    const due=state.leads.filter(l=>l.follow_up && l.follow_up<=todayISO() && !['Won','Lost'].includes(l.stage)).length;
    const columns=stages.map(stage=>{ const rows=visible.filter(l=>l.stage===stage); return `<section class="pipeline-column"><header><div><h3>${stage}</h3><small>${rows.length} lead${rows.length===1?'':'s'}</small></div><strong>${money(rows.reduce((s,l)=>s+leadValue(l),0))}</strong></header><div class="pipeline-cards">${rows.map(l=>`<article class="lead-card" data-lead-id="${l.id}"><div class="lead-card-top"><div><b>${esc(l.company)}</b><small>${esc(l.contact||'No contact')}</small></div><button class="icon-button" data-delete-lead="${l.id}" title="Delete">×</button></div><p>${esc(l.notes||'No notes added.')}</p><div class="lead-meta"><span>${money(l.value)}</span><span>${l.follow_up?`Follow up ${fmtDate(l.follow_up)}`:'No follow-up'}</span></div><label>Stage<select data-lead-stage="${l.id}">${stages.map(x=>`<option ${x===l.stage?'selected':''}>${x}</option>`).join('')}</select></label><div class="lead-actions">${l.phone?`<a href="tel:${esc(l.phone)}">Call</a>`:''}${l.email?`<a href="mailto:${esc(l.email)}">Email</a>`:''}<button data-lead-quote="${l.id}">New Quote</button></div></article>`).join('')||'<div class="pipeline-empty">No leads</div>'}</div></section>`}).join('');
    return `<section class="pipeline-hero"><div><small>SALES & GROWTH</small><h2>Sales Pipeline</h2><p>Track every prospect from first enquiry through to a paying customer.</p></div><button class="primary" data-new-lead>＋ Add Lead</button></section><section class="crm-kpis">${card('Open leads',open.length,'Active opportunities','')}${card('Pipeline value',money(openValue),'Estimated open value','')}${card('Won value',money(wonValue),'Converted business','')}${card('Follow-ups due',due,due?'Needs attention':'Nothing overdue','')}</section>${panel('Lead pipeline',`<div class="pipeline-toolbar"><input id="lead-search" placeholder="Search company, contact, phone or email" value="${esc(state.leadSearch)}"><select id="lead-filter"><option value="all">All stages</option>${stages.map(x=>`<option ${state.leadFilter===x?'selected':''}>${x}</option>`).join('')}</select><button class="primary" data-new-lead>＋ Add Lead</button></div><div class="pipeline-board">${columns}</div>${leadModal()}`,'Drag-free pipeline with clear stages and follow-up dates.')}`;
  }
  function leadModal(){ if(!state.editLeadId)return ''; const existing=state.leads.find(l=>l.id===state.editLeadId)||{}; return `<div class="modalback" data-close-lead><section class="customermodal crm-modal" onclick="event.stopPropagation()"><div class="modalhead"><div><small>SALES OPPORTUNITY</small><h2>${existing.id?'Edit lead':'Add new lead'}</h2></div><button data-close-lead>×</button></div><form id="lead-form"><input type="hidden" name="id" value="${esc(existing.id||'')}"><div class="grid two"><label>Company<input name="company" required value="${esc(existing.company||'')}"></label><label>Contact name<input name="contact" value="${esc(existing.contact||'')}"></label><label>Phone<input name="phone" value="${esc(existing.phone||'')}"></label><label>Email<input name="email" type="email" value="${esc(existing.email||'')}"></label><label>Estimated value (£)<input name="value" type="number" min="0" step="0.01" value="${esc(existing.value||'')}"></label><label>Follow-up date<input name="follow_up" type="date" value="${esc(existing.follow_up||'')}"></label><label>Stage<select name="stage">${['New Lead','Contacted','Quote Requested','Quote Sent','Won','Lost'].map(x=>`<option ${x===(existing.stage||'New Lead')?'selected':''}>${x}</option>`).join('')}</select></label><label>Lead source<input name="source" placeholder="Google, referral, LinkedIn…" value="${esc(existing.source||'')}"></label></div><label>Notes<textarea name="notes" rows="4">${esc(existing.notes||'')}</textarea></label><div class="actions"><button type="button" data-close-lead>Cancel</button><button class="primary">Save Lead</button></div></form></section></div>`; }

  function fleetCentreView(){
    const today=new Date();
    today.setHours(0,0,0,0);
    const days=(v)=>v?Math.ceil((new Date(String(v).slice(0,10))-today)/86400000):9999;
    const vehicles=state.fleet||[];
    const drivers=state.drivers||[];
    const fuelLogs=state.fuelLogs||[];
    const maintenance=state.maintenance||[];
    const activeDrivers=drivers.filter(d=>!['offline','inactive'].includes(String(d.status||d.availability_status||'').toLowerCase()));
    const available=drivers.filter(d=>String(d.status||d.availability_status||'').toLowerCase()==='available');
    const expiryFields=[['MOT','mot_expiry'],['Insurance','insurance_expiry'],['Tax','tax_expiry'],['LOLER','loler_expiry'],['Service','service_due_date']];
    const alerts=[];
    vehicles.forEach(v=>expiryFields.forEach(([label,key])=>{const n=days(v[key]);if(n<=60)alerts.push({vehicle:v,label,date:v[key],days:n});}));
    const openDefects=state.fleetDefects.filter(d=>d.status!=='Resolved');
    const criticalDefects=openDefects.filter(d=>d.severity==='Critical');
    const totalFuel=fuelLogs.reduce((s,x)=>s+Number(x.total_cost||x.cost||0),0);
    const totalMaintenance=maintenance.reduce((s,x)=>s+Number(x.cost||0),0);
    const fleetSpend=totalFuel+totalMaintenance;
    const tabs=['overview','vehicles','maintenance','defects','fuel','drivers'];
    const labels={overview:'Overview',vehicles:'Vehicles',maintenance:'Service Planner',defects:'Defects',fuel:'Running Costs',drivers:'Drivers'};
    const tabbar=`<div class="fleet-tabs">${tabs.map(t=>`<button class="${state.fleetTab===t?'active':''}" data-fleet-tab="${t}">${labels[t]}</button>`).join('')}</div>`;
    const vehicleName=v=>v.registration||v.reg||v.name||v.vehicle_type||'Vehicle';
    const vehicleCosts=v=>({
      fuel:fuelLogs.filter(x=>x.vehicle_id===v.id).reduce((s,x)=>s+Number(x.total_cost||x.cost||0),0),
      maintenance:maintenance.filter(x=>x.vehicle_id===v.id).reduce((s,x)=>s+Number(x.cost||0),0)
    });
    const complianceBadge=(v)=>{
      const due=expiryFields.map(([label,key])=>({label,days:days(v[key])})).filter(x=>x.days<=30).sort((a,b)=>a.days-b.days)[0];
      if(!due)return '<span class="fleet-health good">Compliant</span>';
      if(due.days<0)return `<span class="fleet-health danger">${esc(due.label)} overdue</span>`;
      return `<span class="fleet-health warn">${esc(due.label)} ${due.days}d</span>`;
    };
    let body='';
    if(state.fleetTab==='vehicles') {
      body=`<div class="fleet-version-actions"><button class="primary" data-page="fleet">＋ Add or edit vehicles</button></div><div class="fleet-record-grid fleet-v2631-grid">${vehicles.map(v=>{const costs=vehicleCosts(v);const defectCount=openDefects.filter(d=>String(d.vehicle)===String(vehicleName(v))).length;return `<article class="fleet-record fleet-vehicle-card"><div class="fleet-record-top"><div><small>${esc(v.vehicle_type||'VEHICLE')}</small><h3>${esc(vehicleName(v))}</h3><p>${esc([v.make,v.model].filter(Boolean).join(' ')||'Vehicle details')}</p></div>${complianceBadge(v)}</div><div class="fleet-detail-grid"><span>Mileage <b>${Number(v.current_mileage||v.mileage||0).toLocaleString('en-GB')}</b></span><span>Payload <b>${esc(v.payload||v.payload_kg||'—')}</b></span><span>MOT <b>${fmtDate(v.mot_expiry)}</b></span><span>LOLER <b>${fmtDate(v.loler_expiry)}</b></span><span>Service <b>${v.service_due_mileage?Number(v.service_due_mileage).toLocaleString('en-GB')+' mi':fmtDate(v.service_due_date)}</b></span><span>Open defects <b>${defectCount}</b></span></div><div class="fleet-cost-strip"><span>Fuel <b>${money(costs.fuel)}</b></span><span>Maintenance <b>${money(costs.maintenance)}</b></span><strong>${money(costs.fuel+costs.maintenance)} total</strong></div><div class="fleet-inline-actions"><button class="secondary" data-fuel-vehicle="${v.id}">Add fuel</button><button class="secondary" data-maint-vehicle="${v.id}">Add maintenance</button></div></article>`}).join('')||'<div class="empty">No vehicles added yet.</div>'}</div>`;
    } else if(state.fleetTab==='maintenance') {
      const history=maintenance.slice().sort((a,b)=>new Date(b.log_date||b.created_at)-new Date(a.log_date||a.created_at));
      body=`<section class="fleet-planner-grid"><div>${panel('Compliance & service schedule',`<div class="fleet-alert-list">${alerts.sort((a,b)=>a.days-b.days).map(a=>`<article class="fleet-alert ${a.days<0?'overdue':a.days<=14?'urgent':'due'}"><div><b>${esc(vehicleName(a.vehicle))} — ${esc(a.label)}</b><small>${a.days<0?`${Math.abs(a.days)} days overdue`:`Due in ${a.days} days`}</small></div><span>${fmtDate(a.date)}</span>${a.vehicle.id?`<button class="secondary" data-maint-vehicle="${a.vehicle.id}">Log work</button>`:''}</article>`).join('')||'<div class="empty">No compliance or service dates due within 60 days.</div>'}</div>`,'Shows MOT, insurance, tax, LOLER and service dates due within 60 days.')}</div><aside>${panel('Maintenance summary',`<div class="fleet-summary-list"><p><span>Recorded jobs</span><b>${maintenance.length}</b></p><p><span>Total maintenance spend</span><b>${money(totalMaintenance)}</b></p><p><span>Overdue items</span><b>${alerts.filter(a=>a.days<0).length}</b></p><p><span>Due in 14 days</span><b>${alerts.filter(a=>a.days>=0&&a.days<=14).length}</b></p></div>`,'Keep every vehicle road-ready.')}</aside></section>${panel('Maintenance history',`<div class="fleet-cost-table">${history.map(x=>{const v=vehicles.find(v=>v.id===x.vehicle_id);return `<article><span><b>${esc(x.category||'Maintenance')}</b><small>${esc(vehicleName(v||{}))} · ${fmtDate(x.log_date||x.created_at)}${x.supplier?` · ${esc(x.supplier)}`:''}</small></span><p>${esc(x.description||'No description')}</p><strong>${money(x.cost)}</strong></article>`}).join('')||'<div class="empty">No maintenance entries recorded.</div>'}</div>`,'Newest entries first.')}`;
    } else if(state.fleetTab==='defects') {
      body=`<div class="fleet-version-actions"><button class="primary" data-new-defect>＋ Report Defect</button></div><section class="crm-kpis">${card('Open defects',openDefects.length,openDefects.length?'Action required':'All clear')}${card('Critical',criticalDefects.length,criticalDefects.length?'Vehicle may need grounding':'None')}${card('Resolved',state.fleetDefects.filter(d=>d.status==='Resolved').length,'Closed records')}${card('Vehicles affected',new Set(openDefects.map(d=>d.vehicle)).size,'Current open issues')}</section><div class="fleet-alert-list">${state.fleetDefects.map(d=>`<article class="fleet-alert ${d.severity==='Critical'?'overdue':d.status==='Resolved'?'resolved':'due'}"><div><b>${esc(d.vehicle)} — ${esc(d.category)}</b><small>${esc(d.notes||'No notes')} · ${fmtDate(d.date)} · ${esc(d.severity||'Medium')}</small></div><span>${esc(d.status)}</span>${d.status!=='Resolved'?`<button data-resolve-defect="${d.id}">Resolve</button>`:''}</article>`).join('')||'<div class="empty">No defects reported.</div>'}</div>`;
    } else if(state.fleetTab==='fuel') {
      const recent=[...fuelLogs.map(x=>({...x,kind:'Fuel'})),...maintenance.map(x=>({...x,kind:x.category||'Maintenance'}))].sort((a,b)=>new Date(b.log_date||b.created_at)-new Date(a.log_date||a.created_at));
      const litres=fuelLogs.reduce((s,x)=>s+Number(x.litres||0),0);
      body=`<section class="crm-kpis">${card('Fuel entries',fuelLogs.length,'Recorded purchases')}${card('Fuel spend',money(totalFuel),'Total recorded')}${card('Maintenance',money(totalMaintenance),'Repairs and servicing')}${card('Fleet running cost',money(fleetSpend),'Fuel plus maintenance')}</section>${panel('Recent fleet costs',`<div class="fleet-cost-table">${recent.map(x=>{const v=vehicles.find(v=>v.id===x.vehicle_id);return `<article><span><b>${esc(x.kind)}</b><small>${esc(vehicleName(v||{}))} · ${fmtDate(x.log_date||x.created_at)}${x.mileage?` · ${Number(x.mileage).toLocaleString('en-GB')} mi`:''}</small></span><p>${x.litres?`${Number(x.litres).toFixed(1)} litres`:esc(x.description||x.supplier||'Recorded cost')}</p><strong>${money(x.total_cost||x.cost)}</strong></article>`}).join('')||'<div class="empty">No running costs recorded.</div>'}</div>`,`Total fuel volume recorded: ${litres.toFixed(1)} litres.`)}`;
    } else if(state.fleetTab==='drivers') {
      body=`<div class="fleet-record-grid">${drivers.map(d=>`<article class="fleet-record"><div><small>DRIVER</small><h3>${esc(d.name||d.full_name||'Unnamed driver')}</h3></div><span class="status ${esc(String(d.status||d.availability_status||'Offline').toLowerCase().replace(/ /g,'-'))}">${esc(d.status||d.availability_status||'Offline')}</span><p>${esc(d.phone||'No phone saved')}</p><div class="fleet-detail-grid"><span>Licence <b>${fmtDate(d.licence_expiry)}</b></span><span>CPC <b>${fmtDate(d.cpc_expiry)}</b></span><span>Medical <b>${fmtDate(d.medical_expiry)}</b></span><span>Jobs <b>${allJobRecords().filter(j=>j.assigned_driver_id===d.id||j.assigned_driver_name===d.name).length}</b></span></div></article>`).join('')||'<div class="empty">No drivers added yet.</div>'}</div>`;
    } else {
      const upcoming=alerts.slice().sort((a,b)=>a.days-b.days).slice(0,8);
      const costByVehicle=vehicles.map(v=>({v,...vehicleCosts(v)})).sort((a,b)=>(b.fuel+b.maintenance)-(a.fuel+a.maintenance)).slice(0,5);
      body=`<section class="crm-kpis">${card('Road-ready vehicles',Math.max(0,vehicles.length-new Set(criticalDefects.map(d=>d.vehicle)).size),`${vehicles.length} fleet records`)}${card('Maintenance alerts',alerts.length,alerts.length?'Within 60 days':'All clear')}${card('Open defects',openDefects.length,criticalDefects.length?`${criticalDefects.length} critical`:'No critical defects')}${card('Fleet spend',money(fleetSpend),'Fuel and maintenance')}</section><section class="fleet-command-grid"><div>${panel('Upcoming compliance',`<div class="fleet-alert-list compact">${upcoming.map(a=>`<article class="fleet-alert ${a.days<0?'overdue':a.days<=14?'urgent':'due'}"><div><b>${esc(vehicleName(a.vehicle))}</b><small>${esc(a.label)} · ${a.days<0?`${Math.abs(a.days)} days overdue`:`${a.days} days`}</small></div><span>${fmtDate(a.date)}</span></article>`).join('')||'<div class="empty">No upcoming alerts.</div>'}</div>`,'Next 60 days')}</div><aside>${panel('Highest running costs',`<div class="fleet-summary-list">${costByVehicle.map(x=>`<p><span>${esc(vehicleName(x.v))}</span><b>${money(x.fuel+x.maintenance)}</b></p>`).join('')||'<div class="empty">No cost data yet.</div>'}</div>`,'Fuel and maintenance combined')}</aside></section><section class="fleet-overview-grid">${panel('Driver availability',drivers.slice(0,8).map(d=>`<div class="mini-row"><b>${esc(d.name||d.full_name||'Driver')}</b><span>${esc(d.status||d.availability_status||'Offline')}</span></div>`).join('')||'<div class="empty">No drivers added.</div>')}${panel('Defects needing action',openDefects.slice(0,8).map(d=>`<div class="mini-row"><b>${esc(d.vehicle)}</b><span>${esc(d.category)} · ${esc(d.severity)}</span></div>`).join('')||'<div class="empty">No open defects.</div>')}</section>`;
    }
    return `<section class="pipeline-hero fleet-v2631-hero"><div><small>V26.31 FLEET MAINTENANCE & SERVICE SCHEDULER</small><h2>Keep every vehicle compliant and road-ready</h2><p>Track servicing, MOT, insurance, tax, LOLER, defects, fuel and maintenance costs from one control centre.</p></div><div class="fleet-hero-actions"><button class="secondary" data-page="fleet">Manage Vehicles</button><button class="primary" data-new-defect>＋ Report Defect</button></div></section>${tabbar}${body}${state.newDefect?`<div class="modalback"><section class="customermodal crm-modal"><div class="modalhead"><h2>Report Vehicle Defect</h2><button data-close-defect>×</button></div><form id="defect-form"><div class="grid two"><label>Vehicle<select name="vehicle" required><option value="">Choose vehicle</option>${vehicles.map(v=>`<option>${esc(vehicleName(v))}</option>`).join('')}</select></label><label>Category<select name="category"><option>Tyres</option><option>Lights</option><option>Brakes</option><option>Tail lift</option><option>Body damage</option><option>Windscreen</option><option>Other</option></select></label><label>Severity<select name="severity"><option>Low</option><option selected>Medium</option><option>Critical</option></select></label><label>Date<input name="date" type="date" value="${todayISO()}"></label></div><label>Notes<textarea name="notes" rows="4" required></textarea></label><div class="actions"><button type="button" data-close-defect>Cancel</button><button class="primary">Save Defect</button></div></form></section></div>`:''}`;
  }


  
  const defaultCommunicationTemplates = [
    { id:'quote-follow-up', name:'Quote follow-up', channel:'email', subject:'Following up on your KLS SameDay quote', body:'Hi {{contact_name}},\n\nI’m following up on quote {{quote_number}} for {{collection}} to {{delivery}}. The quoted price is {{price}}.\n\nPlease let us know if you would like us to secure the vehicle.\n\nKind regards,\nKLS SameDay' },
    { id:'booking-confirmation', name:'Booking confirmation', channel:'email', subject:'Booking confirmed – {{job_number}}', body:'Hi {{contact_name}},\n\nYour KLS SameDay booking {{job_number}} is confirmed.\n\nCollection: {{collection}}\nDelivery: {{delivery}}\nDate: {{collection_date}}\nVehicle: {{vehicle}}\n\nKind regards,\nKLS SameDay' },
    { id:'driver-allocated', name:'Driver allocated', channel:'whatsapp', subject:'', body:'KLS SameDay update: a driver has been allocated to job {{job_number}}. We will keep you updated.' },
    { id:'collected', name:'Collection complete', channel:'whatsapp', subject:'', body:'KLS SameDay update: job {{job_number}} has been collected and is now on the way to {{delivery}}.' },
    { id:'delivered', name:'Delivery complete', channel:'email', subject:'Delivery complete – {{job_number}}', body:'Hi {{contact_name}},\n\nJob {{job_number}} has been delivered successfully. Your POD is available in KLS SameDay Office.\n\nKind regards,\nKLS SameDay' },
    { id:'invoice-reminder', name:'Invoice reminder', channel:'email', subject:'Payment reminder – invoice {{invoice_number}}', body:'Hi {{contact_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{amount}} is now due.\n\nPlease let us know if you need another copy.\n\nKind regards,\nKLS SameDay' },
    { id:'customer-reengagement', name:'Customer re-engagement', channel:'email', subject:'Can KLS SameDay help with your next delivery?', body:'Hi {{contact_name}},\n\nWe have not worked together recently, so I wanted to check whether KLS SameDay can help with any upcoming deliveries.\n\nWe provide dedicated same-day transport from Essex with nationwide coverage.\n\nKind regards,\nKLS SameDay' }
  ];

  function ensureCommunicationTemplates() {
    if (!Array.isArray(state.communicationTemplates) || !state.communicationTemplates.length) {
      state.communicationTemplates = defaultCommunicationTemplates.map(item => ({ ...item }));
      localStorage.setItem('kls_communication_templates', JSON.stringify(state.communicationTemplates));
    }
  }

  function saveCommunications() {
    localStorage.setItem('kls_communications', JSON.stringify(state.communications));
  }

  function replaceTemplateTokens(value, data={}) {
    return String(value || '').replace(/\{\{([a-z0-9_]+)\}\}/gi, (_, key) => data[key] ?? '');
  }

  function communicationCustomer(customerId) {
    return state.customers.find(customer => customer.id === customerId) || null;
  }

  function communicationReminders() {
    const now = new Date();
    const reminders = [];
    state.quotes.forEach(quote => {
      const status = String(quote.status || quote.quote_status || '').toLowerCase();
      const created = new Date(quote.created_at || quote.quote_date || quote.created || 0);
      const ageHours = (now - created) / 36e5;
      if (created.getTime() && ageHours >= 48 && !['accepted','declined','expired','converted'].includes(status)) {
        const customer = communicationCustomer(quote.customer_id);
        reminders.push({ id:`quote-${quote.id}`, type:'quote', priority:ageHours >= 96 ? 'high' : 'normal', title:`Follow up quote ${quote.quote_number || quote.reference || ''}`.trim(), detail:`${customer?.company || quote.customer_name || 'Customer'} · ${Math.floor(ageHours/24)} days old`, customer, record:quote, template:'quote-follow-up' });
      }
    });
    state.invoices.forEach(invoice => {
      const status = String(invoice.status || invoice.invoice_status || '').toLowerCase();
      const due = new Date(invoice.due_date || invoice.payment_due || 0);
      if (due.getTime() && due < now && !['paid','cancelled','void'].includes(status)) {
        const days = Math.max(1, Math.floor((now - due) / 864e5));
        const customer = communicationCustomer(invoice.customer_id);
        reminders.push({ id:`invoice-${invoice.id}`, type:'invoice', priority:days >= 14 ? 'high' : 'normal', title:`Invoice ${invoice.invoice_number || invoice.reference || ''} overdue`.trim(), detail:`${customer?.company || invoice.customer_name || 'Customer'} · ${days} day${days===1?'':'s'} overdue · ${money(invoice.total || invoice.amount || invoice.total_amount)}`, customer, record:invoice, template:'invoice-reminder' });
      }
    });
    state.customers.forEach(customer => {
      const relatedJobs = allJobRecords().filter(job => job.customer_id === customer.id);
      const latest = relatedJobs.map(job => new Date(job.collection_date || job.created_at || 0)).filter(date=>date.getTime()).sort((a,b)=>b-a)[0];
      const days = latest ? Math.floor((now - latest) / 864e5) : null;
      if (days !== null && days >= 60) reminders.push({ id:`customer-${customer.id}`, type:'customer', priority:days >= 120 ? 'high' : 'normal', title:`Reconnect with ${customer.company || 'customer'}`, detail:`No completed work recorded for ${days} days`, customer, record:customer, template:'customer-reengagement' });
    });
    return reminders.sort((a,b) => Number(b.priority === 'high') - Number(a.priority === 'high'));
  }

  function communicationStats() {
    const today = new Date().toISOString().slice(0,10);
    const todayItems = state.communications.filter(item => String(item.created_at || '').slice(0,10) === today);
    return { email:todayItems.filter(i=>i.channel==='email').length, whatsapp:todayItems.filter(i=>i.channel==='whatsapp').length, sms:todayItems.filter(i=>i.channel==='sms').length, reminders:communicationReminders().length };
  }

  function communicationView() {
    ensureCommunicationTemplates();
    const stats = communicationStats(), reminders = communicationReminders(), search = state.communicationSearch.trim().toLowerCase();
    const history = state.communications.filter(item => !search || [item.customer_name,item.recipient,item.subject,item.body,item.status,item.channel].some(value => String(value||'').toLowerCase().includes(search)));
    const tabs = [['overview','Overview'],['compose','New message'],['reminders',`Reminders (${reminders.length})`],['templates','Templates'],['history','History']];
    const tabBar = `<div class="communication-tabs">${tabs.map(([id,label])=>`<button class="${state.communicationTab===id?'active':''}" data-communication-tab="${id}">${label}</button>`).join('')}</div>`;
    let body = '';
    if (state.communicationTab === 'compose') {
      body = `<div class="communications-grid compose-layout">
        ${panel('Create communication', `<form id="communication-compose-form"><div class="grid two"><label>Customer<select name="customer_id"><option value="">Choose customer</option>${state.customers.map(c=>`<option value="${c.id}">${esc(c.company||c.contact_name||'Customer')}</option>`).join('')}</select></label><label>Channel<select name="channel"><option value="email">Email</option><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="phone">Phone note</option></select></label></div><div class="grid two"><label>Template<select name="template_id"><option value="">No template</option>${state.communicationTemplates.map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select></label><label>Recipient<input name="recipient" placeholder="Email address or mobile number"></label></div><label>Subject<input name="subject" placeholder="Email subject"></label><label>Message<textarea name="body" rows="9" required placeholder="Write your message…"></textarea></label><div class="actions"><button type="button" class="secondary" data-communication-preview>Preview</button><button class="primary">Save & open message</button></div></form>`, 'Messages are logged automatically. Email and WhatsApp open in your normal app so you stay in control.')}
        ${panel('Live preview', '<div id="communication-preview" class="communication-preview"><small>PREVIEW</small><h3>Your message will appear here</h3><p>Select a template or start typing.</p></div>')}
      </div>`;
    } else if (state.communicationTab === 'reminders') {
      body = panel('Automated follow-ups', reminders.length ? `<div class="reminder-list">${reminders.map(r=>`<article class="${r.priority}"><div><span>${r.type.toUpperCase()}</span><b>${esc(r.title)}</b><small>${esc(r.detail)}</small></div><button class="primary" data-run-reminder="${r.id}">Prepare message</button></article>`).join('')}</div>` : '<div class="all-clear"><b>Nothing needs chasing</b><span>Quotes, invoices and inactive customers are all up to date.</span></div>', 'Generated automatically from your live quotes, invoices and customer history.');
    } else if (state.communicationTab === 'templates') {
      body = panel('Message templates', `<div class="template-list">${state.communicationTemplates.map(t=>`<article><div><span class="channel-pill ${t.channel}">${esc(t.channel)}</span><b>${esc(t.name)}</b><small>${esc(t.subject || 'No subject required')}</small></div><button class="secondary" data-edit-template="${t.id}">Edit</button></article>`).join('')}</div><div id="template-editor"></div>`, 'Use {{contact_name}}, {{quote_number}}, {{invoice_number}}, {{job_number}}, {{price}}, {{amount}}, {{collection}}, {{delivery}}, {{collection_date}} and {{vehicle}}.');
    } else if (state.communicationTab === 'history') {
      body = panel('Communication history', `<div class="panelhead"><div><p>${history.length} logged communication${history.length===1?'':'s'}</p></div><label class="search">⌕<input id="communication-search" value="${esc(state.communicationSearch)}" placeholder="Search customer, recipient or subject"></label></div>${history.length?`<div class="communication-history">${history.map(item=>`<article><span class="history-icon">${item.channel==='email'?'✉':item.channel==='whatsapp'?'◉':item.channel==='sms'?'▣':'☎'}</span><div><b>${esc(item.subject || item.type || 'Communication')}</b><small>${esc(item.customer_name || item.recipient || 'No customer')} · ${esc(item.channel)} · ${fmtDate(item.created_at)}</small><p>${esc(String(item.body||'').slice(0,180))}</p></div><span class="communication-status ${esc(item.status||'logged')}">${esc(item.status||'logged')}</span></article>`).join('')}</div>`:'<div class="fleet-empty">No communications logged yet.</div>'}`);
    } else {
      const recent = state.communications.slice(0,6);
      body = `<div class="communication-cards"><button class="card dashboard-card" data-communication-tab="history"><span>✉</span><div><small>Emails today</small><b>${stats.email}</b><em>View communication history</em></div></button><button class="card dashboard-card" data-communication-tab="history"><span>◉</span><div><small>WhatsApp today</small><b>${stats.whatsapp}</b><em>Customer updates sent</em></div></button><button class="card dashboard-card" data-communication-tab="history"><span>▣</span><div><small>SMS today</small><b>${stats.sms}</b><em>Text messages logged</em></div></button><button class="card dashboard-card ${stats.reminders?'attention-card':''}" data-communication-tab="reminders"><span>!</span><div><small>Follow-ups due</small><b>${stats.reminders}</b><em>${stats.reminders?'Action required':'Nothing overdue'}</em></div></button></div>
      <div class="communications-grid">${panel('Follow-up queue', reminders.length?`<div class="reminder-list compact">${reminders.slice(0,5).map(r=>`<article class="${r.priority}"><div><span>${r.type.toUpperCase()}</span><b>${esc(r.title)}</b><small>${esc(r.detail)}</small></div><button class="secondary" data-run-reminder="${r.id}">Prepare</button></article>`).join('')}</div>`:'<div class="all-clear"><b>All caught up</b><span>No automated communication reminders are due.</span></div>', reminders.length>5?`${reminders.length-5} more reminders waiting.`:'Quotes, invoices and customer activity checked automatically.')}${panel('Recent activity', recent.length?`<div class="recent-communications">${recent.map(item=>`<button data-communication-tab="history"><span>${item.channel==='email'?'✉':item.channel==='whatsapp'?'◉':item.channel==='sms'?'▣':'☎'}</span><div><b>${esc(item.subject||item.type||'Communication')}</b><small>${esc(item.customer_name||item.recipient||'Unknown')} · ${fmtDate(item.created_at)}</small></div></button>`).join('')}</div>`:'<div class="fleet-empty">Your sent and logged messages will appear here.</div>', 'One communication history across customers, quotes, jobs and invoices.')}</div>`;
    }
    return `<section class="communications-hero"><div><small>V26.29 AUTOMATED COMMUNICATIONS CENTRE</small><h2>Keep every customer updated</h2><p>Prepare messages, chase quotes and invoices, and keep a complete contact history without leaving KLS SameDay Office.</p></div><button class="primary" data-communication-tab="compose">＋ New message</button></section>${tabBar}${body}`;
  }

  function communicationContextForReminder(reminder) {
    const customer = reminder.customer || {}, record = reminder.record || {};
    return { contact_name:customer.contact_name||customer.company||'there', quote_number:record.quote_number||record.reference||'', invoice_number:record.invoice_number||record.reference||'', job_number:record.job_number||record.reference||'', price:money(record.total||record.price||record.quoted_price), amount:money(record.total||record.amount||record.total_amount), collection:record.collection_address||record.collection_postcode||'', delivery:record.delivery_address||record.delivery_postcode||'', collection_date:record.collection_date?fmtDate(record.collection_date):'', vehicle:record.vehicle_required||record.vehicle||'' };
  }

function systemHealthSummary() {
    const checks = [
      { label:'Supabase configuration', ok:configured, detail:configured ? 'Project URL and publishable key loaded.' : 'Connection settings are missing.' },
      { label:'Signed-in office account', ok:Boolean(state.user), detail:state.user?.email || 'No signed-in user.' },
      { label:'Customer data', ok:Array.isArray(state.customers), detail:`${state.customers.length} customer record${state.customers.length===1?'':'s'} loaded.` },
      { label:'Jobs data', ok:Array.isArray(state.jobs) && Array.isArray(state.archivedJobs), detail:`${allJobRecords().length} total job record${allJobRecords().length===1?'':'s'} loaded (${state.jobs.length} active, ${state.archivedJobs.length} archived).` },
      { label:'Invoices data', ok:Array.isArray(state.invoices), detail:`${state.invoices.length} invoice record${state.invoices.length===1?'':'s'} loaded.` },
      { label:'Driver data', ok:Array.isArray(state.drivers), detail:`${state.drivers.length} driver record${state.drivers.length===1?'':'s'} loaded.` },
      { label:'Offline support', ok:'serviceWorker' in navigator, detail:'Browser service-worker support detected.' }
    ];
    return checks;
  }

  function createSystemBackup() {
    const backup = {
      product:'KLS SameDay Office',
      version:'35.2.0',
      exported_at:new Date().toISOString(),
      account:state.user?.email || null,
      business_settings:state.settings,
      customers:state.customers,
      drivers:state.drivers,
      fleet:state.fleet,
      fuel_logs:state.fuelLogs,
      maintenance:state.maintenance,
      recurring_jobs:state.recurringJobs,
      quotes:state.quotes,
      jobs:allJobRecords(),
      active_jobs:state.jobs,
      archived_jobs:state.archivedJobs,
      invoices:state.invoices,
      expenses:state.expenses,
      portal_access_users:state.portalAccessUsers,
      quote_requests:state.quoteRequests,
      route_stops:state.routeStops,
      local_device_data:{
        sales_leads:state.leads,
        fleet_defects:state.fleetDefects,
        communications:state.communications,
        communication_templates:state.communicationTemplates,
        profit_settings:state.profitSettings
      }
    };
    const blob = new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href=url;
    link.download=`KLS-SameDay-Backup-${todayISO()}.json`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function copySystemDiagnostics() {
    const diagnostics = [
      'KLS SameDay Office v35.3.0',
      `Generated: ${new Date().toLocaleString('en-GB')}`,
      `Account: ${state.user?.email || 'Not signed in'}`,
      `Supabase: ${configured ? 'Connected' : 'Not configured'}`,
      `Customers: ${state.customers.length}`,
      `Jobs: ${allJobRecords().length} total (${state.jobs.length} active, ${state.archivedJobs.length} archived)`,
      `Quotes: ${state.quotes.length}`,
      `Invoices: ${state.invoices.length}`,
      `Drivers: ${state.drivers.length}`,
      `Fleet vehicles: ${state.fleet.length}`,
      `Browser: ${navigator.userAgent}`
    ].join('\n');
    navigator.clipboard?.writeText(diagnostics).then(()=>{showNotice('System diagnostics copied.','ok');render();}).catch(()=>{showNotice('Could not copy diagnostics in this browser.','error');render();});
  }



  function csvCell(value) {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `"${text.replace(/"/g,'""')}"`;
  }

  function flattenExportRecord(record) {
    const result = {};
    Object.entries(record || {}).forEach(([key,value]) => {
      if (Array.isArray(value)) result[key] = value.map(item => typeof item === 'object' ? JSON.stringify(item) : item).join(' | ');
      else if (value && typeof value === 'object') result[key] = JSON.stringify(value);
      else result[key] = value;
    });
    return result;
  }

  function downloadCsvFile(filename, records) {
    const rows = (records || []).map(flattenExportRecord);
    if (!rows.length) { showNotice('There is no data to export for this section.','error'); render(); return; }
    const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const csv = [headers.map(csvCell).join(','), ...rows.map(row => headers.map(header => csvCell(row[header])).join(','))].join('\r\n');
    const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function exportDataset(type) {
    const datasets = {
      customers:{ label:'customers', records:state.customers },
      quotes:{ label:'quotes', records:state.quotes },
      jobs:{ label:'jobs', records:allJobRecords() },
      invoices:{ label:'invoices', records:state.invoices },
      expenses:{ label:'expenses', records:state.expenses },
      drivers:{ label:'drivers', records:state.drivers },
      fleet:{ label:'fleet', records:state.fleet },
      communications:{ label:'communications', records:state.communications },
      leads:{ label:'sales-leads', records:state.leads }
    };
    const dataset = datasets[type];
    if (!dataset) return;
    downloadCsvFile(`KLS-${dataset.label}-${todayISO()}.csv`, dataset.records);
    if (dataset.records.length) { showNotice(`${dataset.records.length} ${dataset.label} record${dataset.records.length===1?'':'s'} exported.`, 'ok'); render(); }
  }

  function settingsView() {
    const fields = { trading_name:'Trading name',legal_name:'Legal company name',phone:'Telephone',whatsapp:'WhatsApp',email:'Email',website:'Website',address_line:'Business address',bank_name:'Bank name',sort_code:'Sort code',account_number:'Account number',default_terms:'Payment terms (days)' };
    const linked = state.portalAccessUsers.length ? `<div class="portal-access-list">${state.portalAccessUsers.map(u=>`<article><div><b>${esc(u.customers?.company||'Customer')}</b><small>${esc(u.email)}</small></div><span class="portal-status ${u.active?'approved':'cancelled'}">${u.active?'Active':'Disabled'}</span>${u.active?`<button class="danger" data-portal-revoke="${u.id}">Disable</button>`:''}</article>`).join('')}</div>` : '<div class="fleet-empty">No customer portal accounts linked yet.</div>';
    const health = systemHealthSummary();
    const healthRows = health.map(item=>`<article class="system-check ${item.ok?'ok':'bad'}"><span>${item.ok?'✓':'!'}</span><div><b>${esc(item.label)}</b><small>${esc(item.detail)}</small></div></article>`).join('');
    const settingsPanel = panel('Business settings', `<form id="settings-form"><div class="grid two">${Object.entries(fields).map(([key,label]) => `<label>${label}<input name="${key}" value="${esc(state.settings[key] ?? '')}" ${key === 'default_terms' ? 'type="number"' : ''}></label>`).join('')}</div><div class="actions"><button class="primary">Save Settings</button></div></form><p class="saved">✓ Saved securely in Supabase.</p><hr class="portal-divider"><div class="portal-section-head"><div><h2>Customer Portal Access</h2><p>Ask the customer to create an account using their email address, then link that login here.</p></div><span>${state.portalAccessUsers.filter(u=>u.active).length} active</span></div><form id="portal-access-form"><div class="grid two"><label>Customer<select name="customer_id" required><option value="">Choose customer</option>${state.customers.map(c=>`<option value="${c.id}">${esc(c.company)}</option>`).join('')}</select></label><label>Customer login email<input name="email" type="email" required></label></div><div class="actions"><button class="primary">Enable Customer Portal</button></div></form><h3 class="linked-title">Linked customer accounts</h3>${linked}`);
    const healthPanel = panel('System health & backup', `<div class="system-version"><div><small>CURRENT RELEASE</small><b>v35.3.0</b><span>Invoice, payment and POD audit fixes</span></div><span class="system-live">${configured?'CONNECTED':'CHECK CONNECTION'}</span></div><div class="system-checks">${healthRows}</div><div class="system-backup-actions"><button class="primary" type="button" data-system-backup>Download full backup</button><button class="secondary" type="button" data-copy-diagnostics>Copy diagnostics</button></div><p class="system-help">The backup contains active and archived records currently loaded in the office system plus device-only leads, defects, communications and profit assumptions. Keep it somewhere secure.</p>`, 'Use this section before major updates and when reporting a fault.');
    const exportItems = [
      ['customers','Customers',state.customers.length],['quotes','Quotes',state.quotes.length],['jobs','Jobs',allJobRecords().length],['invoices','Invoices',state.invoices.length],['expenses','Expenses',state.expenses.length],['drivers','Drivers',state.drivers.length],['fleet','Fleet',state.fleet.length],['communications','Communications',state.communications.length],['leads','Sales leads',state.leads.length]
    ];
    const exportPanel = panel('Data Export Centre', `<div class="export-centre-head"><div><small>CSV DOWNLOADS</small><h3>Take your business data with you</h3><p>Download clean spreadsheet-ready files for accounts, analysis or safekeeping.</p></div><span>${exportItems.reduce((sum,item)=>sum+item[2],0)} records loaded</span></div><div class="export-grid">${exportItems.map(([id,label,count])=>`<button type="button" data-export-dataset="${id}"><span>⇩</span><div><b>${label}</b><small>${count} record${count===1?'':'s'}</small></div></button>`).join('')}</div><p class="system-help">Exports use CSV format and open in Excel, Numbers and Google Sheets. No records are changed or deleted.</p>`, 'Download one section at a time without altering the live Supabase database.');
    return `<section class="settings-layout"><div>${settingsPanel}</div><aside>${healthPanel}${exportPanel}</aside></section>`;
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
    const views = { dashboard, businessintel: businessIntelligenceView, profitcentre: profitCentreView, aiassistant: aiDispatchAssistantView, smart: smartDispatchView, routes: routePlannerView, operations: operationsView, dispatch: dispatchView, drivers: driversManagementView, exchange: driverExchangeView, driver: driverView, tracking: liveTrackingView, fleet: fleetView, schedule: scheduleView, newquote: newQuote, quotes: quotesView, jobs: jobsView, invoices: invoicesView, documents: deliveryDocumentsView, accounts: accountsView, reports: businessReportsView, portalrequests: portalRequestsView, quoterequests: quoteRequestsView, customers: customersView, pipeline: salesPipelineView, fleetcentre: fleetCentreView, communications: communicationView, settings: settingsView };
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
    document.querySelector('[data-password-reset]')?.addEventListener('click', async()=>{const email=prompt('Enter your login email address:');if(!email)return;const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});showNotice(error?error.message:'Password reset email sent.',error?'error':'ok');render();});
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
        const [bookings, jobs, invoices, quotes, messages, addresses, settings] = await Promise.all([
          db.from('portal_bookings').select('*').eq('customer_id', portalUser.customer_id).order('created_at',{ascending:false}),
          db.from('jobs').select('*').eq('customer_id', portalUser.customer_id).eq('customer_visible', true).is('archived_at', null).order('created_at',{ascending:false}),
          db.from('invoices').select('*').eq('customer_id', portalUser.customer_id).eq('portal_visible', true).order('created_at',{ascending:false}),
          db.from('quotes').select('*').eq('customer_id', portalUser.customer_id).in('status',['Sent','Accepted','Declined']).order('created_at',{ascending:false}),
          db.from('portal_messages').select('*').eq('customer_id', portalUser.customer_id).order('created_at',{ascending:false}),
          db.from('customer_addresses').select('*').eq('customer_id', portalUser.customer_id).order('label',{ascending:true}),
          db.from('business_settings').select('*').eq('user_id', portalUser.owner_id).maybeSingle()
        ]);
        for (const result of [bookings,jobs,invoices,addresses,settings]) if(result.error) throw result.error;
        state.portalBookings=bookings.data||[]; state.portalJobs=jobs.data||[]; state.portalInvoices=invoices.data||[]; state.portalQuotes=quotes.data||[]; state.portalMessages=messages.data||[]; state.portalAddresses=addresses.data||[]; state.settings={...defaults,...(settings.data||{})};
        state.loading=false; render(); return;
      }
      state.portalUser = null;
      const claimResult = await db.rpc('claim_public_quote_requests');
      if (claimResult?.error && !['42883', 'PGRST202'].includes(claimResult.error.code)) throw claimResult.error;

      const queries = {
        customers: db.from('customers').select('*').order('created_at', { ascending: false }),
        customerContacts: db.from('customer_contacts').select('*').order('created_at', { ascending: false }),
        customerFollowups: db.from('customer_followups').select('*').order('due_date', { ascending: true }),
        drivers: db.from('drivers').select('*').order('name', { ascending: true }),
        fleet: db.from('vehicles').select('*').order('created_at', { ascending: false }),
        fuelLogs: db.from('fuel_logs').select('*').order('log_date', { ascending: false }),
        maintenance: db.from('vehicle_maintenance').select('*').order('log_date', { ascending: false }),
        recurringJobs: db.from('recurring_jobs').select('*').order('next_run_date', { ascending: true }),
        quotes: db.from('quotes').select('*').order('created_at', { ascending: false }),
        jobs: db.from('jobs').select('*').is('archived_at', null).order('created_at', { ascending: false }),
        archivedJobs: db.from('jobs').select('*').not('archived_at', 'is', null).order('archived_at', { ascending: false }),
        invoices: db.from('invoices').select('*').order('created_at', { ascending: false }),
        expenses: db.from('expenses').select('*').order('expense_date', { ascending: false }),
        portalBookings: db.from('portal_bookings').select('*').order('created_at', { ascending: false }),
        portalMessages: db.from('portal_messages').select('*').order('created_at', { ascending: false }),
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
      const { customers, customerContacts, customerFollowups, drivers, fleet, fuelLogs, maintenance, recurringJobs, quotes, jobs, archivedJobs, invoices, expenses, portalBookings, portalMessages, portalAccessUsers, routeStops, quoteRequests, driverAccounts, exchangeJobs, exchangeBids, settings } = loaded;
      state.customers = customers.data || [];
      state.customerContacts = customerContacts.data || [];
      state.customerFollowups = customerFollowups.data || [];
      state.drivers = drivers.data || [];
      state.fleet = fleet.data || [];
      state.fuelLogs = fuelLogs.data || [];
      state.maintenance = maintenance.data || [];
      state.recurringJobs = recurringJobs.data || [];
      state.quotes = quotes.data || [];
      state.jobs = (jobs.data || []).map(j => ({ ...j, customer_name: j.customer_name || j.contact_name || '' }));
      state.archivedJobs = (archivedJobs.data || []).map(j => ({ ...j, customer_name: j.customer_name || j.contact_name || '' }));
      state.invoices = invoices.data || [];
      state.expenses = expenses.data || [];
      state.portalBookings = portalBookings.data || [];
      state.portalMessages = portalMessages.data || [];
      state.portalAccessUsers = portalAccessUsers.data || [];
      state.routeStops = routeStops.data || [];
      state.quoteRequests = quoteRequests.data || [];
      state.driverAccounts = driverAccounts.data || [];
      // When the office user is also testing the Driver App with the same login,
      // attach that authenticated user to the prepared driver account immediately.
      // This repairs older records that were created with only an email address.
      const signedInEmail = String(state.user?.email || '').trim().toLowerCase();
      const repairableAccounts = state.driverAccounts.filter(account =>
        signedInEmail &&
        String(account.email || '').trim().toLowerCase() === signedInEmail &&
        !account.auth_user_id &&
        account.active !== false
      );
      if (repairableAccounts.length) {
        const repairs = await Promise.all(repairableAccounts.map(account =>
          db.from('driver_accounts').update({ auth_user_id: state.user.id }).eq('id', account.id).select().single()
        ));
        repairs.forEach((result, index) => {
          if (!result.error && result.data) Object.assign(repairableAccounts[index], result.data);
        });
      }
      state.exchangeJobs = exchangeJobs.data || [];
      state.exchangeBids = exchangeBids.data || [];
      state.settings = { ...defaults, ...(settings.data || {}) };
    } catch (error) {
      showNotice(`Database setup needed: ${error.message}`, 'error');
    } finally { state.loading = false; render(); if(state.user&&!state.portalUser){startOfficeRealtime();startOfficePolling();} }
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

  async function createInvoiceForJob(job) {
    if (!job) throw new Error('Job could not be found.');
    const existing = state.invoices.find(invoice => invoice.job_id === job.id);
    if (existing) return existing;
    const due = new Date(Date.now() + Number(state.settings.default_terms || 7) * 86400000).toISOString().slice(0, 10);
    const payload = {
      user_id: state.user.id,
      job_id: job.id,
      customer_id: job.customer_id,
      invoice_number: numberCode('INV'),
      customer_name: job.customer_name || job.contact_name || 'Customer',
      total: Number(job.total_price || 0),
      status: 'Unpaid',
      amount_paid: 0,
      issue_date: todayISO(),
      due_date: due
    };
    const { data: invoice, error } = await db.from('invoices').insert(payload).select().single();
    if (error) throw error;
    const { error: jobError } = await db.from('jobs').update({ invoice_status: 'Invoiced', invoice_date: todayISO() }).eq('id', job.id);
    if (jobError) throw jobError;
    job.invoice_status = 'Invoiced';
    job.invoice_date = todayISO();
    state.invoices.unshift(invoice);
    return invoice;
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


  function exportBusinessReportCsv() {
    const period = state.reportPeriod || todayISO().slice(0,7);
    const inPeriod = value => String(value || '').slice(0,7) === period;
    const rows = [['Type','Reference','Date','Customer / Supplier','Vehicle / Category','Description','Amount','Status']];
    allJobRecords().filter(job=>inPeriod(job.collection_date||job.delivered_at||job.created_at) && job.job_status!=='Cancelled').forEach(job=>rows.push([
      'Job',job.job_number||'',job.collection_date||job.delivered_at||job.created_at||'',job.customer_name||job.contact_name||'',job.vehicle||'',`${job.collection_address||''} to ${job.delivery_address||''}`,Number(job.total_price||job.quoted_price||0).toFixed(2),job.job_status||''
    ]));
    state.invoices.filter(inv=>inv.status!=='Cancelled' && inPeriod(inv.issue_date||inv.created_at)).forEach(inv=>rows.push([
      'Invoice',inv.invoice_number||'',inv.issue_date||inv.created_at||'',inv.customer_name||'', '', 'Invoice raised',Number(inv.total||0).toFixed(2),invoiceDisplayStatus(inv)
    ]));
    state.expenses.filter(exp=>inPeriod(exp.expense_date||exp.created_at)).forEach(exp=>rows.push([
      'Expense','',exp.expense_date||exp.created_at||'',exp.supplier||'',exp.category||'',exp.description||'',(-Number(exp.amount||0)).toFixed(2),'Recorded'
    ]));
    const csv=rows.map(row=>row.map(value=>`"${String(value??'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=`KLS-Business-Report-${period}.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
    showNotice(`Business report for ${period} exported.`, 'ok'); render();
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
    document.querySelectorAll('[data-communication-tab]').forEach(button => button.onclick = () => { state.communicationTab = button.dataset.communicationTab; render(); });
    document.querySelectorAll('[data-finance-tab]').forEach(button => button.onclick = () => { state.financeTab = button.dataset.financeTab; render(); });
    document.getElementById('finance-forecast-days')?.addEventListener('change', event => { state.financeForecastDays = Number(event.target.value || 30); render(); });
    document.getElementById('communication-search')?.addEventListener('input', event => { state.communicationSearch = event.target.value; render(); });
    const composeForm = document.getElementById('communication-compose-form');
    if (composeForm) {
      const customerField=composeForm.elements.customer_id, templateField=composeForm.elements.template_id, channelField=composeForm.elements.channel, recipientField=composeForm.elements.recipient, subjectField=composeForm.elements.subject, bodyField=composeForm.elements.body;
      const updatePreview = () => {
        const customer=communicationCustomer(customerField.value)||{}, template=state.communicationTemplates.find(item=>item.id===templateField.value), context={contact_name:customer.contact_name||customer.company||'there'};
        if (template) { channelField.value=template.channel; subjectField.value=replaceTemplateTokens(template.subject,context); bodyField.value=replaceTemplateTokens(template.body,context); }
        if (!recipientField.value) recipientField.value=channelField.value==='email'?(customer.email||''):(customer.phone||'');
        const preview=document.getElementById('communication-preview');
        if (preview) preview.innerHTML=`<small>${esc(channelField.value.toUpperCase())} PREVIEW</small><h3>${esc(subjectField.value||'Customer message')}</h3><p>${esc(bodyField.value||'Your message will appear here.').replace(/\n/g,'<br>')}</p>`;
      };
      customerField.addEventListener('change',updatePreview); templateField.addEventListener('change',updatePreview); channelField.addEventListener('change',updatePreview); subjectField.addEventListener('input',updatePreview); bodyField.addEventListener('input',updatePreview);
      document.querySelector('[data-communication-preview]')?.addEventListener('click',updatePreview);
      composeForm.addEventListener('submit',event=>{
        event.preventDefault();
        const values=Object.fromEntries(new FormData(composeForm)), customer=communicationCustomer(values.customer_id);
        state.communications.unshift({id:crypto.randomUUID(),customer_id:values.customer_id||null,customer_name:customer?.company||customer?.contact_name||'',channel:values.channel,recipient:values.recipient,subject:values.subject,body:values.body,status:'prepared',created_at:new Date().toISOString()});
        saveCommunications();
        const subject=encodeURIComponent(values.subject||''), body=encodeURIComponent(values.body||'');
        if(values.channel==='email'&&values.recipient)window.open(`mailto:${values.recipient}?subject=${subject}&body=${body}`,'_blank');
        if(values.channel==='whatsapp'&&values.recipient){const phone=String(values.recipient).replace(/\D/g,'').replace(/^0/,'44');window.open(`https://wa.me/${phone}?text=${body}`,'_blank');}
        if(values.channel==='sms'&&values.recipient)window.open(`sms:${values.recipient}?body=${body}`,'_blank');
        showNotice('Communication prepared and logged.','ok'); state.communicationTab='history'; render();
      });
    }
    document.querySelectorAll('[data-run-reminder]').forEach(button=>button.onclick=()=>{
      const reminder=communicationReminders().find(item=>item.id===button.dataset.runReminder); if(!reminder)return;
      ensureCommunicationTemplates(); const template=state.communicationTemplates.find(item=>item.id===reminder.template), context=communicationContextForReminder(reminder);
      state.communicationTab='compose'; render();
      setTimeout(()=>{const form=document.getElementById('communication-compose-form');if(!form||!template)return;form.elements.customer_id.value=reminder.customer?.id||'';form.elements.template_id.value=template.id;form.elements.channel.value=template.channel;form.elements.recipient.value=template.channel==='email'?(reminder.customer?.email||''):(reminder.customer?.phone||'');form.elements.subject.value=replaceTemplateTokens(template.subject,context);form.elements.body.value=replaceTemplateTokens(template.body,context);form.elements.body.dispatchEvent(new Event('input'));},0);
    });
    document.querySelectorAll('[data-edit-template]').forEach(button=>button.onclick=()=>{
      const template=state.communicationTemplates.find(item=>item.id===button.dataset.editTemplate), editor=document.getElementById('template-editor'); if(!template||!editor)return;
      editor.innerHTML=`<form id="template-edit-form" class="template-edit-form"><h3>Edit ${esc(template.name)}</h3><div class="grid two"><label>Name<input name="name" value="${esc(template.name)}"></label><label>Channel<select name="channel"><option value="email" ${template.channel==='email'?'selected':''}>Email</option><option value="whatsapp" ${template.channel==='whatsapp'?'selected':''}>WhatsApp</option><option value="sms" ${template.channel==='sms'?'selected':''}>SMS</option></select></label></div><label>Subject<input name="subject" value="${esc(template.subject||'')}"></label><label>Message<textarea name="body" rows="8">${esc(template.body)}</textarea></label><div class="actions"><button type="button" class="secondary" data-cancel-template>Cancel</button><button class="primary">Save template</button></div></form>`;
      editor.querySelector('[data-cancel-template]').onclick=()=>editor.innerHTML='';
      editor.querySelector('form').onsubmit=event=>{event.preventDefault();Object.assign(template,Object.fromEntries(new FormData(event.currentTarget)));localStorage.setItem('kls_communication_templates',JSON.stringify(state.communicationTemplates));showNotice('Template updated.','ok');render();};
    });
    document.querySelectorAll('[data-fleet-tab]').forEach(b=>b.onclick=()=>{state.fleetTab=b.dataset.fleetTab;render();});
    document.querySelectorAll('[data-new-defect]').forEach(b=>b.onclick=()=>{state.newDefect=true;render();});
    document.querySelectorAll('[data-close-defect]').forEach(b=>b.onclick=()=>{state.newDefect=false;render();});
    document.getElementById('defect-form')?.addEventListener('submit',e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));state.fleetDefects.unshift({...v,id:crypto.randomUUID(),status:'Open',created_at:new Date().toISOString()});localStorage.setItem('kls_fleet_defects',JSON.stringify(state.fleetDefects));state.newDefect=false;showNotice('Vehicle defect recorded.','ok');render();});
    document.querySelectorAll('[data-resolve-defect]').forEach(b=>b.onclick=()=>{const d=state.fleetDefects.find(x=>x.id===b.dataset.resolveDefect);if(d){d.status='Resolved';localStorage.setItem('kls_fleet_defects',JSON.stringify(state.fleetDefects));showNotice('Defect marked as resolved.','ok');render();}});
    document.querySelectorAll('[data-new-lead]').forEach(b=>b.onclick=()=>{state.editLeadId='new';render();});
    document.querySelectorAll('[data-close-lead]').forEach(b=>b.onclick=()=>{state.editLeadId=null;render();});
    document.getElementById('lead-search')?.addEventListener('input',e=>{state.leadSearch=e.target.value;render();});
    document.getElementById('lead-filter')?.addEventListener('change',e=>{state.leadFilter=e.target.value;render();});
    document.getElementById('lead-form')?.addEventListener('submit',e=>{e.preventDefault();const v=Object.fromEntries(new FormData(e.currentTarget));const lead={...v,id:v.id||crypto.randomUUID(),value:Number(v.value||0),created_at:new Date().toISOString()};const i=state.leads.findIndex(x=>x.id===lead.id);if(i>=0)state.leads[i]={...state.leads[i],...lead};else state.leads.unshift(lead);saveLeads();state.editLeadId=null;showNotice('Lead saved.','ok');render();});
    document.querySelectorAll('[data-lead-stage]').forEach(s=>s.onchange=()=>{const l=state.leads.find(x=>x.id===s.dataset.leadStage);if(l){l.stage=s.value;saveLeads();render();}});
    document.querySelectorAll('[data-delete-lead]').forEach(b=>b.onclick=e=>{e.stopPropagation();if(confirm('Delete this lead?')){state.leads=state.leads.filter(x=>x.id!==b.dataset.deleteLead);saveLeads();render();}});
    document.querySelectorAll('[data-lead-id]').forEach(c=>c.onclick=e=>{if(e.target.closest('button,select,a'))return;state.editLeadId=c.dataset.leadId;render();});
    document.querySelectorAll('[data-lead-quote]').forEach(b=>b.onclick=()=>{const l=state.leads.find(x=>x.id===b.dataset.leadQuote);if(!l)return;state.page='newquote';state.quoteCustomerId=null;showNotice(`Create a quote for ${l.company}. Add them as a customer first if needed.`,'ok');render();});
    document.getElementById('bi-months')?.addEventListener('change', event => { state.biMonths = Number(event.target.value || 6); render(); });
    document.querySelector('[data-system-backup]')?.addEventListener('click',()=>{ createSystemBackup(); showNotice('Backup downloaded.','ok'); render(); });
    document.querySelector('[data-copy-diagnostics]')?.addEventListener('click',copySystemDiagnostics);
    document.querySelectorAll('[data-export-dataset]').forEach(button=>button.addEventListener('click',()=>exportDataset(button.dataset.exportDataset)));
    document.getElementById('profit-settings-form')?.addEventListener('submit', event => { event.preventDefault(); const values=Object.fromEntries(new FormData(event.currentTarget)); state.profitSettings={fuelPrice:Number(values.fuelPrice||0),mpg:Number(values.mpg||28),wearPerMile:Number(values.wearPerMile||0),hourlyCost:Number(values.hourlyCost||0),fixedJobCost:Number(values.fixedJobCost||0),targetMargin:Number(values.targetMargin||30)}; localStorage.setItem('kls_profit_settings',JSON.stringify(state.profitSettings)); showNotice('Profit assumptions saved.','ok'); render(); });
    document.getElementById('report-period')?.addEventListener('change', event => { state.reportPeriod = event.target.value || todayISO().slice(0,7); render(); });
    document.querySelector('[data-export-report]')?.addEventListener('click', exportBusinessReportCsv);
    document.querySelectorAll('[data-ai-assign]').forEach(button => button.onclick = async () => {
      const job = state.jobs.find(j => j.id === button.dataset.aiAssign);
      const driver = state.drivers.find(d => d.id === button.dataset.driverId);
      if (!job || !driver) return;
      const payload = { assigned_driver_id: driver.id, assigned_driver_name: driver.name };
      const { error } = await db.from('jobs').update(payload).eq('id', job.id);
      if (error) { showNotice(error.message,'error'); render(); return; }
      Object.assign(job,payload);
      showNotice(`${job.job_number||'Job'} assigned to ${driver.name}.`,'ok');
      render();
    });
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
    document.querySelectorAll('[data-dispatch-open]').forEach(button => button.onclick = event => { event.stopPropagation(); state.selectedDispatchJobId = button.dataset.dispatchOpen; render(); });
    document.querySelectorAll('[data-action="dispatch-editor-close"]').forEach(button => button.onclick = () => { state.selectedDispatchJobId = null; render(); });
    document.querySelectorAll('[data-dispatch-full-job]').forEach(button => button.onclick = () => { state.selectedDispatchJobId = null; state.jobEditorId = button.dataset.dispatchFullJob; state.page = 'jobs'; render(); });
    const dispatchEditorForm = document.getElementById('dispatch-editor-form');
    if (dispatchEditorForm) dispatchEditorForm.onsubmit = async event => {
      event.preventDefault();
      const job = state.jobs.find(j=>j.id===state.selectedDispatchJobId);
      if (!job) return;
      const values = Object.fromEntries(new FormData(dispatchEditorForm));
      const driver = state.drivers.find(d=>d.id===values.assigned_driver_id);
      const payload = {
        job_status: values.job_status,
        priority: values.priority,
        assigned_driver_id: values.assigned_driver_id || null,
        assigned_driver_name: driver?.name || null,
        collection_date: values.collection_date || null,
        collection_time: values.collection_time || null,
        delivery_deadline: values.delivery_deadline || null,
        eta_at: values.eta_at ? new Date(values.eta_at).toISOString() : null,
        vehicle: values.vehicle || null,
        dispatch_notes: values.dispatch_notes || null
      };
      if (payload.job_status === 'Delivered' && !job.delivered_at) payload.delivered_at = new Date().toISOString();
      const button = dispatchEditorForm.querySelector('button.primary');
      button.disabled = true; button.textContent = 'Saving…';
      const {data,error} = await db.from('jobs').update(payload).eq('id',job.id).select().single();
      if (error) { showNotice(error.message,'error'); button.disabled=false; button.textContent='Save changes'; return; }
      Object.assign(job,data); state.selectedDispatchJobId=null; showNotice(`${job.job_number||'Job'} updated.`,'ok'); render();
    };
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
    document.getElementById('dispatch-priority-filter')?.addEventListener('change', event => { state.dispatchPriorityFilter = event.target.value; render(); });
    document.getElementById('dispatch-date-filter')?.addEventListener('change', event => { state.dispatchDateFilter = event.target.value; render(); });
    document.querySelectorAll('[data-dispatch-select]').forEach(input => input.addEventListener('click', event => event.stopPropagation()));
    document.querySelectorAll('[data-dispatch-select]').forEach(input => input.addEventListener('change', () => { const id=input.dataset.dispatchSelect; const set=new Set(state.dispatchSelectedJobs||[]); input.checked?set.add(id):set.delete(id); state.dispatchSelectedJobs=[...set]; render(); }));
    document.querySelectorAll('[data-job-priority]').forEach(button => button.onclick = async event => { event.stopPropagation(); const job=state.jobs.find(j=>j.id===button.dataset.jobPriority); if(!job)return; const previous=job.priority||'Normal'; const priority=button.dataset.priority; job.priority=priority; render(); const {error}=await db.from('jobs').update({priority}).eq('id',job.id); if(error){job.priority=previous;showNotice(`${error.message}. Run SUPABASE-v33-DISPATCH.sql first.`,'error');render();return;} showNotice(`${job.job_number||'Job'} priority set to ${priority}.`,'ok');render(); });
    document.getElementById('dispatch-bulk-driver')?.addEventListener('change', async event => { const driver=state.drivers.find(d=>d.id===event.target.value); if(!driver)return; const ids=[...(state.dispatchSelectedJobs||[])]; const {error}=await db.from('jobs').update({assigned_driver_id:driver.id,assigned_driver_name:driver.name}).in('id',ids); if(error){showNotice(error.message,'error');render();return;} state.jobs.filter(j=>ids.includes(j.id)).forEach(j=>Object.assign(j,{assigned_driver_id:driver.id,assigned_driver_name:driver.name})); showNotice(`${ids.length} job${ids.length===1?'':'s'} assigned to ${driver.name}.`,'ok'); state.dispatchSelectedJobs=[]; render(); });
    document.getElementById('dispatch-bulk-priority')?.addEventListener('change', async event => { const priority=event.target.value; const ids=[...(state.dispatchSelectedJobs||[])]; if(!priority||!ids.length)return; const {error}=await db.from('jobs').update({priority}).in('id',ids); if(error){showNotice(error.message,'error');render();return;} state.jobs.filter(j=>ids.includes(j.id)).forEach(j=>{j.priority=priority;}); showNotice(`${ids.length} job${ids.length===1?'':'s'} set to ${priority}.`,'ok'); state.dispatchSelectedJobs=[]; render(); });
    document.querySelectorAll('[data-bulk-status]').forEach(button => button.onclick = async () => { const ids=[...(state.dispatchSelectedJobs||[])]; if(!ids.length)return; const status=button.dataset.bulkStatus; const payload={job_status:status}; if(status==='Delivered')payload.delivered_at=new Date().toISOString(); const {error}=await db.from('jobs').update(payload).in('id',ids); if(error){showNotice(error.message,'error');render();return;} state.jobs.filter(j=>ids.includes(j.id)).forEach(j=>Object.assign(j,payload)); showNotice(`${ids.length} job${ids.length===1?'':'s'} moved to ${status}.`,'ok'); state.dispatchSelectedJobs=[]; render(); });
    document.querySelector('[data-action="dispatch-clear-selection"]')?.addEventListener('click',()=>{state.dispatchSelectedJobs=[];render();});
    document.querySelector('[data-action="refresh-dispatch"]')?.addEventListener('click', async () => { await loadAll(); state.page='dispatch'; render(); });
    document.querySelector('[data-action="menu-open"]')?.addEventListener('click', () => document.getElementById('side').classList.add('open'));
    document.querySelector('[data-action="menu-close"]')?.addEventListener('click', () => document.getElementById('side').classList.remove('open'));
    document.querySelector('[data-action="notice-close"]')?.addEventListener('click', () => { state.notice = null; render(); });
    document.querySelector('[data-action="signout"]')?.addEventListener('click', async () => { await db.auth.signOut(); state.user = null; state.customers=[]; state.drivers=[]; state.fleet=[]; state.fuelLogs=[]; state.maintenance=[]; state.recurringJobs=[]; state.quotes=[]; state.jobs=[]; state.archivedJobs=[]; state.invoices=[]; state.expenses=[]; render(); });

    const driverForm = document.getElementById('driver-form');
    if(driverForm) driverForm.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(driverForm));const loginEmail=String(values.login_email||'').trim().toLowerCase();delete values.login_email;values.user_id=state.user.id;values.active=true;values.availability_status='Available';values.last_seen_at=new Date().toISOString();try{const{data,error}=await db.from('drivers').insert(values).select().single();if(error)throw error;const accountPayload={owner_id:state.user.id,driver_id:data.id,email:loginEmail,active:true,auth_user_id:loginEmail===String(state.user?.email||'').trim().toLowerCase()?state.user.id:null};const{data:account,error:accountError}=await db.from('driver_accounts').insert(accountPayload).select().single();if(accountError){await db.from('drivers').delete().eq('id',data.id);throw accountError;}state.drivers.push(data);state.driverAccounts.unshift(account);showNotice(`${data.name} added. Driver login: ${loginEmail}`,'ok');render();}catch(error){showNotice(error.message,'error');render();}};
    const driverLinkForm = document.getElementById('driver-link-form');
    if(driverLinkForm) driverLinkForm.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(new FormData(driverLinkForm));try{const email=String(values.email||'').trim().toLowerCase();const accountPayload={owner_id:state.user.id,driver_id:values.driver_id,email,active:true,auth_user_id:email===String(state.user?.email||'').trim().toLowerCase()?state.user.id:null};const{data,error}=await db.from('driver_accounts').insert(accountPayload).select().single();if(error)throw error;state.driverAccounts.unshift(data);const driver=state.drivers.find(d=>d.id===values.driver_id);showNotice(`${driver?.name||'Driver'} linked to ${email}.`,'ok');render();}catch(error){showNotice(error.message,'error');render();}};


    document.querySelectorAll('[data-repair-driver-login]').forEach(button => button.onclick = async () => {
      const driver = state.drivers.find(d => d.id === button.dataset.repairDriverLogin);
      const account = state.driverAccounts.find(a => a.driver_id === driver?.id && a.active !== false);
      if (!driver || !account) return;
      try {
        const { data, error } = await db.from('driver_accounts').update({ auth_user_id: state.user.id, active: true }).eq('id', account.id).select().single();
        if (error) throw error;
        Object.assign(account, data);
        showNotice(`${driver.name} can now use the Driver App with ${account.email}.`, 'ok');
        render();
      } catch (error) { showNotice(error.message, 'error'); render(); }
    });

    document.querySelectorAll('[data-edit-driver]').forEach(button => button.onclick = () => { state.selectedDriverId = button.dataset.editDriver; render(); });
    document.querySelectorAll('[data-action="driver-admin-close"]').forEach(button => button.onclick = () => { state.selectedDriverId = null; render(); });
    const driverEditForm = document.getElementById('driver-edit-form');
    if (driverEditForm) driverEditForm.onsubmit = async e => { e.preventDefault(); const driver=state.drivers.find(d=>d.id===state.selectedDriverId); if(!driver)return; try { const values=Object.fromEntries(new FormData(driverEditForm)); const email=String(values.login_email||'').trim().toLowerCase(); delete values.login_email; values.active=values.active==='true'; values.last_seen_at=new Date().toISOString(); const {data,error}=await db.from('drivers').update(values).eq('id',driver.id).select().single(); if(error)throw error; const account=state.driverAccounts.find(a=>a.driver_id===driver.id&&a.active!==false); if(email){ if(account){const{data:updated,error:ae}=await db.from('driver_accounts').update({email,active:true,auth_user_id:email===String(state.user?.email||'').trim().toLowerCase()?state.user.id:account.auth_user_id||null}).eq('id',account.id).select().single();if(ae)throw ae;Object.assign(account,updated);}else{const{data:created,error:ae}=await db.from('driver_accounts').insert({owner_id:state.user.id,driver_id:driver.id,email,active:true,auth_user_id:email===String(state.user?.email||'').trim().toLowerCase()?state.user.id:null}).select().single();if(ae)throw ae;state.driverAccounts.unshift(created);}} Object.assign(driver,data); state.selectedDriverId=null; showNotice(`${driver.name} updated.`,'ok'); render(); } catch(error){showNotice(error.message,'error');render();} };

    document.querySelector('[data-scroll-add-driver]')?.addEventListener('click',()=>{document.getElementById('add-driver-panel')?.scrollIntoView({behavior:'smooth',block:'start'});setTimeout(()=>document.querySelector('#driver-form input[name="name"]')?.focus(),350);});
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
        if (!quote) throw new Error('Quote not found. Refresh the page and try again.');
        button.disabled = true;
        button.textContent = 'Creating job…';
        const jobPayload = {
          user_id: state.user.id, customer_id: quote.customer_id, quote_id: quote.id,
          customer_name: quote.customer_name, contact_name: quote.contact_name || quote.customer_name,
          customer_email: quote.email || null, contact_email: quote.email || null, contact_phone: quote.phone || null,
          collection_date: quote.collection_date, collection_time: quote.collection_time, collection_address: quote.collection_address,
          delivery_address: quote.delivery_address, route_stops: quote.route_stops || [], vehicle: quote.vehicle, goods_description: quote.goods_description,
          miles: quote.miles, base_price: quote.quoted_price, extras: 0, total_price: quote.quoted_price, costs: 0,
          booking_notes: quote.notes || null, job_status: 'Booked', quote_status: 'Accepted', invoice_status: 'Not Invoiced'
        };
        const { data: existingJob, error: existingError } = await db.from('jobs').select('*').eq('quote_id', quote.id).maybeSingle();
        if (existingError) throw existingError;
        let job = existingJob;
        if (!job) {
          const { data: createdJob, error: jobError } = await db.from('jobs').insert(jobPayload).select().single();
          if (jobError) throw jobError;
          job = createdJob;
        }
        const { error: quoteError } = await db.from('quotes').update({ status: 'Accepted', job_id: job.id }).eq('id', quote.id);
        if (quoteError) throw quoteError;
        quote.status = 'Accepted'; quote.job_id = job.id;
        state.page = 'jobs';
        showNotice(`${job.job_number || 'Job'} created.`, 'ok');
        await loadAll();
      } catch (error) { showNotice(error.message, 'error'); render(); }
    });

    document.querySelectorAll('[data-job-driver]').forEach(select => select.onchange = async () => {
      const job = state.jobs.find(j => j.id === select.dataset.jobDriver);
      if (!job) return;
      const assigned_driver_id = select.value || null;
      const driver = state.drivers.find(d => d.id === assigned_driver_id);
      select.disabled = true;
      try {
        const payload = { assigned_driver_id, assigned_driver_name: driver?.name || null };
        let { data, error } = await db.from('jobs').update(payload).eq('id', job.id).select().single();
        if (error && /assigned_driver_name/i.test(error.message || '')) {
          ({ data, error } = await db.from('jobs').update({ assigned_driver_id }).eq('id', job.id).select().single());
        }
        if (error) throw error;
        Object.assign(job, data || payload);
        showNotice(assigned_driver_id ? `${job.job_number || 'Job'} assigned to ${driver?.name || 'driver'}.` : `${job.job_number || 'Job'} unassigned.`, 'ok');
      } catch (error) {
        select.value = job.assigned_driver_id || '';
        showNotice(error.message, 'error');
      } finally {
        select.disabled = false;
        render();
      }
    });

    document.querySelectorAll('[data-open-job]').forEach(button => button.onclick = () => { state.jobEditorId = button.dataset.openJob; render(); });
    document.querySelector('[data-focus-driver]')?.addEventListener('click', () => { const field=document.getElementById('job-driver-field'); field?.scrollIntoView({behavior:'smooth',block:'center'}); field?.querySelector('select')?.focus(); });
    document.querySelector('[data-send-job-eta]')?.addEventListener('click', async event => {
      const job=state.jobs.find(item=>item.id===state.jobEditorId); if(!job)return;
      const customer=jobCustomer(job); const message=event.currentTarget.dataset.message || '';
      if(customer.phone){const phone=String(customer.phone).replace(/\D/g,'').replace(/^0/,'44');window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank');}
      else if(customer.email){location.href=`mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(`Delivery update - ${job.job_number||'KLS SameDay'}`)}&body=${encodeURIComponent(message)}`;}
      else{await navigator.clipboard?.writeText(message);showNotice('No customer phone or email saved. ETA message copied.','ok');render();}
    });
    document.querySelector('[data-job-next-status]')?.addEventListener('click', async event => {
      const job=state.jobs.find(item=>item.id===state.jobEditorId); if(!job)return;
      const status=event.currentTarget.dataset.jobNextStatus; const payload={job_status:status};
      if(status==='Collected') payload.collected_at=new Date().toISOString();
      if(status==='Delivered') payload.delivered_at=new Date().toISOString();
      event.currentTarget.disabled=true;
      const {data,error}=await db.from('jobs').update(payload).eq('id',job.id).select().single();
      if(error){showNotice(error.message,'error');}else{Object.assign(job,data||payload);showNotice(`${job.job_number||'Job'} marked ${status}.`,'ok');}render();
    });
    document.querySelector('[data-archive-job]')?.addEventListener('click', async event => {
      const job=state.jobs.find(item=>item.id===event.currentTarget.dataset.archiveJob);
      if(!job||!['Delivered','Cancelled'].includes(job.job_status))return;
      if(!confirm(`Archive ${job.job_number||'this job'}? It will leave the active Jobs screen but can be restored.`))return;
      event.currentTarget.disabled=true;
      try{
        const {data,error}=await db.rpc('archive_job',{p_job_id:job.id});
        if(error)throw error;
        const archived={...job,...(data||{}),archived_at:data?.archived_at||new Date().toISOString(),archived_by:data?.archived_by||state.user.id};
        state.jobs=state.jobs.filter(item=>item.id!==job.id);
        state.archivedJobs.unshift(archived);
        state.jobEditorId=null;
        showNotice(`${job.job_number||'Job'} archived. It can be restored from Archived Jobs.`,'ok');
        render();
      }catch(error){
        showNotice(`${error.message}. Run SUPABASE-v35.1-JOB-ARCHIVE.sql in Supabase first.`,'error');
        render();
      }
    });
    document.querySelectorAll('[data-action="job-close"]').forEach(button => button.onclick = () => { state.jobEditorId = null; render(); });
    document.getElementById('job-editor-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const job = state.jobs.find(j => j.id === state.jobEditorId);
      if (!job) return;
      const values = Object.fromEntries(new FormData(event.currentTarget));
      const payload = {
        collection_date: values.collection_date || null,
        collection_time: values.collection_time || null,
        collection_address: values.collection_address,
        delivery_address: values.delivery_address,
        vehicle: values.vehicle,
        job_status: values.job_status,
        assigned_driver_id: values.assigned_driver_id || null,
        total_price: Number(values.total_price || 0),
        goods_description: values.goods_description || null
      };
      const saveButton = event.currentTarget.querySelector('button[type="submit"],button.primary');
      try {
        if (saveButton) { saveButton.disabled = true; saveButton.textContent = 'Saving…'; }
        const { data, error } = await db.from('jobs').update(payload).eq('id', job.id).select().single();
        if (error) throw error;
        Object.assign(job, data || payload);
        state.jobEditorId = null;
        showNotice(`${job.job_number || 'Job'} saved and driver assignment updated.`, 'ok');
        render();
      } catch (error) {
        showNotice(error.message, 'error');
        render();
      }
    });

    document.querySelectorAll('[data-job-status]').forEach(select => select.onchange = async () => {
      const job = state.jobs.find(j => j.id === select.dataset.jobStatus); const previous = job.job_status; job.job_status = select.value;
      const { error } = await db.from('jobs').update({ job_status: select.value }).eq('id', job.id);
      if (error) { job.job_status = previous; showNotice(error.message, 'error'); render(); }
    });

    document.querySelectorAll('[data-deliver-invoice]').forEach(button => button.onclick = async () => {
      const job = state.jobs.find(item => item.id === button.dataset.deliverInvoice);
      if (!job) return;
      button.disabled = true;
      try {
        const deliveredAt = new Date().toISOString();
        const { data, error } = await db.from('jobs').update({ job_status: 'Delivered', delivered_at: deliveredAt }).eq('id', job.id).select().single();
        if (error) throw error;
        Object.assign(job, data || { job_status: 'Delivered', delivered_at: deliveredAt });
        const invoice = await createInvoiceForJob(job);
        state.jobEditorId = null;
        state.page = 'invoices';
        showNotice(`${job.job_number || 'Job'} delivered and ${invoice.invoice_number} created.`, 'ok');
        render();
        loadAll().catch(error => showNotice(error.message, 'error'));
      } catch (error) {
        showNotice(error.message, 'error');
        render();
      }
    });

    document.querySelectorAll('[data-invoice]').forEach(button => button.onclick = async () => {
      try {
        button.disabled = true;
        button.textContent = 'Creating…';
        const job = allJobRecords().find(j => j.id === button.dataset.invoice);
        if (!job) throw new Error('Job not found. Refresh the page and try again.');
        if (state.invoices.some(i => i.job_id === job.id)) throw new Error('An invoice already exists for this job.');
        const invoice = await createInvoiceForJob(job);
        state.page = 'invoices';
        showNotice(`${invoice.invoice_number} created.`, 'ok');
        render();
        loadAll().catch(error => showNotice(error.message, 'error'));
      } catch (error) { showNotice(error.message, 'error'); render(); }
    });


    document.querySelectorAll('[data-remind-invoice]').forEach(button => button.onclick = () => {
      const invoice = state.invoices.find(i => i.id === button.dataset.remindInvoice);
      const customer = state.customers.find(c => c.id === invoice.customer_id) || {};
      const balance = money(invoiceBalance(invoice));
      const due = fmtDate(invoice.due_date);
      const message = `Hello ${customer.contact_name || invoice.customer_name || ''}, this is a friendly reminder that invoice ${invoice.invoice_number} has an outstanding balance of ${balance}, due ${due}. Please let us know when payment has been arranged. Thank you, KLS SameDay.`;
      if (customer.phone) {
        const phone = String(customer.phone).replace(/\D/g,'').replace(/^0/,'44');
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank');
      } else if (customer.email) {
        location.href = `mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(`Payment reminder - ${invoice.invoice_number}`)}&body=${encodeURIComponent(message)}`;
      } else {
        navigator.clipboard?.writeText(message);
        showNotice('No email or phone saved. Reminder copied to clipboard.','ok'); render();
      }
    });

    document.querySelector('[data-create-all-invoices]')?.addEventListener('click', async buttonEvent => {
      const jobs = allJobRecords().filter(job => job.job_status === 'Delivered' && !state.invoices.some(inv => inv.job_id === job.id));
      if (!jobs.length) return;
      if (!confirm(`Create ${jobs.length} invoice${jobs.length===1?'':'s'} now?`)) return;
      const button = buttonEvent.currentTarget;
      button.disabled = true; button.textContent = 'Creating…';
      let created = 0;
      for (const job of jobs) {
        try {
          const due = new Date(Date.now() + Number(state.settings.default_terms || 7) * 86400000).toISOString().slice(0,10);
          const payload = { user_id:state.user.id, job_id:job.id, customer_id:job.customer_id, invoice_number:numberCode('INV'), customer_name:job.customer_name || job.contact_name, total:Number(job.total_price || 0), status:'Unpaid', amount_paid:0, issue_date:todayISO(), due_date:due };
          const {data,error}=await db.from('invoices').insert(payload).select().single();
          if(error) throw error;
          await db.from('jobs').update({invoice_status:'Invoiced',invoice_date:todayISO()}).eq('id',job.id);
          job.invoice_status='Invoiced'; state.invoices.unshift(data); created++;
        } catch(error) { showNotice(`${job.job_number || 'Job'}: ${error.message}`,'error'); }
      }
      showNotice(`${created} invoice${created===1?'':'s'} created.`,'ok'); render();
    });

    document.querySelectorAll('[data-record-payment]').forEach(button => button.onclick = async () => {
      const invoice = state.invoices.find(i => i.id === button.dataset.recordPayment);
      if (!invoice) return;
      const remaining = invoiceBalance(invoice);
      if (remaining <= 0) {
        showNotice('This invoice is already paid in full.','error');
        render();
        return;
      }
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

    document.getElementById('document-search')?.addEventListener('input', event => {
      const term = event.target.value.toLowerCase();
      document.querySelectorAll('[data-document-card]').forEach(card => card.style.display = card.textContent.toLowerCase().includes(term) ? '' : 'none');
    });
    document.querySelectorAll('[data-print-pod]').forEach(button => button.onclick = () => printPodCertificate(allJobRecords().find(job => job.id === button.dataset.printPod)));
    document.querySelectorAll('[data-share-pod]').forEach(button => button.onclick = async () => {
      const job = allJobRecords().find(item => item.id === button.dataset.sharePod); if (!job) return;
      const text = `${state.settings.trading_name} proof of delivery\n${job.job_number || 'Delivered job'}\nDelivered to: ${podRecipient(job) || 'Recipient not recorded'}\nDelivery: ${job.delivery_address || ''}${job.pod_photo_url ? `\nPOD photo: ${job.pod_photo_url}` : ''}${job.pod_signature_url ? `\nSignature: ${job.pod_signature_url}` : ''}`;
      try { if (navigator.share) await navigator.share({title:`POD ${job.job_number || ''}`,text}); else { await navigator.clipboard.writeText(text); showNotice('POD details copied.','ok'); render(); } } catch(error) { if(error.name !== 'AbortError'){ showNotice('Unable to share POD.','error'); render(); } }
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
    document.getElementById('invoice-search')?.addEventListener('input', event => { state.invoiceSearch = event.target.value; render(); requestAnimationFrame(()=>{const input=document.getElementById('invoice-search'); if(input){input.focus(); input.setSelectionRange(input.value.length,input.value.length);}}); });
    document.getElementById('invoice-filter')?.addEventListener('change', event => { state.invoiceFilter = event.target.value; render(); });
    document.querySelectorAll('[data-email-invoice]').forEach(button => button.onclick = () => {
      const inv=state.invoices.find(i=>i.id===button.dataset.emailInvoice); if(!inv)return;
      const customer=state.customers.find(c=>c.id===inv.customer_id)||{};
      const subject=`Invoice ${inv.invoice_number} from ${state.settings.trading_name}`;
      const body=`Hello ${customer.contact_name || inv.customer_name || ''},\n\nPlease find invoice ${inv.invoice_number} for ${money(inv.total)}. The balance due is ${money(invoiceBalance(inv))}, payable by ${fmtDate(inv.due_date)}.\n\nBank: ${state.settings.bank_name || ''}\nSort code: ${state.settings.sort_code || ''}\nAccount number: ${state.settings.account_number || ''}\n\nKind regards,\n${state.settings.trading_name}`;
      if(customer.email) location.href=`mailto:${encodeURIComponent(customer.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; else { navigator.clipboard?.writeText(`${subject}\n\n${body}`); showNotice('Customer email is not saved. Invoice message copied.','ok'); render(); }
    });
    document.querySelectorAll('[data-whatsapp-invoice]').forEach(button => button.onclick = () => {
      const inv=state.invoices.find(i=>i.id===button.dataset.whatsappInvoice); if(!inv)return;
      const customer=state.customers.find(c=>c.id===inv.customer_id)||{};
      const message=`Hello ${customer.contact_name || inv.customer_name || ''}, invoice ${inv.invoice_number} from ${state.settings.trading_name} is for ${money(inv.total)}. Balance due: ${money(invoiceBalance(inv))} by ${fmtDate(inv.due_date)}. Please let us know when payment has been made. Thank you.`;
      const phone=String(customer.phone||'').replace(/\D/g,'').replace(/^0/,'44');
      if(phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`,'_blank','noopener'); else { navigator.clipboard?.writeText(message); showNotice('Customer phone is not saved. WhatsApp message copied.','ok'); render(); }
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
    document.querySelectorAll('[data-portal-reply]').forEach(form=>form.addEventListener('submit',async event=>{
      event.preventDefault();
      const original=state.portalMessages.find(message=>message.id===form.dataset.portalReply);
      if(!original)return;
      const button=form.querySelector('button');
      const values=Object.fromEntries(new FormData(form));
      try{
        button.disabled=true; button.textContent='Sending…';
        const payload={
          owner_id:state.user.id,
          customer_id:original.customer_id,
          auth_user_id:original.auth_user_id,
          sender_type:'office',
          subject:`Re: ${original.subject||'Customer message'}`,
          message:String(values.message||'').trim()
        };
        const {data,error}=await db.from('portal_messages').insert(payload).select().single();
        if(error)throw error;
        state.portalMessages.unshift(data);
        showNotice('Reply sent to the customer portal.','ok');
        render();
      }catch(error){
        showNotice(error.message,'error');
        render();
      }
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

    const customerContactForm = document.getElementById('customer-contact-form');
    if (customerContactForm) customerContactForm.onsubmit = async e => {
      e.preventDefault();
      try {
        const payload = Object.fromEntries(new FormData(customerContactForm));
        payload.customer_id = state.selectedCustomerId; payload.user_id = state.user.id;
        const {data,error}=await db.from('customer_contacts').insert(payload).select().single();
        if(error) throw error; state.customerContacts.unshift(data); showNotice('Customer contact added.','ok'); render();
      } catch(error){showNotice(error.message,'error');render();}
    };
    document.querySelectorAll('[data-contact-delete]').forEach(button=>button.onclick=async()=>{
      if(!confirm('Remove this contact?')) return;
      const {error}=await db.from('customer_contacts').delete().eq('id',button.dataset.contactDelete);
      if(error) showNotice(error.message,'error'); else {state.customerContacts=state.customerContacts.filter(x=>x.id!==button.dataset.contactDelete);showNotice('Contact removed.','ok');} render();
    });
    const customerFollowupForm = document.getElementById('customer-followup-form');
    if(customerFollowupForm) customerFollowupForm.onsubmit=async e=>{
      e.preventDefault(); try {const payload=Object.fromEntries(new FormData(customerFollowupForm));payload.customer_id=state.selectedCustomerId;payload.user_id=state.user.id;const{data,error}=await db.from('customer_followups').insert(payload).select().single();if(error)throw error;state.customerFollowups.push(data);showNotice('Follow-up scheduled.','ok');render();}catch(error){showNotice(error.message,'error');render();}
    };
    document.querySelectorAll('[data-followup-toggle]').forEach(button=>button.onclick=async()=>{const item=state.customerFollowups.find(x=>x.id===button.dataset.followupToggle);if(!item)return;const completed_at=item.completed_at?null:new Date().toISOString();const{data,error}=await db.from('customer_followups').update({completed_at}).eq('id',item.id).select().single();if(error)showNotice(error.message,'error');else{Object.assign(item,data);showNotice(completed_at?'Follow-up completed.':'Follow-up reopened.','ok');}render();});
    document.querySelectorAll('[data-followup-delete]').forEach(button=>button.onclick=async()=>{if(!confirm('Remove this follow-up?'))return;const{error}=await db.from('customer_followups').delete().eq('id',button.dataset.followupDelete);if(error)showNotice(error.message,'error');else{state.customerFollowups=state.customerFollowups.filter(x=>x.id!==button.dataset.followupDelete);showNotice('Follow-up removed.','ok');}render();});

    document.querySelectorAll('[data-new-quote-customer]').forEach(button => button.onclick = () => {
      state.quoteCustomerId = button.dataset.newQuoteCustomer;
      state.selectedCustomerId = null;
      state.page = 'newquote';
      render();
    });

    document.querySelectorAll('[data-repeat-customer-job]').forEach(button => button.onclick = () => {
      const job=state.jobs.find(j=>j.id===button.dataset.repeatCustomerJob);
      if(!job)return;
      state.selectedCustomerId=null;
      state.page='newquote';
      state.quoteCustomerId=job.customer_id||null;
      state.repeatJobDraft={collection_address:job.collection_address||'',delivery_address:job.delivery_address||'',vehicle:job.vehicle||'',goods_description:job.goods_description||'',quoted_price:job.total_price||job.quoted_price||''};
      showNotice('Last job loaded. Check the details and create the new quote.','ok');
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
    if(podForm) podForm.onsubmit=async e=>{e.preventDefault();const job=state.jobs.find(j=>j.id===state.selectedDriverJobId);const btn=podForm.querySelector('button.primary');btn.disabled=true;btn.textContent='Saving POD…';try{const fd=new FormData(podForm);const recipient=String(fd.get('recipient_name')||'').trim();if(!recipient)throw new Error('Please enter the recipient name.');let photoUrl=job.pod_photo_url||null;let signatureUrl=job.pod_signature_url||null;const photo=fd.get('pod_photo');if(photo&&photo.size){photoUrl=await uploadPodFile(job,photo,'photo');}if(canvas){const blank=document.createElement('canvas');blank.width=canvas.width;blank.height=canvas.height;if(canvas.toDataURL()!==blank.toDataURL()){const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));signatureUrl=await uploadPodFile(job,blob,'signature');}}if(!photoUrl)throw new Error('Please add a delivery photo.');if(!signatureUrl)throw new Error('Please obtain the recipient signature.');const position=await getOnePosition().catch(()=>null);const payload={recipient_name:recipient,pod_notes:fd.get('pod_notes')||null,pod_photo_url:photoUrl,pod_signature_url:signatureUrl,job_status:'Delivered',delivered_at:new Date().toISOString(),pod_latitude:position?.coords.latitude||job.last_latitude||null,pod_longitude:position?.coords.longitude||job.last_longitude||null};const{data,error}=await db.from('jobs').update(payload).eq('id',job.id).select().single();if(error)throw error;Object.assign(job,data);state.selectedDriverJobId=null;showNotice(`${job.job_number} POD saved and job delivered.`,'ok');render();}catch(error){showNotice(error.message,'error');render();}};

    const jobSearch = document.getElementById('job-search');
    if (jobSearch) jobSearch.oninput = event => { state.jobSearch = event.target.value; render(); requestAnimationFrame(()=>{const input=document.getElementById('job-search');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}}); };
    document.querySelectorAll('[data-job-archive-view]').forEach(button => button.onclick = () => {
      state.jobArchiveMode=button.dataset.jobArchiveView==='archived';
      state.jobEditorId=null;
      state.jobSearch='';
      render();
    });
    document.querySelectorAll('[data-restore-job]').forEach(button => button.onclick = async () => {
      const job=state.archivedJobs.find(item=>item.id===button.dataset.restoreJob);
      if(!job)return;
      button.disabled=true;
      try{
        const {data,error}=await db.rpc('restore_archived_job',{p_job_id:job.id});
        if(error)throw error;
        const restored={...job,...(data||{}),archived_at:null,archived_by:null};
        state.archivedJobs=state.archivedJobs.filter(item=>item.id!==job.id);
        state.jobs.unshift(restored);
        showNotice(`${job.job_number||'Job'} restored to active jobs.`,'ok');
        render();
      }catch(error){
        showNotice(`${error.message}. Run SUPABASE-v35.1-JOB-ARCHIVE.sql in Supabase first.`,'error');
        render();
      }
    });
    document.querySelectorAll('[data-delete-archived-job]').forEach(button => button.onclick = async () => {
      const job=state.archivedJobs.find(item=>item.id===button.dataset.deleteArchivedJob);
      if(!job)return;
      const confirmation=job.job_number||'DELETE';
      const typed=prompt(`Permanently delete ${job.job_number||'this archived job'}?\n\nThis cannot be undone. Type ${confirmation} to confirm.`);
      if(typed!==confirmation)return;
      button.disabled=true;
      try{
        const {error}=await db.rpc('delete_archived_job',{p_job_id:job.id});
        if(error)throw error;
        state.archivedJobs=state.archivedJobs.filter(item=>item.id!==job.id);
        showNotice(`${job.job_number||'Job'} permanently deleted. The deletion audit record was retained.`,'ok');
        render();
      }catch(error){
        showNotice(`${error.message}. Only archived jobs without an invoice can be permanently deleted.`,'error');
        render();
      }
    });
    const customerSearch = document.getElementById('customer-search');
    const customerHealthFilter = document.getElementById('customer-health-filter');
    const filterCustomerRows = () => {
      const term=(customerSearch?.value||'').toLowerCase(); const health=customerHealthFilter?.value||'';
      document.querySelectorAll('[data-customer-row]').forEach(row=>{const matchText=row.textContent.toLowerCase().includes(term);const matchHealth=!health||row.querySelector('.crm-health')?.classList.contains(health);row.style.display=matchText&&matchHealth?'':'none';});
    };
    if (customerSearch) customerSearch.oninput = filterCustomerRows;
    if (customerHealthFilter) customerHealthFilter.onchange = filterCustomerRows;
  }

  function filterRows(value) { const term = value.toLowerCase(); document.querySelectorAll('tbody tr').forEach(row => row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none'); }
  function filterCards(value) { const term = value.toLowerCase(); document.querySelectorAll('.customergrid article').forEach(card => card.style.display = card.textContent.toLowerCase().includes(term) ? '' : 'none'); }

  function printPodCertificate(job) {
    if (!job) { showNotice('POD certificate could not be opened.','error'); return; }
    const win = window.open('', '_blank');
    if (!win) { showNotice('Your browser blocked the POD window. Please allow pop-ups for KLS SameDay Office.','error'); return; }
    const delivered = job.delivered_at ? new Date(job.delivered_at).toLocaleString('en-GB',{dateStyle:'full',timeStyle:'short'}) : fmtDate(job.collection_date);
    win.document.write(`<html><head><title>POD ${esc(job.job_number || '')}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;color:#111;margin:0;padding:36px;background:#f4f4f5}.sheet{max-width:820px;margin:auto;background:#fff;padding:42px;box-shadow:0 10px 35px #0002}.toolbar{display:flex;justify-content:flex-end;gap:10px;margin-bottom:25px}.toolbar button{border:0;border-radius:8px;padding:12px 18px;font-weight:700;cursor:pointer}.primary{background:#111;color:#fff}.secondary{background:#e5e7eb}.brand{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:4px solid #111;padding-bottom:20px}.brand h1{font-size:34px;margin:0}.brand p{text-align:right;margin:0;line-height:1.5}.title{margin:28px 0}.title small{font-weight:800;letter-spacing:.14em}.title h2{font-size:28px;margin:5px 0}.route{display:grid;grid-template-columns:1fr 1fr;gap:16px}.box{background:#f4f4f5;border-radius:10px;padding:18px}.box small,.details small{display:block;font-weight:800;letter-spacing:.08em;margin-bottom:7px}.details{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:18px 0}.details div{border:1px solid #ddd;border-radius:10px;padding:15px}.images{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px}.images figure{margin:0;border:1px solid #ddd;border-radius:10px;padding:12px}.images img{display:block;width:100%;max-height:340px;object-fit:contain}.images figcaption{font-weight:700;margin-top:8px}.notes{margin-top:18px;border-left:4px solid #111;padding:12px 16px;background:#fafafa}footer{margin-top:30px;padding-top:18px;border-top:1px solid #ccc;font-size:13px}@media(max-width:650px){body{padding:0}.sheet{padding:22px}.route,.details,.images{grid-template-columns:1fr}.brand{display:block}.brand p{text-align:left;margin-top:12px}}@media print{body{padding:0;background:#fff}.sheet{box-shadow:none;max-width:none}.toolbar{display:none}}</style></head><body><main class="sheet"><div class="toolbar"><button class="secondary" onclick="window.close()">Close</button><button class="primary" onclick="window.print()">Print / Save PDF</button></div><header class="brand"><div><h1>${esc(state.settings.trading_name || 'KLS SameDay')}</h1><b>DEDICATED SAME-DAY LOGISTICS</b></div><p>${esc(state.settings.legal_name || '')}<br>${esc(state.settings.phone || '')}<br>${esc(state.settings.email || '')}</p></header><section class="title"><small>PROOF OF DELIVERY</small><h2>${esc(job.job_number || 'Delivery certificate')}</h2><p>This confirms that the delivery below was completed by KLS SameDay.</p></section><section class="route"><div class="box"><small>COLLECTION</small>${esc(job.collection_address || '—')}</div><div class="box"><small>DELIVERY</small>${esc(job.delivery_address || '—')}</div></section><section class="details"><div><small>CUSTOMER</small><b>${esc(job.customer_name || job.contact_name || '—')}</b></div><div><small>DELIVERED</small><b>${esc(delivered)}</b></div><div><small>RECEIVED BY</small><b>${esc(podRecipient(job) || 'Not recorded')}</b></div><div><small>DRIVER</small><b>${esc(job.assigned_driver_name || 'KLS Driver')}</b></div><div><small>VEHICLE</small><b>${esc(job.vehicle || '—')}</b></div><div><small>GOODS</small><b>${esc(job.goods_description || 'As booked')}</b></div></section>${job.pod_notes?`<div class="notes"><b>Delivery notes</b><p>${esc(job.pod_notes)}</p></div>`:''}<section class="images">${job.pod_photo_url?`<figure><img src="${esc(job.pod_photo_url)}" alt="POD delivery photo"><figcaption>Delivery photograph</figcaption></figure>`:''}${job.pod_signature_url?`<figure><img src="${esc(job.pod_signature_url)}" alt="Recipient signature"><figcaption>Recipient signature</figcaption></figure>`:''}</section><footer>Generated by KLS SameDay Operations Platform · Dedicated vehicle · No shared loads</footer></main></body></html>`);
    win.document.close(); win.focus();
  }

  function printDocument(type, row) {
    if (!row) { showNotice('Document could not be opened.', 'error'); return; }
    const quote = type === 'quote';
    const job = !quote ? allJobRecords().find(j => j.id === row.job_id) : null;
    const customer = state.customers.find(c => c.id === row.customer_id) || {};
    const number = quote ? row.quote_number : row.invoice_number;
    const total = Number(quote ? row.quoted_price : row.total || 0);
    const paid = quote ? 0 : invoicePaid(row);
    const balance = quote ? total : invoiceBalance(row);
    const win = window.open('', '_blank');
    if (!win) { showNotice('Your browser blocked the document window. Please allow pop-ups for KLS SameDay Office.', 'error'); return; }
    const bank = [state.settings.bank_name && `<b>Bank:</b> ${esc(state.settings.bank_name)}`, state.settings.sort_code && `<b>Sort code:</b> ${esc(state.settings.sort_code)}`, state.settings.account_number && `<b>Account:</b> ${esc(state.settings.account_number)}`].filter(Boolean).join('<br>') || 'Add your bank details in Settings.';
    const customerAddress = customer.address || customer.address_line || customer.billing_address || '';
    const serviceDate = job?.collection_date || job?.delivered_at || job?.created_at || row.issue_date;
    const paymentTerms = Number(state.settings.default_terms || 7);
    const customerAddressHtml = customerAddress
      ? `<br>${esc(customerAddress)}`
      : (!quote ? '<br><span class="address-warning">Customer address not recorded — update this customer before sending.</span>' : '');
    const docBody = quote ? `<section class="route"><div><small>COLLECTION</small><p>${esc(row.collection_address || '—')}</p></div><div><small>DELIVERY</small><p>${esc(row.delivery_address || '—')}</p></div></section><table><tr><th>Vehicle</th><td>${esc(row.vehicle || '—')}</td></tr><tr><th>Goods</th><td>${esc(row.goods_description || 'Courier service')}</td></tr></table>` : `<section class="summary"><div><small>ISSUE DATE</small><b>${fmtDate(row.issue_date)}</b></div><div><small>SERVICE DATE</small><b>${fmtDate(serviceDate)}</b></div><div><small>DUE DATE</small><b>${fmtDate(row.due_date)}</b></div><div><small>STATUS</small><b>${esc(invoiceDisplayStatus(row))}</b></div></section><table><thead><tr><th>Description</th><th class="right">Amount</th></tr></thead><tbody><tr><td><b>Dedicated same-day courier service</b><br><small>${esc(job?.job_number || '')}${job?.vehicle ? ` · ${esc(job.vehicle)}` : ''}</small>${job ? `<div class="route-line">${esc(job.collection_address || '')}<br>→ ${esc(job.delivery_address || '')}</div>` : ''}${job?.goods_description ? `<small>Goods: ${esc(job.goods_description)}</small>` : ''}</td><td class="right">${money(total)}</td></tr></tbody></table><section class="totals"><div><span>Invoice total</span><b>${money(total)}</b></div>${paid>0?`<div><span>Paid</span><b>− ${money(paid)}</b></div>`:''}<div class="balance"><span>Balance due</span><strong>${money(balance)}</strong></div></section><section class="payment"><h3>Payment details</h3><p>${bank}</p><p>Payment reference: <b>${esc(row.invoice_number)}</b></p><p><b>Payment terms:</b> Due within ${paymentTerms} days.</p></section>`;
    win.document.write(`<!doctype html><html><head><title>${esc(number)}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111;margin:0;background:#eef0f3}.page{max-width:850px;margin:24px auto;background:#fff;padding:46px;box-shadow:0 12px 40px #0002}.toolbar{max-width:850px;margin:18px auto 0;display:flex;gap:10px;justify-content:flex-end}.toolbar button{border:0;border-radius:9px;padding:12px 18px;font-weight:800;cursor:pointer}.print{background:#111;color:#fff}.close{background:#fff}.brand{display:flex;justify-content:space-between;border-bottom:4px solid #111;padding-bottom:22px}.logo b{font-size:42px;letter-spacing:-3px}.logo span{display:block;font-weight:800;letter-spacing:3px}.company{text-align:right;font-size:13px;line-height:1.6}.document-head{display:flex;justify-content:space-between;align-items:flex-end;margin:34px 0}.document-head h1{font-size:34px;margin:0}.document-head strong{font-size:20px}.billto{background:#f4f4f5;padding:18px;border-radius:10px;margin-bottom:24px}.billto small,.summary small,.route small{font-weight:800;letter-spacing:1px;color:#666}.billto p{line-height:1.55;margin:8px 0 0}.address-warning{display:inline-block;margin-top:8px;color:rgb(155,28,28);font-weight:700}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:26px}.summary div{background:#f4f4f5;padding:14px;border-radius:8px}.summary b{display:block;margin-top:6px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:16px 12px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}.right{text-align:right}.route-line{margin:10px 0;line-height:1.45}.totals{margin-left:auto;width:min(360px,100%)}.totals div{display:flex;justify-content:space-between;padding:9px 0}.totals .balance{border-top:3px solid #111;margin-top:6px;padding-top:14px;font-size:20px}.payment{margin-top:36px;padding:20px;background:#f4f4f5;border-radius:10px}.route{display:grid;grid-template-columns:1fr 1fr;gap:15px}.route div{background:#f4f4f5;padding:18px;border-radius:10px}.footer{margin-top:38px;padding-top:18px;border-top:1px solid #ddd;color:#555;font-size:12px;text-align:center}@media(max-width:650px){.page{margin:0;padding:24px}.toolbar{margin:8px}.brand,.document-head{display:block}.company{text-align:left;margin-top:15px}.summary,.route{grid-template-columns:1fr}}@media print{body{background:#fff}.toolbar{display:none}.page{box-shadow:none;margin:0;max-width:none;padding:20px}}</style></head><body><div class="toolbar"><button class="close" onclick="window.close()">Close</button><button class="print" onclick="window.print()">Print / Save PDF</button></div><main class="page"><header class="brand"><div class="logo"><b>KLS</b><span>SAMEDAY</span></div><div class="company"><b>${esc(state.settings.legal_name)}</b><br>Company no. ${esc(companyRegistration.number)}<br>Registered office: ${esc(companyRegistration.registeredOffice)}<br>${esc(state.settings.email)} · ${esc(state.settings.phone)}<br>${esc(state.settings.website)}</div></header><section class="document-head"><div><small>${quote?'QUOTATION':'NOT VAT REGISTERED'}</small><h1>${quote?'Quotation':'Invoice'}</h1></div><strong>${esc(number)}</strong></section><section class="billto"><small>${quote?'PREPARED FOR':'BILL TO'}</small><p><b>${esc(row.customer_name || customer.company || 'Customer')}</b>${customer.contact_name?`<br>${esc(customer.contact_name)}`:''}${customerAddressHtml}${customer.email?`<br>${esc(customer.email)}`:''}</p></section>${docBody}<footer class="footer">${esc(state.settings.legal_name)} · Company no. ${esc(companyRegistration.number)} · Registered office: ${esc(companyRegistration.registeredOffice)}</footer></main></body></html>`);
    win.document.close(); win.focus();
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

  let officePollId=null;
  async function refreshOfficeJobsNow(){
    if(!db||!state.user||state.portalUser)return;
    const [active,archived]=await Promise.all([
      db.from('jobs').select('*').is('archived_at',null).order('created_at',{ascending:false}),
      db.from('jobs').select('*').not('archived_at','is',null).order('archived_at',{ascending:false})
    ]);
    if(active.error||archived.error)return;
    state.jobs=(active.data||[]).map(j=>({...j,customer_name:j.customer_name||j.contact_name||''}));
    state.archivedJobs=(archived.data||[]).map(j=>({...j,customer_name:j.customer_name||j.contact_name||''}));
    if(state.page==='jobs'||state.page==='dispatch'||state.page==='planner')render();
  }
  window.addEventListener('focus',refreshOfficeJobsNow);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshOfficeJobsNow();});

  function startOfficePolling(){
    if(officePollId)clearInterval(officePollId);
    officePollId=setInterval(async()=>{
      if(!db||!state.user||state.portalUser||document.hidden)return;
      const [active,archived]=await Promise.all([
        db.from('jobs').select('*').is('archived_at',null).order('created_at',{ascending:false}),
        db.from('jobs').select('*').not('archived_at','is',null).order('archived_at',{ascending:false})
      ]);
      if(active.error||archived.error)return;
      const next=(active.data||[]).map(j=>({...j,customer_name:j.customer_name||j.contact_name||''}));
      const nextArchived=(archived.data||[]).map(j=>({...j,customer_name:j.customer_name||j.contact_name||''}));
      const before=JSON.stringify({
        active:state.jobs.map(j=>[j.id,j.job_status,j.assigned_driver_id,j.updated_at,j.delivered_at,j.pod_photo_url]),
        archived:state.archivedJobs.map(j=>[j.id,j.archived_at,j.updated_at])
      });
      const after=JSON.stringify({
        active:next.map(j=>[j.id,j.job_status,j.assigned_driver_id,j.updated_at,j.delivered_at,j.pod_photo_url]),
        archived:nextArchived.map(j=>[j.id,j.archived_at,j.updated_at])
      });
      if(before!==after){state.jobs=next;state.archivedJobs=nextArchived;render();}
    },5000);
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


  // v28.1 Professional UX: keyboard command palette and calmer feedback.
  const quickPages = [
    ['dashboard','Dashboard'],['operations','Today’s Planner'],['dispatch','Live Dispatch'],['jobs','Jobs'],
    ['newquote','New Quote'],['quotes','Quotes'],['customers','Customers'],['pipeline','Sales Pipeline'],
    ['drivers','Driver Control'],['fleetcentre','Driver & Fleet Centre'],['tracking','Live Tracking'],
    ['routes','Route Planner'],['schedule','Booking Calendar'],['invoices','Invoices'],['accounts','Finance Centre'],
    ['businessintel','BI Dashboard'],['profitcentre','Job Profit Control'],['reports','Business Reports'],['settings','Settings']
  ];

  function closeCommandPalette(){ document.getElementById('kls-command-palette')?.remove(); }
  function openCommandPalette(){
    if (!state.user || document.getElementById('kls-command-palette')) return;
    const wrap=document.createElement('div');
    wrap.id='kls-command-palette'; wrap.className='command-palette-backdrop';
    wrap.innerHTML=`<section class="command-palette" role="dialog" aria-modal="true" aria-label="Quick navigation">
      <header><span>⌕</span><input id="command-search" autocomplete="off" placeholder="Search pages…" aria-label="Search pages"><kbd>Esc</kbd></header>
      <div class="command-results">${quickPages.map(([key,label],i)=>`<button data-command-page="${key}" class="${i===0?'selected':''}"><span>${esc(label)}</span><small>Open page</small><b>↵</b></button>`).join('')}</div>
      <footer><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span>Ctrl/⌘ + K</span></footer>
    </section>`;
    document.body.appendChild(wrap);
    const input=wrap.querySelector('input');
    const resultBox=wrap.querySelector('.command-results');
    const buttons=()=>[...resultBox.querySelectorAll('button:not([hidden])')];
    const select=(index)=>{const list=buttons(); if(!list.length)return; list.forEach(b=>b.classList.remove('selected')); list[(index+list.length)%list.length].classList.add('selected'); list[(index+list.length)%list.length].scrollIntoView({block:'nearest'});};
    const openSelected=()=>{const chosen=resultBox.querySelector('button.selected:not([hidden])')||buttons()[0]; if(!chosen)return; state.page=chosen.dataset.commandPage; closeCommandPalette(); render(); window.scrollTo({top:0,behavior:'smooth'});};
    input.addEventListener('input',()=>{const q=input.value.trim().toLowerCase(); [...resultBox.children].forEach(b=>{b.hidden=!b.textContent.toLowerCase().includes(q); b.classList.remove('selected')}); select(0);});
    input.addEventListener('keydown',e=>{const list=buttons(); const idx=Math.max(0,list.findIndex(b=>b.classList.contains('selected'))); if(e.key==='ArrowDown'){e.preventDefault();select(idx+1)} if(e.key==='ArrowUp'){e.preventDefault();select(idx-1)} if(e.key==='Enter'){e.preventDefault();openSelected()} if(e.key==='Escape'){closeCommandPalette()}});
    resultBox.addEventListener('click',e=>{const button=e.target.closest('[data-command-page]'); if(!button)return; state.page=button.dataset.commandPage; closeCommandPalette(); render(); window.scrollTo({top:0,behavior:'smooth'});});
    wrap.addEventListener('mousedown',e=>{if(e.target===wrap)closeCommandPalette()});
    requestAnimationFrame(()=>input.focus());
  }

  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommandPalette();}
    if(e.key==='Escape'){
      closeCommandPalette();
      const close=document.querySelector('[data-close],[data-close-defect],[data-action="menu-close"]');
      if(close && document.querySelector('.modalback,.modal-backdrop,.pod-overlay,.side.open')) close.click();
    }
  });

  const uxObserver=new MutationObserver(()=>{
    document.querySelectorAll('.notice:not([data-ux-ready])').forEach(notice=>{
      notice.dataset.uxReady='1';
      notice.setAttribute('role',notice.classList.contains('error')?'alert':'status');
      if(!notice.classList.contains('error')) setTimeout(()=>{
        if(notice.isConnected){notice.classList.add('notice-leaving'); setTimeout(()=>notice.querySelector('[data-action="notice-close"]')?.click(),220);}
      },5000);
    });
  });
  uxObserver.observe(document.getElementById('app'),{childList:true,subtree:true});


  initialise();
})();
