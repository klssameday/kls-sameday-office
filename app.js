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

  const navItems = [['dashboard','Dashboard'],['newquote','New Quote'],['quotes','Quotes'],['jobs','Jobs'],['invoices','Invoices'],['customers','Customers'],['settings','Settings']];

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
  const card = (title, value) => `<div class="card"><span>◆</span><div><small>${title}</small><b>${value}</b></div></div>`;

  function dashboard() {
    const now = new Date();
    const monthJobs = state.jobs.filter(job => {
      const date = new Date(job.created_at);
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear() && job.job_status !== 'Cancelled';
    });
    const revenue = monthJobs.reduce((sum, job) => sum + Number(job.total_price || 0), 0);
    const outstanding = state.invoices.filter(inv => inv.status !== 'Paid').reduce((sum, inv) => sum + Number(inv.total || 0), 0);
    return `<section class="hero"><div><small>FAST QUOTING</small><h2>Quote it. Book it. Invoice it.</h2><p>Permanent online storage for your same-day courier work.</p></div><button data-page="newquote">＋ NEW QUOTE</button></section>
      <section class="cards">${card('Pending quotes', state.quotes.filter(q => q.status === 'Pending').length)}${card('Active jobs', state.jobs.filter(j => !['Delivered','Cancelled'].includes(j.job_status)).length)}${card('This month', money(revenue))}${card('Outstanding', money(outstanding))}</section>
      ${panel('Latest jobs', jobTable(state.jobs.slice(0, 8)))}`;
  }

  function newQuote() {
    return panel('Create a new quote', `<form id="quote-form">
      <div class="grid"><label>Customer / company *<input name="company" required></label><label>Contact name<input name="contact_name"></label><label>Telephone<input name="phone"></label></div>
      <div class="grid"><label>Email<input name="email" type="email"></label><label>Collection date<input name="collection_date" type="date" value="${todayISO()}"></label><label>Collection time<input name="collection_time" type="time"></label></div>
      <div class="grid two"><label>Collection address *<textarea name="collection_address" required></textarea></label><label>Delivery address *<textarea name="delivery_address" required></textarea></label></div>
      <div class="grid"><label>Vehicle<select name="vehicle">${Object.keys(vehicles).map(v => `<option>${v}</option>`).join('')}</select></label><label>Distance (miles)<input name="miles" type="number" min="0" step="0.1"></label><label>Your quoted price<input name="quoted_price" type="number" min="0" step="0.01"><em id="suggestion">Suggested: £65.00</em></label></div>
      <label>Goods description<input name="goods_description"></label><label>Notes<textarea name="notes"></textarea></label>
      <div class="actions"><button type="reset" class="secondary">Clear</button><button class="primary">Save Quote</button></div>
    </form>`, 'Give the customer a price first, then convert it into a job if accepted.');
  }

  function table(headers, rows) {
    return `<div class="tablewrap"><table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="empty">Nothing here yet.</td></tr>`}</tbody></table></div>`;
  }

  function quotesView() {
    return panel('Quotes', table(['Quote','Customer','Route','Vehicle','Price','Status','Actions'], state.quotes.map(q => [
      esc(q.quote_number), esc(q.customer_name), `${esc(q.collection_address)}<br><i>→ ${esc(q.delivery_address)}</i>`, esc(q.vehicle), money(q.quoted_price), esc(q.status),
      `<button data-print-quote="${q.id}">Print</button>${q.status === 'Pending' ? `<button data-accept="${q.id}">Accept → Job</button>` : ''}`
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
    const views = { dashboard, newquote: newQuote, quotes: quotesView, jobs: jobsView, invoices: invoicesView, customers: customersView, settings: settingsView };
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

  function bindApp() {
    document.querySelectorAll('[data-page]').forEach(button => button.onclick = () => { state.page = button.dataset.page; render(); });
    document.querySelector('[data-action="menu-open"]')?.addEventListener('click', () => document.getElementById('side').classList.add('open'));
    document.querySelector('[data-action="menu-close"]')?.addEventListener('click', () => document.getElementById('side').classList.remove('open'));
    document.querySelector('[data-action="notice-close"]')?.addEventListener('click', () => { state.notice = null; render(); });
    document.querySelector('[data-action="signout"]')?.addEventListener('click', async () => { await db.auth.signOut(); state.user = null; state.customers=[]; state.quotes=[]; state.jobs=[]; state.invoices=[]; render(); });

    const quoteForm = document.getElementById('quote-form');
    if (quoteForm) {
      const calculate = () => {
        const miles = Number(quoteForm.miles.value || 0);
        const rate = vehicles[quoteForm.vehicle.value];
        const suggested = Math.max(rate.minimum, miles * rate.ppm);
        document.getElementById('suggestion').textContent = `Suggested: ${money(suggested)}`;
        if (!quoteForm.quoted_price.value) quoteForm.quoted_price.value = suggested.toFixed(2);
      };
      quoteForm.vehicle.onchange = () => { quoteForm.quoted_price.value = ''; calculate(); };
      quoteForm.miles.oninput = () => { quoteForm.quoted_price.value = ''; calculate(); };
      calculate();
      quoteForm.onsubmit = async e => {
        e.preventDefault();
        const button = quoteForm.querySelector('button.primary'); button.disabled = true; button.textContent = 'Saving…';
        try {
          const form = Object.fromEntries(new FormData(quoteForm));
          const customer = await findOrCreateCustomer(form);
          const rate = vehicles[form.vehicle]; const miles = Number(form.miles || 0); const suggested = Math.max(rate.minimum, miles * rate.ppm);
          const payload = {
            user_id: state.user.id, customer_id: customer.id, quote_number: numberCode('Q'), customer_name: form.company,
            contact_name: form.contact_name || null, phone: form.phone || null, email: form.email || null,
            collection_date: form.collection_date || null, collection_time: form.collection_time || null,
            collection_address: form.collection_address, delivery_address: form.delivery_address, vehicle: form.vehicle,
            goods_description: form.goods_description || null, miles, quoted_price: Number(form.quoted_price || suggested), notes: form.notes || null, status: 'Pending'
          };
          const { data, error } = await db.from('quotes').insert(payload).select().single();
          if (error) throw error;
          state.quotes.unshift(data); showNotice(`${data.quote_number} saved permanently.`, 'ok'); state.page = 'quotes'; render();
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
        quote.status = 'Accepted'; quote.job_id = job.id; state.jobs.unshift({ ...job, customer_name: quote.customer_name });
        showNotice(`${job.job_number || 'Job'} created.`, 'ok'); state.page = 'jobs'; render();
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
        state.invoices.unshift(invoice); job.invoice_status = 'Invoiced'; showNotice(`${invoice.invoice_number} created.`, 'ok'); state.page = 'invoices'; render();
      } catch (error) { showNotice(error.message, 'error'); render(); }
    });

    document.querySelectorAll('[data-invoice-status]').forEach(select => select.onchange = async () => {
      const invoice = state.invoices.find(i => i.id === select.dataset.invoiceStatus); const previous = invoice.status; invoice.status = select.value;
      const { error } = await db.from('invoices').update({ status: select.value, paid_date: select.value === 'Paid' ? todayISO() : null }).eq('id', invoice.id);
      if (error) { invoice.status = previous; showNotice(error.message, 'error'); render(); }
    });

    document.querySelectorAll('[data-print-quote]').forEach(button => button.onclick = () => printDocument('quote', state.quotes.find(q => q.id === button.dataset.printQuote)));
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
    const quote = type === 'quote'; const job = !quote ? state.jobs.find(j => j.id === row.job_id) : null;
    const number = quote ? row.quote_number : row.invoice_number; const total = quote ? row.quoted_price : row.total;
    const win = window.open('', '_blank');
    win.document.write(`<html><head><title>${esc(number)}</title><style>body{font-family:Arial;padding:40px;color:#111}header{border-bottom:3px solid #111;margin-bottom:25px}h1{margin-bottom:5px}.total{text-align:right;font-size:26px;font-weight:bold;margin-top:35px}.route{padding:14px;background:#f4f4f5;border-radius:8px}</style></head><body><header><h1>${esc(state.settings.trading_name)}</h1><p>${esc(state.settings.legal_name)}<br>${esc(state.settings.email)} · ${esc(state.settings.phone)}<br>${esc(state.settings.address_line)}</p></header><h2>${quote ? 'QUOTATION' : 'INVOICE'} ${esc(number)}</h2><p><b>Customer:</b> ${esc(row.customer_name)}</p>${quote ? `<div class="route"><p><b>Collection:</b> ${esc(row.collection_address)}</p><p><b>Delivery:</b> ${esc(row.delivery_address)}</p><p><b>Vehicle:</b> ${esc(row.vehicle)}</p></div>` : `<p><b>Job:</b> ${esc(job?.job_number || '')}</p><p><b>Issue:</b> ${fmtDate(row.issue_date)}</p><p><b>Due:</b> ${fmtDate(row.due_date)}</p>`}<div class="total">Total: ${money(total)}</div><p>Payment terms: ${esc(state.settings.default_terms)} days</p><p>${esc(state.settings.bank_name)} ${esc(state.settings.sort_code)} ${esc(state.settings.account_number)}</p></body></html>`);
    win.document.close(); win.print();
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
