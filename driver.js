(() => {
  const raw = window.KLS_CONFIG || {};
  const root = document.getElementById('driver-app');
  const url = String(raw.supabaseUrl || '').trim();
  const key = String(raw.supabaseAnonKey || '').trim();
  const db = url && key && window.supabase ? window.supabase.createClient(url, key) : null;
  const steps = ['Booked','En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery','Delivered'];
  let state = { user:null, profile:null, jobs:[], loading:true, mode:'signin', notice:null, podJob:null,tab:'jobs',networkJobs:[],myBids:[] };
  let watchId = null;
  let activeJobId = null;
  let signatureCanvas = null;
  let drawing = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=value=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'GBP'}).format(Number(value||0));
  const fmtDate = value => value ? new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) : 'Date TBC';
  const nowPosition = () => new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:15000,maximumAge:5000}));
  const notice = (text,type='ok') => { state.notice={text,type}; render(); };
  const mapsLink = address => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`;

  function authView(){
    const signup=state.mode==='signup';
    return `<div class="driver-auth"><section class="driver-auth-card"><div class="driver-brand"><b>KLS</b><span>Driver<small>SameDay mobile app</small></span></div><h1>${signup?'Create driver login':'Driver sign in'}</h1><p>Only assigned jobs, navigation, tracking and proof of delivery are shown here. Prices and office accounts are not available.</p>${state.notice?`<div class="driver-msg ${state.notice.type}">${esc(state.notice.text)}</div>`:''}<form id="driver-auth-form"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" minlength="6" autocomplete="current-password" required></label><button class="btn primary full">${signup?'Create login':'Sign in'}</button></form><div class="auth-switch">${signup?'Already registered?':'First time?'} <button data-mode="${signup?'signin':'signup'}">${signup?'Sign in':'Create driver login'}</button></div></section></div>`;
  }

  function nextAction(job){
    const map={
      'Booked':['Start job','En Route to Collection'],
      'En Route to Collection':['Arrived at collection','Arrived at Collection'],
      'Arrived at Collection':['Goods collected','Collected'],
      'Collected':['Start delivery','In Transit'],
      'In Transit':['Arrived at delivery','Arrived at Delivery']
    };
    return map[job.job_status] || null;
  }

  function jobCard(job){
    const action=nextAction(job); const idx=Math.max(0,steps.indexOf(job.job_status));
    const destination=['Booked','En Route to Collection','Arrived at Collection'].includes(job.job_status)?job.collection_address:job.delivery_address;
    const active=activeJobId===job.id && watchId!==null;
    return `<article class="job-card ${active?'active':''}"><div class="job-head"><div><small>${fmtDate(job.collection_date)} ${esc(String(job.collection_time||'').slice(0,5))}</small><h2>${esc(job.job_number||'Job')}</h2></div><span class="status">${esc(job.job_status||'Booked')}</span></div><div class="job-customer">${esc(job.customer_name||job.contact_name||'Customer')}</div><div class="progress">${steps.slice(0,6).map((_,i)=>`<span class="${i<idx?'done':''}"></span>`).join('')}</div><div class="job-route"><p><small>COLLECTION</small>${esc(job.collection_address||'')}</p><p><small>DELIVERY</small>${esc(job.delivery_address||'')}</p>${job.goods_description?`<p><small>GOODS</small>${esc(job.goods_description)}</p>`:''}</div><div class="job-actions"><a class="btn secondary" target="_blank" rel="noopener" href="${mapsLink(destination)}">Navigate</a>${job.customer_phone?`<a class="btn secondary" href="tel:${esc(job.customer_phone)}">Call customer</a>`:''}${action?`<button class="btn primary full" data-status-job="${job.id}" data-status="${esc(action[1])}">${esc(action[0])}</button>`:''}${job.job_status==='Arrived at Delivery'?`<button class="btn primary full" data-pod="${job.id}">Complete POD</button>`:''}${job.job_status==='Delivered'?`<button class="btn secondary full" disabled>Delivered ✓</button>`:''}</div></article>`;
  }

  function exchangeView(){
    const bidFor=id=>state.myBids.find(b=>b.network_job_id===id);
    const jobs=state.networkJobs.filter(j=>j.status==='Open'||bidFor(j.id));
    const cards=jobs.length?jobs.map(j=>{const bid=bidFor(j.id);return `<article class="job-card exchange-driver-card"><div class="job-head"><div><small>${esc(j.vehicle_required||'Any vehicle')} · ${fmtDate(j.collection_date)} ${esc(String(j.collection_time||'').slice(0,5))}</small><h2>${esc(j.collection_area||'Collection')} → ${esc(j.delivery_area||'Delivery')}</h2></div>${bid?`<span class="job-status">${esc(bid.status)}</span>`:'<span class="job-status">Available</span>'}</div><div class="route"><div><small>COLLECTION AREA</small><p>${esc(j.collection_area||'')}</p></div><div class="arrow">↓</div><div><small>DELIVERY AREA</small><p>${esc(j.delivery_area||'')}</p></div></div><div class="exchange-driver-meta"><span>${Number(j.approx_miles||0).toFixed(0)} miles</span><span>${esc(j.load_description||'Load details not entered')}</span>${j.weight_kg?`<span>${esc(j.weight_kg)} kg</span>`:''}</div>${j.notes?`<p>${esc(j.notes)}</p>`:''}${bid?`<div class="my-offer"><small>YOUR OFFER</small><b>${money(bid.amount)}</b>${bid.message?`<p>${esc(bid.message)}</p>`:''}</div>`:`<form class="driver-bid-form" data-network-bid="${j.id}"><label>Your price (£)<input name="amount" type="number" min="1" step="0.01" required></label><label>Optional message<textarea name="message" rows="2" placeholder="Available now, vehicle details, ETA to collection…"></textarea></label><button class="btn primary full">Submit offer</button></form>`}</article>`}).join(''):'<div class="empty">No network jobs are available at the moment.</div>';
    return `<section class="driver-welcome"><small>KLS DRIVER NETWORK</small><h1>Available Work</h1><p>Submit your price for jobs you can complete. Customer charges are never shown.</p></section><div class="job-list">${cards}</div>`;
  }

  function appView(){
    const active=state.jobs.filter(j=>!['Delivered','Cancelled'].includes(j.job_status));
    return `<div class="driver-shell"><header class="driver-top"><div><strong>KLS Driver</strong><small>${esc(state.profile?.driver_name||state.user?.email||'')}</small></div><button class="btn secondary" data-signout>Sign out</button></header><main class="driver-main">${state.notice?`<div class="driver-msg ${state.notice.type}">${esc(state.notice.text)}</div>`:''}${watchId!==null?`<div class="active-banner"><span>● Live tracking active</span><b>${esc(state.jobs.find(j=>j.id===activeJobId)?.job_number||'Job')}</b></div>`:''}<nav class="driver-tabs"><button class="${state.tab==='jobs'?'active':''}" data-driver-tab="jobs">My Jobs</button><button class="${state.tab==='network'?'active':''}" data-driver-tab="network">Available Work${state.networkJobs.filter(j=>j.status==='Open'&&!state.myBids.some(b=>b.network_job_id===j.id)).length?` <span>${state.networkJobs.filter(j=>j.status==='Open'&&!state.myBids.some(b=>b.network_job_id===j.id)).length}</span>`:''}</button></nav>${state.tab==='network'?exchangeView():`<section class="driver-welcome"><small>TODAY'S WORK</small><h1>${active.length} active job${active.length===1?'':'s'}</h1><p>Tracking begins when you start a job and stops only after the POD is completed.</p></section><div class="job-list">${state.jobs.length?state.jobs.map(jobCard).join(''):'<div class="empty">No jobs are assigned to you.</div>'}</div>`}</main>${state.podJob?podView(state.podJob):''}</div>`;
  }

  function podView(job){
    return `<div class="pod-overlay"><section class="pod-sheet"><div class="pod-head"><div><small>PROOF OF DELIVERY</small><h2>${esc(job.job_number||'Job')}</h2></div><button data-close-pod>×</button></div><p class="tracking-note">Photo, signature and recipient name are required. Live tracking will stop only after all POD details are uploaded successfully.</p><form id="driver-pod-form" class="pod-form"><label>Recipient name<input name="recipient_name" required></label><label>Delivery photo<input name="photo" type="file" accept="image/*" capture="environment" required></label><label>Signature<canvas id="driver-signature" class="signature" width="700" height="280"></canvas></label><button class="btn secondary" type="button" data-clear-signature>Clear signature</button><label>Notes<textarea name="notes" rows="3"></textarea></label><div class="pod-actions"><button class="btn primary full">Upload POD & complete job</button><button class="btn secondary full" type="button" data-close-pod>Cancel</button></div></form></section></div>`;
  }

  function render(){
    if(state.loading){root.innerHTML='<div class="driver-loading">Loading KLS Driver…</div>';return;}
    if(!state.user){root.innerHTML=authView();bindAuth();return;}
    if(!state.profile){root.innerHTML=`<div class="driver-auth"><section class="driver-auth-card"><div class="driver-brand"><b>KLS</b><span>Driver</span></div><h1>Account not linked</h1><p>Ask the KLS office to add this exact login email to your driver record:</p><div class="driver-msg error">${esc(state.user.email)}</div><button class="btn secondary full" data-signout>Sign out</button></section></div>`;bindCommon();return;}
    root.innerHTML=appView();bindApp();
  }

  function bindCommon(){document.querySelectorAll('[data-signout]').forEach(b=>b.onclick=async()=>{stopTracking(false);await db.auth.signOut();});}
  function bindAuth(){
    document.querySelector('[data-mode]')?.addEventListener('click',e=>{state.mode=e.currentTarget.dataset.mode;state.notice=null;render();});
    document.getElementById('driver-auth-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));try{if(!db)throw new Error('Supabase is not configured.');if(state.mode==='signup'){const{data,error}=await db.auth.signUp({email:f.email,password:f.password});if(error)throw error;if(!data.session){state.notice={text:'Login created. Confirm the email, then sign in.',type:'ok'};render();return;}}else{const{error}=await db.auth.signInWithPassword({email:f.email,password:f.password});if(error)throw error;}}catch(error){state.notice={text:error.message,type:'error'};render();}});
  }

  function bindApp(){
    bindCommon();
    document.querySelectorAll('[data-driver-tab]').forEach(btn=>btn.onclick=()=>{state.tab=btn.dataset.driverTab;render();});
    document.querySelectorAll('[data-network-bid]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const button=form.querySelector('button');try{button.disabled=true;button.textContent='Submitting…';const{data,error}=await db.rpc('submit_driver_bid',{p_network_job_id:form.dataset.networkBid,p_amount:Number(fd.get('amount')),p_message:fd.get('message')||null});if(error)throw error;state.myBids.unshift(data);notice('Your offer has been sent to KLS.','ok');}catch(error){button.disabled=false;button.textContent='Submit offer';notice(error.message,'error');}});
    document.querySelectorAll('[data-status-job]').forEach(btn=>btn.onclick=()=>advanceStatus(btn.dataset.statusJob,btn.dataset.status));
    document.querySelectorAll('[data-pod]').forEach(btn=>{btn.onclick=()=>{state.podJob=state.jobs.find(j=>j.id===btn.dataset.pod);render();};});
    document.querySelectorAll('[data-close-pod]').forEach(btn=>btn.onclick=()=>{state.podJob=null;render();});
    setupSignature();
    document.getElementById('driver-pod-form')?.addEventListener('submit',completePod);
  }

  async function loadDriver(){
    state.loading=true;render();
    try{
      const {data:claimed,error:claimError}=await db.rpc('claim_my_driver_account');
      if(claimError)throw claimError;
      state.profile=Array.isArray(claimed)?claimed[0]:claimed;
      if(state.profile){const[{data,error},{data:network,error:networkError},{data:bids,error:bidsError}]=await Promise.all([db.rpc('get_my_driver_jobs'),db.rpc('get_my_driver_network_jobs'),db.from('driver_bids').select('*').eq('driver_id',state.profile.linked_driver_id).order('created_at',{ascending:false})]);if(error)throw error;if(networkError)throw networkError;if(bidsError)throw bidsError;state.jobs=data||[];state.networkJobs=network||[];state.myBids=bids||[];const active=state.jobs.find(j=>['En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery'].includes(j.job_status));if(active)startTracking(active.id,false);}
    }catch(error){state.notice={text:error.message,type:'error'};}
    state.loading=false;render();
  }

  async function advanceStatus(jobId,status){
    try{
      const pos=await nowPosition().catch(()=>null);
      const {error}=await db.rpc('driver_update_job_status',{p_job_id:jobId,p_status:status,p_latitude:pos?.coords.latitude??null,p_longitude:pos?.coords.longitude??null,p_accuracy:pos?.coords.accuracy??null});
      if(error)throw error;
      const job=state.jobs.find(j=>j.id===jobId);if(job)job.job_status=status;
      if(status==='En Route to Collection')startTracking(jobId,true);
      else if(['Arrived at Collection','Collected','In Transit','Arrived at Delivery'].includes(status)&&watchId===null)startTracking(jobId,false);
      notice(`${job?.job_number||'Job'} updated to ${status}.`,'ok');
    }catch(error){notice(error.message,'error');}
  }

  function startTracking(jobId,show=true){
    if(!navigator.geolocation){if(show)notice('Location tracking is not supported on this device.','error');return;}
    stopTracking(false);activeJobId=jobId;
    const push=async pos=>{const{error}=await db.rpc('driver_update_location',{p_job_id:jobId,p_latitude:pos.coords.latitude,p_longitude:pos.coords.longitude,p_accuracy:pos.coords.accuracy??null});if(error&&show)notice(error.message,'error');};
    watchId=navigator.geolocation.watchPosition(push,error=>{state.notice={text:`Location error: ${error.message}`,type:'error'};render();},{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
    if(show)notice('Live tracking started. Keep KLS Driver open during the job.','ok');else render();
  }

  function stopTracking(show=true){if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;}activeJobId=null;if(show)notice('Tracking stopped.','ok');}

  function setupSignature(){
    signatureCanvas=document.getElementById('driver-signature');if(!signatureCanvas)return;
    const ctx=signatureCanvas.getContext('2d');ctx.strokeStyle='#111';ctx.lineWidth=4;ctx.lineCap='round';
    const point=e=>{const r=signatureCanvas.getBoundingClientRect();const t=e.touches?.[0]||e;return{x:(t.clientX-r.left)*(signatureCanvas.width/r.width),y:(t.clientY-r.top)*(signatureCanvas.height/r.height)}};
    const start=e=>{e.preventDefault();drawing=true;const p=point(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};
    const move=e=>{if(!drawing)return;e.preventDefault();const p=point(e);ctx.lineTo(p.x,p.y);ctx.stroke()};
    const end=()=>{drawing=false};
    signatureCanvas.addEventListener('pointerdown',start);signatureCanvas.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
    document.querySelector('[data-clear-signature]')?.addEventListener('click',()=>ctx.clearRect(0,0,signatureCanvas.width,signatureCanvas.height));
  }

  function signatureIsBlank(){if(!signatureCanvas)return true;const blank=document.createElement('canvas');blank.width=signatureCanvas.width;blank.height=signatureCanvas.height;return signatureCanvas.toDataURL()===blank.toDataURL();}
  async function upload(job,file,type){const ext=type==='signature'?'png':((file.name||'photo.jpg').split('.').pop()||'jpg');const path=`${state.user.id}/${job.id}/${type}-${Date.now()}.${ext}`;const{error}=await db.storage.from('pod').upload(path,file,{contentType:file.type||'image/jpeg'});if(error)throw error;return db.storage.from('pod').getPublicUrl(path).data.publicUrl;}

  async function completePod(e){
    e.preventDefault();const job=state.podJob;const form=e.currentTarget;const btn=form.querySelector('button[type="submit"]');
    try{
      if(signatureIsBlank())throw new Error('Please obtain the recipient signature.');
      btn.disabled=true;btn.textContent='Uploading POD…';
      const fd=new FormData(form);const photo=fd.get('photo');if(!photo?.size)throw new Error('Please take a delivery photo.');
      const photoUrl=await upload(job,photo,'photo');const blob=await new Promise(resolve=>signatureCanvas.toBlob(resolve,'image/png'));const signatureUrl=await upload(job,blob,'signature');const pos=await nowPosition().catch(()=>null);
      const{error}=await db.rpc('driver_complete_job',{p_job_id:job.id,p_recipient_name:fd.get('recipient_name'),p_pod_notes:fd.get('notes')||null,p_photo_url:photoUrl,p_signature_url:signatureUrl,p_latitude:pos?.coords.latitude??null,p_longitude:pos?.coords.longitude??null});if(error)throw error;
      job.job_status='Delivered';job.delivered_at=new Date().toISOString();job.recipient_name=fd.get('recipient_name');job.pod_photo_url=photoUrl;job.pod_signature_url=signatureUrl;state.podJob=null;stopTracking(false);notice(`${job.job_number||'Job'} delivered. POD has been sent back to the office.`,'ok');
    }catch(error){btn.disabled=false;btn.textContent='Upload POD & complete job';notice(error.message,'error');}
  }

  async function init(){
    if(!db){state.loading=false;state.notice={text:'Supabase settings are missing.',type:'error'};render();return;}
    const{data:{session}}=await db.auth.getSession();state.user=session?.user||null;
    db.auth.onAuthStateChange(async(_event,sessionNow)=>{state.user=sessionNow?.user||null;if(state.user)await loadDriver();else{stopTracking(false);state.profile=null;state.jobs=[];state.loading=false;render();}});
    if(state.user)await loadDriver();else{state.loading=false;render();}
  }
  init();
})();
