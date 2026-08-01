// KLS SameDay Driver v35.4.8 — background job push notifications
(() => {
  const raw = window.KLS_CONFIG || {};
  const root = document.getElementById('driver-app');
  const url = String(raw.supabaseUrl || '').trim();
  const key = String(raw.supabaseAnonKey || '').trim();
  const vapidPublicKey = String(raw.vapidPublicKey || '').trim();
  const validUrl = (() => {
    try { return new URL(url).hostname.endsWith('.supabase.co'); } catch { return false; }
  })();
  const db = validUrl && key && window.supabase ? window.supabase.createClient(url, key) : null;
  const steps = ['Booked','En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery','Delivered'];
  const inviteEmail = String(new URLSearchParams(location.search).get('invite') || '').trim().toLowerCase();
  const recoveryMode = new URLSearchParams(location.search).get('recovery') === '1' || location.hash.includes('type=recovery');
  let state = { user:null, profile:null, jobs:[], loading:true, mode:recoveryMode?'recovery':(inviteEmail?'signup':'signin'), notice:null, podJob:null, workflowJob:null, workflowType:null, tab:'home', screen:'dashboard', detailJobId:null, networkJobs:[], myBids:[], messages:[], incidents:[], online:navigator.onLine, lastUpdated:null, refreshing:false, jobAlerts:[], notificationsEnabled:false, completionCelebration:null, darkMode:localStorage.getItem('kls-driver-dark')==='1', assistantHelp:false, arrivalPrompt:null, fuelDismissed:localStorage.getItem('kls-fuel-dismissed')===new Date().toISOString().slice(0,10), navAddress:null, jobMessages:[], offlineQueue:JSON.parse(localStorage.getItem('kls-driver-offline-queue')||'[]'), routeOrder:JSON.parse(localStorage.getItem('kls-driver-route-order')||'[]'), jobDocuments:[], historySearch:'', isOfficeOwner:false };
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
  const favouriteKey=address=>`kls-favourite-${String(address||'').trim().toLowerCase()}`;
  const isFavourite=address=>localStorage.getItem(favouriteKey(address))==='1';
  const fmtClock = value => value ? new Date(value).toLocaleString('en-GB',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
  const statusTimeFields = {
    'Booked':['created_at','booked_at'],
    'En Route to Collection':['en_route_collection_at','started_at'],
    'Arrived at Collection':['arrived_collection_at','collection_arrived_at'],
    'Collected':['collected_at','collection_completed_at'],
    'In Transit':['in_transit_at','delivery_started_at'],
    'Arrived at Delivery':['arrived_delivery_at','delivery_arrived_at'],
    'Delivered':['delivered_at','completed_at']
  };
  function firstValue(object,keys){ return keys.map(key=>object?.[key]).find(Boolean)||null; }
  function activityRows(job){
    const currentIndex=Math.max(0,steps.indexOf(job.job_status));
    return steps.map((step,index)=>{
      const explicit=firstValue(job,statusTimeFields[step]||[]);
      const current=index===currentIndex;
      const complete=index<currentIndex||job.job_status==='Delivered';
      if(!explicit&&!current&&!complete)return null;
      const fallback=current ? (job.updated_at||job.created_at) : null;
      return {step,time:explicit||fallback,current,complete};
    }).filter(Boolean);
  }



  function urlBase64ToUint8Array(value){
    const padding='='.repeat((4-value.length%4)%4);
    const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
    return Uint8Array.from(atob(base64),character=>character.charCodeAt(0));
  }
  async function pushRegistration(){
    if(!('serviceWorker'in navigator)||!('PushManager'in window)||typeof Notification==='undefined')return null;
    return navigator.serviceWorker.register('/sw.js').then(()=>navigator.serviceWorker.ready);
  }
  async function syncNotificationState(){
    try{
      const registration=await pushRegistration();
      const subscription=await registration?.pushManager.getSubscription();
      state.notificationsEnabled=Notification.permission==='granted'&&!!subscription;
    }catch(_error){state.notificationsEnabled=false;}
  }
  async function notifyNewJob(job){
    if(!job)return;
    state.jobAlerts=state.jobAlerts.filter(item=>item.id!==job.id);
    state.jobAlerts.unshift(job);
    if(state.notificationsEnabled&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
      try{
        const registration=await pushRegistration();
        await registration?.showNotification(`New KLS job: ${job.job_number||'Assigned job'}`,{
          body:`${shortPlace(job.collection_address)} → ${shortPlace(job.delivery_address)} · ${jobTime(job)}`,
          icon:'/icons/icon-192.png',
          badge:'/icons/favicon-32.png',
          tag:`kls-job-${job.id}`,
          renotify:true,
          data:{url:`/driver.html?job=${encodeURIComponent(job.id)}`,job_id:job.id}
        });
      }catch(error){ console.warn('Driver notification unavailable',error); }
    }
  }
  async function toggleJobNotifications(){
    try{
      const registration=await pushRegistration();
      if(!registration||!vapidPublicKey)throw new Error('Push alerts are not configured on this device yet.');
      const existing=await registration.pushManager.getSubscription();
      if(existing){
        await db.from('driver_push_subscriptions').delete().eq('endpoint',existing.endpoint);
        await existing.unsubscribe();
        state.notificationsEnabled=false;
        notice('New job alerts are switched off.','ok');
        return;
      }
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw new Error('Notification permission was not allowed.');
      const subscription=await registration.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(vapidPublicKey)
      });
      const json=subscription.toJSON();
      const payload={
        user_id:state.user.id,
        endpoint:subscription.endpoint,
        p256dh:json.keys?.p256dh,
        auth_key:json.keys?.auth,
        active:true,
        updated_at:new Date().toISOString()
      };
      const {error}=await db.from('driver_push_subscriptions').upsert(payload,{onConflict:'endpoint'});
      if(error){await subscription.unsubscribe();throw error;}
      state.notificationsEnabled=true;
      notice('New job alerts are switched on, including when the app is closed.','ok');
    }catch(error){state.notificationsEnabled=false;notice(error?.message||'Unable to change job alerts.','error');}
  }
  function dismissJobAlert(jobId){state.jobAlerts=state.jobAlerts.filter(job=>job.id!==jobId);}
  function newJobAlertCard(job){
    return `<section class="new-job-alert"><div class="new-job-alert-top"><span>NEW JOB ASSIGNED</span><button data-dismiss-job-alert="${job.id}" aria-label="Dismiss alert">×</button></div><h2>${esc(job.job_number||'New job')}</h2><div class="new-job-route"><b>${esc(shortPlace(job.collection_address))}</b><i>→</i><b>${esc(shortPlace(job.delivery_address))}</b></div><div class="new-job-alert-time"><span><small>COLLECT</small>${jobTime(job)}</span><span><small>DELIVER</small>${deliveryTime(job)}</span></div><button class="btn primary full" data-open-job="${job.id}">View new job</button></section>`;
  }

  function displayValue(job, keys, fallback='Not supplied'){
    const value=keys.map(key=>job?.[key]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');
    return value===undefined||value===null||String(value).trim()===''?fallback:String(value);
  }
  function routeStats(job){
    const mileage=displayValue(job,['estimated_mileage','mileage','distance_miles'],'');
    const duration=displayValue(job,['estimated_duration','estimated_drive_time','drive_time','journey_time'],'');
    return {mileage,duration};
  }
  function routeHeader(job){
    const status=statusDisplay[job.job_status]?.[0]||job.job_status||'Booked';
    return `<section class="route-job-header">
      <div class="route-job-top"><div><small>${esc(job.job_number||'JOB')}</small><h1>${esc(shortPlace(job.collection_address))} <span>→</span> ${esc(shortPlace(job.delivery_address))}</h1></div><b>${esc(displayValue(job,['service_type','service_level'],'Dedicated Same-Day'))}</b></div>
      <div class="route-current-status"><small>CURRENT STATUS</small><strong>${esc(status)}</strong></div>
    </section>`;
  }
  function routeInfoPanel(job){
    const stats=routeStats(job);
    return `<section class="route-info-grid">
      <div><small>EST. MILEAGE</small><b>${stats.mileage?`${esc(stats.mileage)} miles`:'Not supplied'}</b></div>
      <div><small>EST. DRIVE TIME</small><b>${esc(stats.duration||'Not supplied')}</b></div>
      <div><small>COLLECTION</small><b>${jobTime(job)}</b></div>
      <div><small>DELIVERY DEADLINE</small><b>${deliveryTime(job)}</b></div>
    </section>`;
  }
  function jobInfoPanel(job){
    const rows=[
      ['Customer reference',displayValue(job,['customer_reference','customer_ref','reference'],'Not supplied')],
      ['Purchase order',displayValue(job,['purchase_order','po_number','purchase_order_number'],'Not supplied')],
      ['Internal job number',displayValue(job,['job_number'],'Not supplied')],
      ['Vehicle required',displayValue(job,['vehicle_required','vehicle_type','vehicle'],'Not supplied')],
      ['Service type',displayValue(job,['service_type','service_level'],'Dedicated Same-Day')],
      ['Items',displayValue(job,['item_count','number_of_items','pieces'],'Not supplied')]
    ];
    return `<section class="job-info-panel"><div class="panel-title"><small>JOB INFORMATION</small><h2>Booking details</h2></div>${rows.map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</section>`;
  }
  function goodsDetails(job){
    const rows=[
      ['Description',displayValue(job,['goods_description','load_description'],'')],
      ['Weight',displayValue(job,['weight','goods_weight','weight_kg'],'')],
      ['Dimensions',displayValue(job,['dimensions','goods_dimensions'],'')],
      ['Quantity',displayValue(job,['item_count','number_of_items','pieces'],'')]
    ].filter(([,value])=>value);
    if(!rows.length)return '';
    return `<section class="goods-card detailed-goods"><small>GOODS</small>${rows.map(([label,value])=>`<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('')}</section>`;
  }

  function jobTimer(job){
    if(!job||job.job_status==='Delivered')return '';
    const started=firstValue(job,['started_at','en_route_collection_at','updated_at','created_at']);
    if(!started)return '';
    return `<div class="live-job-timer" data-job-start="${esc(started)}"><small>LIVE JOB TIME</small><b>Calculating…</b></div>`;
  }
  function navigationOverlay(){
    if(!state.navAddress)return '';
    const q=encodeURIComponent(state.navAddress);
    return `<div class="pod-overlay"><section class="pod-sheet nav-choice-sheet"><div class="pod-head"><div><small>NAVIGATION</small><h2>Choose your map app</h2></div><button data-close-nav>×</button></div><p>${esc(state.navAddress)}</p><div class="nav-choice-grid"><a target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${q}">Google Maps</a><a target="_blank" rel="noopener" href="https://maps.apple.com/?q=${q}">Apple Maps</a><a target="_blank" rel="noopener" href="https://waze.com/ul?q=${q}&navigate=yes">Waze</a></div></section></div>`;
  }
  function jobChat(job){
    const rows=state.jobMessages.filter(m=>m.job_id===job.id);
    return `<section class="job-chat-card"><div class="panel-title"><small>JOB CHAT</small><h2>Message dispatch</h2></div><div class="job-chat-list">${rows.length?rows.map(m=>`<div class="job-chat-message ${m.sender_type==='driver'?'mine':''}"><b>${m.sender_type==='driver'?'You':'Dispatch'}</b><p>${esc(m.message)}</p><small>${fmtClock(m.created_at)}${m._queued?' · Waiting for signal':''}</small></div>`).join(''):'<p class="chat-empty">No messages on this job yet.</p>'}</div><form class="job-chat-form" data-job-chat="${job.id}"><textarea name="message" rows="2" required placeholder="Type a quick update for dispatch"></textarea><button class="btn primary" type="submit">Send</button></form></section>`;
  }
  function setupPhotoPreviews(){
    document.querySelectorAll('input[type=file][accept*="image"]').forEach(input=>{
      if(input.dataset.previewBound)return; input.dataset.previewBound='1';
      const preview=document.createElement('div'); preview.className='photo-preview'; input.insertAdjacentElement('afterend',preview);
      input.addEventListener('change',()=>{const file=input.files?.[0];if(!file){preview.innerHTML='';return;}const url=URL.createObjectURL(file);preview.innerHTML=`<img src="${url}" alt="Photo preview"><span>${esc(file.name||'Photo ready')}</span>`;});
    });
  }
  function updateJobTimers(){
    document.querySelectorAll('[data-job-start]').forEach(el=>{const start=new Date(el.dataset.jobStart);if(Number.isNaN(start.getTime()))return;const mins=Math.max(0,Math.floor((Date.now()-start.getTime())/60000));const h=Math.floor(mins/60),m=mins%60;const b=el.querySelector('b');if(b)b.textContent=h?`${h}h ${m}m`:`${m} min`;});
  }
  function saveOfflineQueue(){localStorage.setItem('kls-driver-offline-queue',JSON.stringify(state.offlineQueue));}
  async function flushOfflineQueue(){
    if(!navigator.onLine||!db||!state.offlineQueue.length)return;
    const pending=[...state.offlineQueue];
    for(const item of pending){
      if(item.type==='job_message'){
        const {error}=await db.from('driver_job_messages').insert(item.payload);
        if(!error)state.offlineQueue=state.offlineQueue.filter(q=>q.id!==item.id);
      }
    }
    saveOfflineQueue();
  }

  function authView(){
    const signup=state.mode==='signup';
    const recovery=state.mode==='recovery';
    return `<div class="driver-auth"><section class="driver-auth-card"><div class="driver-brand"><b>KLS</b><span>Driver<small>SameDay mobile app</small></span></div><h1>${recovery?'Choose a new password':signup?'Create your driver login':'Driver sign in'}</h1><p>${recovery?'Set a new password for your Driver App. You will remain inside the driver-only system.':signup?'The KLS office has invited you. Choose a password to activate your Driver App.':'Only assigned jobs, navigation, tracking and proof of delivery are shown here. Prices and office accounts are not available.'}</p>${state.notice?`<div class="driver-msg ${state.notice.type}">${esc(state.notice.text)}</div>`:''}<form id="driver-auth-form">${recovery?'':`<label>Email<input name="email" type="email" autocomplete="email" required value="${esc(signup?inviteEmail:'')}" ${signup&&inviteEmail?'readonly':''}></label>`}<label>${recovery?'New password':'Password'}<input name="password" type="password" minlength="6" autocomplete="${signup||recovery?'new-password':'current-password'}" required></label>${recovery?'<label>Confirm new password<input name="confirm_password" type="password" minlength="6" autocomplete="new-password" required></label>':''}<button class="btn primary full">${recovery?'Save new password':signup?'Activate driver login':'Sign in'}</button></form>${recovery?'':`<div class="auth-switch">${signup?'Already registered?':'Forgotten your password?'} ${signup?'<button data-mode="signin">Sign in</button>':'<button data-driver-recovery>Reset it securely</button>'}</div>`}<div class="auth-switch"><a href="/driver-privacy.html" target="_blank" rel="noopener">Privacy & GPS tracking notice</a></div></section></div>`;
  }

  const activeStatuses = ['En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery'];
  const previousStatus = {
    'En Route to Collection':'Booked',
    'Arrived at Collection':'En Route to Collection',
    'Collected':'Arrived at Collection',
    'In Transit':'Collected',
    'Arrived at Delivery':'In Transit'
  };
  const statusDisplay = {
    'Booked':['Job booked','status-booked'],
    'En Route to Collection':['Driving to collection','status-driving'],
    'Arrived at Collection':['At collection','status-collection'],
    'Collected':['Goods collected','status-collected'],
    'In Transit':['Driving to delivery','status-driving'],
    'Arrived at Delivery':['At delivery','status-delivery'],
    'Delivered':['Delivered','status-complete']
  };

  function nextAction(job){
    const map={
      'Booked':['Start job','En Route to Collection'],
      'En Route to Collection':['I have arrived','Arrived at Collection'],
      'Arrived at Collection':['Goods collected','Collected'],
      'Collected':['Start delivery','In Transit'],
      'In Transit':['I have arrived','Arrived at Delivery']
    };
    return map[job.job_status] || null;
  }

  function jobTime(job){
    const time=String(job.collection_time||'').slice(0,5);
    return `${fmtDate(job.collection_date)}${time?` · ${esc(time)}`:''}`;
  }
  function shortPlace(address){
    const parts=String(address||'').split(',').map(x=>x.trim()).filter(Boolean);
    return parts.length>1 ? parts[parts.length-2] : (parts[0]||'TBC');
  }
  function deliveryTime(job){
    const date=job.delivery_date||job.collection_date;
    const time=String(job.delivery_time||'').slice(0,5);
    return `${fmtDate(date)}${time?` · ${esc(time)}`:''}`;
  }
  function importantNotes(job){
    const text=[job.special_instructions,job.booking_notes,job.notes,job.collection_instructions,job.delivery_instructions].filter(Boolean).join(' · ');
    return text ? `<div class="important-banner"><b>Important</b><span>${esc(text)}</span></div>` : '';
  }
  function isToday(value){
    if(!value)return false;
    const d=new Date(`${String(value).slice(0,10)}T12:00:00`), n=new Date();
    return d.getFullYear()===n.getFullYear()&&d.getMonth()===n.getMonth()&&d.getDate()===n.getDate();
  }
  function phoneValue(job,side){
    const keys=side==='collection'
      ? ['collection_phone','collection_contact_phone','collection_telephone','customer_phone','contact_phone']
      : ['delivery_phone','delivery_contact_phone','delivery_telephone','recipient_phone','customer_phone','contact_phone'];
    return keys.map(k=>job[k]).find(Boolean)||'';
  }
  function contactValue(job,side){
    const keys=side==='collection'
      ? ['collection_contact','collection_contact_name','contact_name','customer_name']
      : ['delivery_contact','delivery_contact_name','recipient_name','contact_name','customer_name'];
    return keys.map(k=>job[k]).find(Boolean)||'';
  }
  function notesValue(job,side){
    const keys=side==='collection'
      ? ['collection_notes','collection_instructions','booking_notes','notes']
      : ['delivery_notes','delivery_instructions','booking_notes','notes'];
    return keys.map(k=>job[k]).find(Boolean)||'';
  }
  function statusBanner(job){
    const item=statusDisplay[job.job_status]||[job.job_status||'Booked','status-booked'];
    return `<div class="job-status-banner ${item[1]}"><span></span><strong>${esc(item[0])}</strong></div>`;
  }
  function miniJobCard(job,label='UPCOMING'){
    const status=statusDisplay[job.job_status]?.[0]||job.job_status||'Booked';
    const completed=job.job_status==='Delivered';
    const completionTime=fmtClock(job.delivered_at||job.completed_at||job.updated_at);
    const photo=Boolean(job.pod_photo_url||job.delivery_photo_url||job.photo_url);
    const signature=Boolean(job.signature_url||job.pod_signature_url);
    return `<article class="driver-job-summary ${completed?'completed-summary':''}" data-open-job="${job.id}" role="button" tabindex="0">
      <div class="summary-top"><span>${esc(label)}</span><b>${esc(job.job_number||'Job')}</b></div>
      <div class="cx-route"><strong>${esc(shortPlace(job.collection_address))}</strong><i>→</i><strong>${esc(shortPlace(job.delivery_address))}</strong></div>
      <h3>${esc(job.customer_name||job.contact_name||'Customer')}</h3>
      ${completed?`<div class="completed-evidence"><span><small>COMPLETED</small>${esc(completionTime||'Recorded')}</span><span class="${photo?'yes':'no'}">Photo ${photo?'✓':'—'}</span><span class="${signature?'yes':'no'}">Signature ${signature?'✓':'—'}</span></div>`:`<div class="summary-times"><span><small>COLLECT</small>${jobTime(job)}</span><span><small>DELIVER</small>${deliveryTime(job)}</span></div>`}
      <div class="summary-status"><span class="status-dot"></span>${esc(status)}</div>
      <footer><span>${esc(job.vehicle||job.vehicle_type||'Vehicle')}</span><button class="btn primary" data-open-job="${job.id}">Open job</button></footer>
    </article>`;
  }
  function greeting(){
    const hour=new Date().getHours();
    if(hour<12)return 'Good morning';
    if(hour<18)return 'Good afternoon';
    return 'Good evening';
  }
  function currentJobHero(job){
    if(!job)return '';
    const action=nextAction(job);
    const status=statusDisplay[job.job_status]?.[0]||job.job_status||'Booked';
    const idx=Math.max(0,steps.indexOf(job.job_status));
    const progress=Math.round((idx/(steps.length-1))*100);
    return `<article class="pro-current-job" data-open-job="${job.id}" role="button" tabindex="0">
      <div class="pro-current-top"><span>${activeStatuses.includes(job.job_status)?'CURRENT JOB':'NEXT JOB'}</span><b>${esc(job.job_number||'Job')}</b></div>
      <div class="pro-route"><strong>${esc(shortPlace(job.collection_address))}</strong><i>→</i><strong>${esc(shortPlace(job.delivery_address))}</strong></div>
      <div class="pro-time-grid"><span><small>COLLECTION</small>${jobTime(job)}</span><span><small>DELIVERY</small>${deliveryTime(job)}</span></div>
      <div class="pro-progress"><div><span style="width:${progress}%"></span></div><small>${esc(status)}</small></div>
      <button class="btn primary full pro-open-job" data-open-job="${job.id}">${action?'Continue job':'Open job'}</button>
    </article>`;
  }

  function minutesUntilJob(job){
    if(!job?.collection_date)return null;
    const time=String(job.collection_time||'09:00').slice(0,5);
    const target=new Date(`${job.collection_date}T${time}:00`);
    if(Number.isNaN(target.getTime()))return null;
    return Math.round((target-Date.now())/60000);
  }
  function smartAssistantCard(job){
    if(!job)return '';
    const mins=minutesUntilJob(job);
    let headline='Next job ready'; let tone='ok'; let detail='Open the job when you are ready to begin.';
    if(mins!==null){
      if(mins<0){headline=`Running ${Math.abs(mins)} minutes behind`;tone='danger';detail='Open the job and update dispatch if the collection time cannot be met.';}
      else if(mins<=20){headline=`Leave in ${mins} minutes`;tone='warning';detail='Check the route and collection instructions now.';}
      else {headline=`Collection in ${mins} minutes`;detail='You have time to prepare before leaving.';}
    }
    return `<section class="smart-assistant ${tone}"><div><small>SMART DRIVER ASSISTANT</small><h2>${esc(headline)}</h2><p>${esc(detail)}</p></div><button class="btn secondary" data-driver-help>Need help</button></section>`;
  }
  function helpOverlay(){
    if(!state.assistantHelp)return '';
    return `<div class="pod-overlay"><section class="pod-sheet help-sheet"><div class="pod-head"><div><small>DRIVER SUPPORT</small><h2>How can dispatch help?</h2></div><button data-close-help>×</button></div><div class="help-grid"><button data-help-type="Running late">Running late</button><button data-help-type="Vehicle issue">Vehicle issue</button><button data-help-type="Customer problem">Customer problem</button><button data-help-type="Need route help">Need route help</button></div><button class="btn secondary full" data-driver-tab="messages">Open messages</button><button class="btn secondary full" data-driver-tab="incident">Report an incident</button></section></div>`;
  }
  function arrivalOverlay(){
    const a=state.arrivalPrompt;if(!a)return '';
    return `<div class="arrival-prompt"><section><small>LOCATION CHECK</small><h2>Have you arrived?</h2><p>${esc(a.label)}</p><div><button class="btn primary" data-confirm-arrival>Yes, I have arrived</button><button class="btn secondary" data-dismiss-arrival>Not yet</button></div></section></div>`;
  }

  function dashboardView(){
    const open=state.jobs.filter(j=>j.job_status!=='Delivered');
    const current=open.find(j=>activeStatuses.includes(j.job_status))||open[0]||null;
    const upcoming=open.filter(j=>!current||j.id!==current.id);
    const completed=state.jobs.filter(j=>j.job_status==='Delivered'&&isToday(j.delivered_at||j.collection_date));
    const firstName=String(state.profile?.driver_name||'Driver').split(' ')[0];
    return `<section class="driver-dashboard pro-dashboard">
      <section class="pro-home-head">
        <div><small>${greeting().toUpperCase()}</small><h1>${esc(firstName)}</h1><p>${current?'Your work is ready below.':'You are clear and available for work.'}</p></div>
        <span class="connection-pill ${state.online?'online':'offline'}">${state.online?'LIVE':'OFFLINE'}</span>
      </section>
      <div class="dashboard-availability pro-availability">
        <div><small>DRIVER STATUS</small><strong>${esc(state.profile?.availability_status||'Available')}</strong></div>
        <select data-own-availability aria-label="Driver availability">${['Available','On Job','Break','Offline'].map(x=>`<option ${String(state.profile?.availability_status||'Available')===x?'selected':''}>${x}</option>`).join('')}</select>
      </div>
      ${state.jobAlerts.map(newJobAlertCard).join('')}
      ${current?smartAssistantCard(current):''}
      ${current?currentJobHero(current):`<section class="pro-no-job"><span>✓</span><h2>No active job</h2><p>The office will send assigned work automatically.</p></section>`}
      <div class="pro-stats"><div><small>UPCOMING</small><strong>${upcoming.length}</strong></div><div><small>COMPLETED TODAY</small><strong>${completed.length}</strong></div><button data-refresh-jobs ${state.refreshing?'disabled':''}><small>LAST UPDATE</small><strong>${state.refreshing?'Refreshing…':state.lastUpdated?new Date(state.lastUpdated).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'Refresh'}</strong></button></div>
      <div class="dashboard-section-title"><h2>Upcoming jobs</h2><span>${upcoming.length}</span></div>
      ${upcoming.length?`<div class="dashboard-job-list">${upcoming.map(j=>miniJobCard(j)).join('')}</div>`:'<div class="empty compact"><strong>No upcoming jobs</strong><p>Nothing else is currently assigned.</p></div>'}
    </section>`;
  }
  function jobsView(){
    const active=state.jobs.filter(j=>j.job_status!=='Delivered');
    const q=state.historySearch.trim().toLowerCase();
    const completed=state.jobs.filter(j=>j.job_status==='Delivered').slice().reverse().filter(j=>!q||[j.job_number,j.customer_name,j.collection_address,j.delivery_address,j.collection_company,j.delivery_company].some(v=>String(v||'').toLowerCase().includes(q)));
    return `<section class="jobs-screen">
      <div class="screen-heading"><small>MY WORK</small><h1>Jobs</h1><p>Active and completed KLS jobs.</p></div>
      <div class="dashboard-section-title"><h2>Active</h2><span>${active.length}</span></div>
      ${active.length?`<div class="dashboard-job-list">${active.map(j=>miniJobCard(j,activeStatuses.includes(j.job_status)?'ACTIVE':'ASSIGNED')).join('')}</div>`:'<div class="empty compact"><strong>No active jobs</strong><p>Your assigned work will appear here.</p></div>'}
      <div class="dashboard-section-title history-title"><h2>Completed history</h2><span>${completed.length}</span></div>
      <label class="history-search"><span>Search completed jobs</span><input data-history-search value="${esc(state.historySearch)}" placeholder="Job number, customer or address"></label>
      ${completed.length?`<div class="dashboard-job-list completed-list">${completed.map(j=>miniJobCard(j,'COMPLETED')).join('')}</div>`:'<div class="empty compact"><strong>No completed jobs</strong></div>'}
    </section>`;
  }
  function profileView(){
    return `<section class="profile-screen">
      <div class="screen-heading"><small>DRIVER PROFILE</small><h1>${esc(state.profile?.driver_name||'Driver')}</h1><p>${esc(state.profile?.driver_vehicle||'Vehicle not set')}</p></div>
      <div class="profile-card"><div><span>Login</span><b>${esc(state.user?.email||'')}</b></div><div><span>Telephone</span><b>${esc(state.profile?.driver_phone||'Not set')}</b></div><div><span>Availability</span><b>${esc(state.profile?.availability_status||'Available')}</b></div></div>
      <section class="profile-notification-card"><div><span>New job alerts</span><b>${state.notificationsEnabled?'On':'Off'}</b></div><button class="btn secondary" data-enable-notifications>${state.notificationsEnabled?'Switch off':'Switch on'}</button></section>
      <button class="btn secondary full" data-driver-tab="incident">Report an incident</button><button class="btn secondary full" data-toggle-dark>${state.darkMode?'Use light mode':'Use dark mode'}</button><a class="btn secondary full" href="/driver-privacy.html" target="_blank" rel="noopener">Privacy & GPS notice</a>${state.isOfficeOwner?'<a class="btn primary full owner-office-link" href="/">Back to KLS Office</a>':''}<button class="btn secondary full profile-signout" data-signout>Sign out</button>
    </section>`;
  }
  function detailSection(title,address,contact,phone,notes,company,timeLabel,timeValue){
    return `<section class="location-card detailed-location"><div class="location-title"><small>${esc(title)}</small>${timeValue?`<b>${esc(timeLabel)}: ${esc(timeValue)}</b>`:''}</div>${company?`<h3>${esc(company)}</h3>`:''}<h2>${esc(address||'Address not supplied')}</h2><div class="location-tools"><button type="button" data-nav-address="${esc(address||'')}">Navigate</button><button type="button" data-favourite-address="${esc(address||'')}">${isFavourite(address)?'★ Favourite':'☆ Save location'}</button></div>${contact?`<div class="location-line"><span>Contact</span><b>${esc(contact)}</b></div>`:''}${phone?`<div class="location-line"><span>Telephone</span><b class="phone-number">${esc(phone)}</b></div>`:''}${notes?`<div class="job-instructions priority-instructions"><span>IMPORTANT INSTRUCTIONS</span><p>${esc(notes)}</p></div>`:''}</section>`;
  }
  function jobPack(job){
    const rows=[['Goods',displayValue(job,['goods_description','goods','load_description'],'Not supplied')],['Items',displayValue(job,['item_count','items','quantity'],'Not supplied')],['Weight',displayValue(job,['weight','goods_weight'],'Not supplied')],['Dimensions',displayValue(job,['dimensions','goods_dimensions'],'Not supplied')],['Vehicle',displayValue(job,['vehicle_required','vehicle_type'],'Not supplied')],['Priority',displayValue(job,['priority'],'Normal')],['Customer notes',displayValue(job,['customer_notes','notes'],'None')]];
    return `<section class="job-pack-card"><div class="activity-heading"><div><small>JOB PACK</small><h2>Everything for this job</h2></div><span>${esc(job.job_number||'Job')}</span></div><div class="job-pack-grid">${rows.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('')}</div></section>`;
  }
  function jobDocumentsPanel(job){
    const docs=state.jobDocuments.filter(d=>d.job_id===job.id);
    return `<section class="job-documents-card"><div class="activity-heading"><div><small>JOB DOCUMENTS</small><h2>Paperwork & attachments</h2></div><span>${docs.length}</span></div>${docs.length?`<div class="job-document-list">${docs.map(doc=>`<a href="${esc(doc.file_url)}" target="_blank" rel="noopener"><div><b>${esc(doc.file_name||'Document')}</b><small>${esc(doc.description||doc.file_type||'Open attachment')}</small></div><span>Open ↗</span></a>`).join('')}</div>`:'<p class="empty-documents">No documents attached to this job.</p>'}</section>`;
  }
  function jobDetailView(job){
    const action=nextAction(job);
    const prev=previousStatus[job.job_status];
    const atCollection=['Booked','En Route to Collection','Arrived at Collection'].includes(job.job_status);
    const destination=atCollection?job.collection_address:job.delivery_address;
    const idx=Math.max(0,steps.indexOf(job.job_status));
    const collectCompany=displayValue(job,['collection_company','collection_name','customer_name'],'');
    const deliveryCompany=displayValue(job,['delivery_company','delivery_name','recipient_company'],'');
    const collectionClock=String(job.collection_time||'').slice(0,5);
    const deliveryClock=String(job.delivery_time||'').slice(0,5);
    return `<section class="job-detail-screen">
      <div class="detail-nav"><button class="back-link" data-back-dashboard>← Main screen</button><span>${esc(job.job_number||'Job')}</span></div>
      ${routeHeader(job)}
      ${statusBanner(job)}
      ${routeInfoPanel(job)}
      ${jobTimer(job)}
      ${importantNotes(job)}
      <div class="workflow-progress">${steps.map((step,i)=>`<span class="${i<idx?'complete':i===idx?'current':''}"><i></i><small>${esc(step)}</small></span>`).join('')}</div>
      ${detailSection('COLLECTION',job.collection_address,contactValue(job,'collection'),phoneValue(job,'collection'),notesValue(job,'collection'),collectCompany,'Ready',collectionClock)}
      ${detailSection('DELIVERY',job.delivery_address,contactValue(job,'delivery'),phoneValue(job,'delivery'),notesValue(job,'delivery'),deliveryCompany,'Deadline',deliveryClock)}
      ${goodsDetails(job)}
      ${jobPack(job)}
      ${jobDocumentsPanel(job)}
      ${jobInfoPanel(job)}
      ${jobChat(job)}
      <section class="job-activity-card"><div class="activity-heading"><div><small>JOB ACTIVITY</small><h2>Progress history</h2></div><span>${esc(statusDisplay[job.job_status]?.[0]||job.job_status||'Booked')}</span></div><div class="activity-list">${activityRows(job).map(row=>`<div class="activity-row ${row.current?'current':''}"><i></i><div><b>${esc(row.step)}</b><small>${row.time?fmtClock(row.time):(row.complete?'Completed':'Current step')}</small></div></div>`).join('')}</div></section>
      <div class="sticky-job-actions">
        ${job.job_status!=='Delivered'?`<button class="btn secondary navigate-btn" type="button" data-nav-address="${esc(destination||'')}">Open navigation</button>`:''}
        ${job.job_status==='Arrived at Collection'?`<button class="btn primary main-action" data-workflow-job="${job.id}" data-workflow="collection">Collection checks</button>`:action?`<button class="btn primary main-action" data-status-job="${job.id}" data-status="${esc(action[1])}">${esc(action[0])}</button>`:''}
        ${job.job_status==='Arrived at Delivery'?`<button class="btn primary main-action" data-workflow-job="${job.id}" data-workflow="delivery">Delivery checks & POD</button>`:''}
        ${job.job_status==='Delivered'?`<button class="btn delivered-button" disabled>Delivery completed ✓</button>`:''}
        ${prev?`<button class="previous-step" data-previous-job="${job.id}" data-status="${esc(prev)}">← Previous step</button>`:''}
      </div>
    </section>`;
  }

  function exchangeView(){
    const offerFor=id=>state.myBids.find(b=>b.network_job_id===id);
    const jobs=state.networkJobs.filter(j=>j.status==='open'||offerFor(j.id)||j.awarded_driver_id===state.profile?.linked_driver_id);
    if(!jobs.length)return '<section class="driver-welcome"><small>KLS DRIVER NETWORK</small><h1>No available work</h1><p>New jobs from KLS will appear here.</p></section>';
    return `<section class="driver-welcome"><small>KLS DRIVER NETWORK</small><h1>Available Work</h1><p>Submit your own price. Jobs remain available until KLS awards or withdraws them.</p></section><div class="network-list">${jobs.map(job=>{
      const offer=offerFor(job.id);
      const won=['awarded','accepted'].includes(offer?.status);
      const when=job.collection_at?new Date(job.collection_at).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short'}):'Time TBC';
      return `<article class="network-card ${won?'won':''}">
        <header><span><small>${esc(job.vehicle_required||'Any vehicle')}</small><b>${esc(job.collection_postcode||job.collection_address||'Collection')} → ${esc(job.delivery_postcode||job.delivery_address||'Delivery')}</b></span><strong>${Number(job.mileage||0).toFixed(0)} miles</strong></header>
        <div class="network-route"><p><small>COLLECT</small>${esc(job.collection_address||'')}</p><p><small>DELIVER</small>${esc(job.delivery_address||'')}</p></div>
        <p><b>Collect:</b> ${esc(when)}</p>
        ${job.goods_description?`<p><b>Load:</b> ${esc(job.goods_description)}</p>`:''}
        ${job.notes?`<p><b>Notes:</b> ${esc(job.notes)}</p>`:''}
        ${offer ? `<div class="bid-status ${won?'won':''}"><b>Your offer: ${money(offer.offer_amount)}</b><span>${esc(String(offer.status||'submitted').replaceAll('_',' '))}</span></div>` : job.status==='open' ? `<form data-network-offer="${job.id}"><label>Your price (£)<input name="amount" type="number" min="1" step="0.01" required></label><label>Message (optional)<textarea name="message" rows="2" placeholder="Already nearby or available immediately"></textarea></label><button class="btn primary full">Submit offer</button></form>` : ''}
        ${offer?.status==='awarded'?`<div class="award-actions"><button class="btn primary full" data-accept-award="${job.id}">Accept job</button><button class="btn secondary full" data-decline-award="${job.id}">Decline</button></div>`:''}
      </article>`;
    }).join('')}</div>`;
  }

  function podView(job){
    return `<div class="pod-overlay"><section class="pod-sheet"><div class="pod-head"><div><small>PROOF OF DELIVERY</small><h2>${esc(job.job_number||'Job')}</h2></div><button data-close-pod>×</button></div><p class="tracking-note">Photo, signature and recipient name are required. Live tracking will stop only after all POD details are uploaded successfully.</p>${state.notice?`<div class="driver-msg ${state.notice.type}">${esc(state.notice.text)}</div>`:''}<form id="driver-pod-form" class="pod-form"><label>Recipient name<input name="recipient_name" required></label><label>Delivery photo<input name="photo" type="file" accept="image/*" required><small>Take a new photo or choose one from your photo library.</small></label><label>Signature<canvas id="driver-signature" class="signature" width="700" height="280"></canvas></label><button class="btn secondary" type="button" data-clear-signature>Clear signature</button><label>Notes<textarea name="notes" rows="3"></textarea></label><div id="pod-upload-status" class="driver-msg" hidden></div><div class="pod-actions"><button id="pod-submit-button" type="button" class="btn primary full">Upload POD & complete job</button><button class="btn secondary full" type="button" data-close-pod>Cancel</button></div></form></section></div>`;
  }



  function routeDateTime(job,type='collection'){
    const date=type==='delivery'?(job.delivery_date||job.collection_date):job.collection_date;
    const time=String(type==='delivery'?(job.delivery_time||'23:59'):(job.collection_time||'09:00')).slice(0,5);
    if(!date)return null;
    const value=new Date(`${String(date).slice(0,10)}T${time}:00`);
    return Number.isNaN(value.getTime())?null:value;
  }
  function routeRisk(job,index){
    if(job.job_status==='Delivered')return {level:'done',label:'Completed',minutes:null};
    const target=routeDateTime(job,activeStatuses.includes(job.job_status)?'delivery':'collection');
    if(!target)return {level:'normal',label:'No timed deadline',minutes:null};
    const minutes=Math.round((target-Date.now())/60000);
    if(minutes<0)return {level:'danger',label:`${Math.abs(minutes)} min overdue`,minutes};
    if(minutes<=30)return {level:'danger',label:`Due in ${minutes} min`,minutes};
    if(minutes<=75)return {level:'warning',label:`Due in ${minutes} min`,minutes};
    return {level:'normal',label:`${Math.floor(minutes/60)}h ${minutes%60}m remaining`,minutes};
  }
  function orderedRouteJobs(){
    const base=state.jobs.slice().sort((a,b)=>{
      const ad=routeDateTime(a)?.getTime()||Number.MAX_SAFE_INTEGER;
      const bd=routeDateTime(b)?.getTime()||Number.MAX_SAFE_INTEGER;
      return ad-bd;
    });
    const ids=state.routeOrder.filter(id=>base.some(job=>job.id===id));
    const missing=base.filter(job=>!ids.includes(job.id));
    return [...ids.map(id=>base.find(job=>job.id===id)),...missing];
  }
  function saveRouteOrder(jobs){state.routeOrder=jobs.map(job=>job.id);localStorage.setItem('kls-driver-route-order',JSON.stringify(state.routeOrder));}
  function optimiseRoute(){
    const jobs=state.jobs.slice().sort((a,b)=>{
      if(a.job_status==='Delivered'&&b.job_status!=='Delivered')return -1;
      if(b.job_status==='Delivered'&&a.job_status!=='Delivered')return 1;
      if(activeStatuses.includes(a.job_status)&&!activeStatuses.includes(b.job_status))return -1;
      if(activeStatuses.includes(b.job_status)&&!activeStatuses.includes(a.job_status))return 1;
      const ar=routeRisk(a,0),br=routeRisk(b,0);
      return (ar.minutes??Number.MAX_SAFE_INTEGER)-(br.minutes??Number.MAX_SAFE_INTEGER);
    });
    saveRouteOrder(jobs);notice('Route reordered around the current job and the earliest deadlines.','ok');
  }
  function moveRouteJob(jobId,direction){
    const jobs=orderedRouteJobs();const index=jobs.findIndex(job=>job.id===jobId);const target=index+direction;
    if(index<0||target<0||target>=jobs.length)return;
    [jobs[index],jobs[target]]=[jobs[target],jobs[index]];saveRouteOrder(jobs);render();
  }
  async function reportRouteRisk(jobId){
    const job=state.jobs.find(item=>item.id===jobId);if(!job)return;
    const risk=routeRisk(job,0);const notes=`Route warning for ${job.job_number||'job'}: ${risk.label}. Driver requested dispatch review.`;
    const {error}=await db.from('driver_incidents').insert({driver_id:state.profile.linked_driver_id,job_id:job.id,incident_type:'Traffic delay',notes,status:'open'});
    if(error){notice(error.message,'error');return;}notice('Dispatch has been alerted about the timing risk.','ok');
  }
  function routeView(){
    const jobs=orderedRouteJobs();
    const next=jobs.find(job=>job.job_status!=='Delivered');
    const nextRisk=next?routeRisk(next,0):null;
    return `<section class="route-screen"><div class="screen-heading"><small>SMART ROUTE ASSISTANT</small><h1>Your running order</h1><p>Timed jobs are highlighted so the most urgent work is easy to spot.</p></div>
      ${next?`<section class="route-advice ${nextRisk.level}"><div><small>SUGGESTED NEXT</small><h2>${esc(next.job_number||'Job')} · ${esc(shortPlace(next.collection_address))}</h2><p>${esc(nextRisk.label)}</p></div><button class="btn primary" data-open-job="${next.id}">Open job</button></section>`:''}
      <div class="route-toolbar"><button class="btn primary" data-optimise-route>Optimise order</button><button class="btn secondary" data-reset-route>Reset by time</button></div>
      ${jobs.length?`<div class="route-list">${jobs.map((job,i)=>{const done=job.job_status==='Delivered';const current=activeStatuses.includes(job.job_status);const risk=routeRisk(job,i);return `<article class="route-stop ${done?'done':current?'current':''} risk-${risk.level}"><div class="route-number" data-open-job="${job.id}">${done?'✓':i+1}</div><div data-open-job="${job.id}"><small>${done?'COMPLETED':current?'CURRENT JOB':'UPCOMING'}</small><h3>${esc(shortPlace(job.collection_address))} → ${esc(shortPlace(job.delivery_address))}</h3><p>${jobTime(job)} · ${esc(job.job_number||'Job')}</p><b class="route-risk-label">${esc(risk.label)}</b></div><div class="route-order-actions"><button data-route-up="${job.id}" aria-label="Move up" ${i===0?'disabled':''}>↑</button><button data-route-down="${job.id}" aria-label="Move down" ${i===jobs.length-1?'disabled':''}>↓</button>${risk.level==='danger'&&!done?`<button class="alert-office" data-route-alert="${job.id}">Alert office</button>`:''}</div></article>`}).join('')}</div>`:'<div class="empty"><strong>No route assigned</strong></div>'}</section>`;
  }

  function messagesView(){
    return `<section class="messages-screen"><div class="screen-heading"><small>DISPATCH</small><h1>Messages</h1><p>Updates from the KLS office.</p></div>${state.messages.length?`<div class="message-list">${state.messages.map(m=>`<article class="message-card"><div><b>${esc(m.subject||'Dispatch message')}</b><small>${fmtClock(m.created_at)}</small></div><p>${esc(m.message||'')}</p></article>`).join('')}</div>`:'<div class="empty compact"><strong>No messages</strong><p>New dispatch messages will appear here.</p></div>'}</section>`;
  }

  function incidentView(){
    const job=state.jobs.find(j=>activeStatuses.includes(j.job_status))||state.jobs.find(j=>j.job_status!=='Delivered');
    return `<section class="incident-screen"><div class="screen-heading"><small>DRIVER SUPPORT</small><h1>Report an incident</h1><p>Send the office the details immediately.</p></div><form id="incident-form" class="incident-form"><label>Incident type<select name="type" required><option value="">Choose one</option><option>Traffic delay</option><option>Customer unavailable</option><option>Damaged goods</option><option>Vehicle issue</option><option>Accident</option><option>Other</option></select></label><label>Related job<select name="job_id"><option value="">No job selected</option>${state.jobs.filter(j=>j.job_status!=='Delivered').map(j=>`<option value="${j.id}" ${job?.id===j.id?'selected':''}>${esc(j.job_number||'Job')} · ${esc(shortPlace(j.delivery_address))}</option>`).join('')}</select></label><label>Details<textarea name="notes" rows="5" required placeholder="Tell dispatch what has happened"></textarea></label><label>Photo (optional)<input name="photo" type="file" accept="image/*"></label><button class="btn primary full">Send incident report</button></form></section>`;
  }

  function workflowView(job,type){
    const collection=type==='collection';
    return `<div class="workflow-overlay"><section class="workflow-sheet"><div class="pod-head"><div><small>${collection?'COLLECTION CHECK':'DELIVERY CHECK'}</small><h2>${esc(job.job_number||'Job')}</h2></div><button data-close-workflow>×</button></div><form id="driver-workflow-form" class="workflow-form"><label class="check-row"><input type="checkbox" name="confirmed" required><span>${collection?'I am at the correct collection address':'I am at the correct delivery address'}</span></label>${collection?`<label class="check-row"><input type="checkbox" name="goods_ok" required><span>Goods checked and match the booking</span></label><label>Condition<select name="condition"><option>Goods in good condition</option><option>Damage found</option><option>Items missing</option></select></label>`:''}<label>${collection?'Collection photo':'Delivery photo'}<input name="photo" type="file" accept="image/*" required></label><label>Notes<textarea name="notes" rows="3" placeholder="Optional notes for the office"></textarea></label><button class="btn primary full" type="submit">${collection?'Confirm loaded & begin delivery':'Continue to signature & POD'}</button><button class="btn secondary full" type="button" data-close-workflow>Cancel</button></form></section></div>`;
  }

  function appView(){
    const driverName=state.profile?.driver_name || 'Driver';
    const vehicle=state.profile?.driver_vehicle || 'Vehicle not set';
    const detailJob=state.detailJobId?state.jobs.find(j=>j.id===state.detailJobId):null;
    const mainContent=state.screen==='detail'&&detailJob
      ? jobDetailView(detailJob)
      : state.tab==='exchange' ? exchangeView()
      : state.tab==='jobs' ? jobsView()
      : state.tab==='route' ? routeView()
      : state.tab==='messages' ? messagesView()
      : state.tab==='incident' ? incidentView()
      : state.tab==='profile' ? profileView()
      : dashboardView();
    return `<div class="driver-shell">
      <header class="driver-top pro-top">
        <div class="pro-brand"><b>KLS</b><span>Driver<small>${esc(vehicle)}</small></span></div>
        <div class="pro-top-status"><span class="connection-dot ${state.online?'online':'offline'}"></span><small>${esc(driverName)}</small></div>
      </header>
      <main class="driver-main">
        ${state.notice?`<div class="driver-msg ${state.notice.type}">${esc(state.notice.text)}</div>`:''}
        ${mainContent}
        ${state.workflowJob?workflowView(state.workflowJob,state.workflowType):''}${state.podJob?podView(state.podJob):''}${helpOverlay()}${arrivalOverlay()}${navigationOverlay()}
        ${state.completionCelebration?`<div class="completion-celebration"><section><div class="completion-tick">✓</div><small>DELIVERY COMPLETE</small><h2>${esc(state.completionCelebration.job_number||'Job')}</h2><p>Proof of delivery has been saved successfully.</p><button class="btn primary full" data-close-celebration>Back to home</button></section></div>`:''}
      </main>
      ${state.screen!=='detail'?`<nav class="bottom-nav" aria-label="Driver navigation">
        <button class="${state.tab==='home'?'active':''}" data-driver-tab="home"><i>⌂</i><span>Home</span></button>
        <button class="${state.tab==='jobs'?'active':''}" data-driver-tab="jobs"><i>▤</i><span>Jobs</span>${state.jobs.filter(j=>j.job_status!=='Delivered').length?`<em>${state.jobs.filter(j=>j.job_status!=='Delivered').length}</em>`:''}</button>
        <button class="${state.tab==='route'?'active':''}" data-driver-tab="route"><i>↟</i><span>Route</span></button>
        <button class="${state.tab==='messages'?'active':''}" data-driver-tab="messages"><i>✉</i><span>Messages</span>${state.messages.length?`<em>${state.messages.length}</em>`:''}</button>
        <button class="${state.tab==='profile'?'active':''}" data-driver-tab="profile"><i>◉</i><span>Profile</span></button>
      </nav>`:''}
    </div>`;
  }

  function render(){
    document.body.classList.toggle('dark',state.darkMode);
    if(state.loading){root.innerHTML='<div class="driver-loading pro-loading"><div class="loader-mark">KLS</div><span></span><p>Loading Driver App…</p></div>';return;}
    if(state.mode==='recovery'){root.innerHTML=authView();bindAuth();return;}
    if(!state.user){root.innerHTML=authView();bindAuth();return;}
    if(!state.profile){root.innerHTML=`<div class="driver-auth"><section class="driver-auth-card"><div class="driver-brand"><b>KLS</b><span>Driver</span></div><h1>Account not linked</h1>${state.notice?`<div class="driver-msg ${state.notice.type}">${esc(state.notice.text)}</div>`:`<p>Ask the KLS office to link this exact login email to your driver record:</p><div class="driver-msg error">${esc(state.user.email)}</div>`}<button class="btn secondary full" data-signout>Sign out</button></section></div>`;bindCommon();return;}
    applyAutomaticNightMode();root.innerHTML=appView();bindApp();startArrivalAssistant();
  }

  function bindCommon(){document.querySelectorAll('[data-signout]').forEach(b=>b.onclick=async()=>{stopTracking(false);await db.auth.signOut();});}
  function bindAuth(){
    document.querySelector('[data-mode]')?.addEventListener('click',e=>{state.mode=e.currentTarget.dataset.mode;state.notice=null;render();});
    document.querySelector('[data-driver-recovery]')?.addEventListener('click',async()=>{
      const email=String(prompt('Enter the driver login email address:')||'').trim().toLowerCase();
      if(!email)return;
      try{
        if(!db)throw new Error('Supabase is not configured.');
        const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}/driver.html?recovery=1`});
        if(error)throw error;
        state.notice={text:'Password reset email sent. Open it on this device.',type:'ok'};render();
      }catch(error){state.notice={text:error.message,type:'error'};render();}
    });
    document.getElementById('driver-auth-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));try{if(!db)throw new Error('Supabase is not configured.');if(state.mode==='recovery'){if(!state.user)throw new Error('This password reset link is invalid or has expired. Request a new one from the Driver App.');if(f.password!==f.confirm_password)throw new Error('The two passwords do not match.');const{error}=await db.auth.updateUser({password:f.password});if(error)throw error;history.replaceState({},'',`${location.origin}/driver.html`);state.mode='signin';state.notice={text:'Password updated successfully.',type:'ok'};await loadDriver();return;}if(state.mode==='signup'){if(!inviteEmail)throw new Error('Ask the KLS office for your personal setup link.');const{data,error}=await db.auth.signUp({email:f.email,password:f.password,options:{emailRedirectTo:`${location.origin}/driver.html`}});if(error)throw error;if(!data.session){state.mode='signin';state.notice={text:'Login created. Check your email to confirm it, then sign in.',type:'ok'};render();return;}}else{const{error}=await db.auth.signInWithPassword({email:f.email,password:f.password});if(error)throw error;}}catch(error){state.notice={text:error.message,type:'error'};render();}});
  }

  function bindApp(){
    bindCommon();
    document.querySelectorAll('[data-driver-tab]').forEach(btn=>btn.onclick=()=>{state.tab=btn.dataset.driverTab;state.screen='dashboard';state.detailJobId=null;render();});
    document.querySelectorAll('[data-open-job]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();dismissJobAlert(btn.dataset.openJob);state.screen='detail';state.detailJobId=btn.dataset.openJob;state.notice=null;render();window.scrollTo({top:0,behavior:'smooth'});});
    document.querySelector('[data-back-dashboard]')?.addEventListener('click',()=>{state.screen='dashboard';state.detailJobId=null;state.notice=null;render();window.scrollTo({top:0,behavior:'smooth'});});
    document.querySelector('[data-refresh-jobs]')?.addEventListener('click',async()=>{state.refreshing=true;render();await refreshAssignedJobs(true);state.refreshing=false;state.lastUpdated=new Date().toISOString();render();});
    document.querySelector('[data-enable-notifications]')?.addEventListener('click',toggleJobNotifications);
    document.querySelector('[data-history-search]')?.addEventListener('input',e=>{state.historySearch=e.currentTarget.value;render();const input=document.querySelector('[data-history-search]');if(input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}});
    document.querySelector('[data-close-celebration]')?.addEventListener('click',()=>{state.completionCelebration=null;state.tab='home';state.screen='dashboard';render();});
    document.querySelectorAll('[data-dismiss-job-alert]').forEach(btn=>btn.onclick=()=>{dismissJobAlert(btn.dataset.dismissJobAlert);render();});
    document.querySelector('[data-own-availability]')?.addEventListener('change',async e=>{
      const select=e.currentTarget, previous=state.profile.availability_status||'Available';
      state.profile.availability_status=select.value;
      try{
        const {error}=await db.from('drivers').update({availability_status:select.value,last_seen_at:new Date().toISOString()}).eq('id',state.profile.linked_driver_id);
        if(error)throw error;
        notice(`Your status is now ${select.value}.`,'ok');
      }catch(error){state.profile.availability_status=previous;notice(error.message,'error');}
    });
    document.querySelectorAll('[data-network-offer]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const fd=new FormData(form);const button=form.querySelector('button');try{button.disabled=true;button.textContent='Submitting…';const{data,error}=await db.rpc('driver_submit_network_offer',{p_network_job_id:form.dataset.networkOffer,p_offer_amount:Number(fd.get('amount')),p_message:fd.get('message')||null});if(error)throw error;state.myBids=state.myBids.filter(x=>x.network_job_id!==form.dataset.networkOffer);state.myBids.unshift({id:data,network_job_id:form.dataset.networkOffer,driver_id:state.profile.linked_driver_id,offer_amount:Number(fd.get('amount')),message:fd.get('message')||null,status:'submitted'});notice('Your offer has been sent to KLS.','ok');}catch(error){button.disabled=false;button.textContent='Submit offer';notice(error.message,'error');}});
    document.querySelectorAll('[data-accept-award]').forEach(btn=>btn.onclick=async()=>{const{error}=await db.rpc('driver_accept_network_award',{p_network_job_id:btn.dataset.acceptAward});if(error){notice(error.message,'error');return;}await loadDriver();notice('Job accepted. It is now in My Jobs.','ok');});
    document.querySelectorAll('[data-decline-award]').forEach(btn=>btn.onclick=async()=>{const reason=prompt('Reason for declining (optional):')||null;const{error}=await db.rpc('driver_decline_network_award',{p_network_job_id:btn.dataset.declineAward,p_reason:reason});if(error){notice(error.message,'error');return;}await loadDriver();notice('Job declined and returned to the network.','ok');});
    document.querySelectorAll('[data-status-job]').forEach(btn=>btn.onclick=()=>confirmAndAdvance(btn.dataset.statusJob,btn.dataset.status,btn.textContent.trim()));
    document.querySelectorAll('[data-previous-job]').forEach(btn=>btn.onclick=()=>moveToPreviousStep(btn.dataset.previousJob,btn.dataset.status));
    document.querySelectorAll('[data-workflow-job]').forEach(btn=>btn.onclick=()=>{state.workflowJob=state.jobs.find(j=>j.id===btn.dataset.workflowJob);state.workflowType=btn.dataset.workflow;render();});
    document.querySelectorAll('[data-close-workflow]').forEach(btn=>btn.onclick=()=>{state.workflowJob=null;state.workflowType=null;render();});
    document.querySelector('[data-driver-help]')?.addEventListener('click',()=>{state.assistantHelp=true;render();});
    document.querySelector('[data-close-help]')?.addEventListener('click',()=>{state.assistantHelp=false;render();});
    document.querySelectorAll('[data-help-type]').forEach(btn=>btn.onclick=()=>{state.assistantHelp=false;state.tab='incident';state.screen='dashboard';render();setTimeout(()=>{const sel=document.querySelector('#incident-form select[name=type]');if(sel)sel.value=btn.dataset.helpType==='Running late'?'Traffic delay':btn.dataset.helpType;},0);});
    document.querySelector('[data-dismiss-arrival]')?.addEventListener('click',()=>{state.arrivalPrompt=null;render();});
    document.querySelector('[data-confirm-arrival]')?.addEventListener('click',()=>{const a=state.arrivalPrompt;state.arrivalPrompt=null;if(a)confirmAndAdvance(a.jobId,a.status,'Confirm arrival');});
    document.querySelector('[data-toggle-dark]')?.addEventListener('click',()=>{state.darkMode=!state.darkMode;localStorage.setItem('kls-driver-dark',state.darkMode?'1':'0');document.body.classList.toggle('dark',state.darkMode);render();});
    document.querySelectorAll('[data-nav-address]').forEach(btn=>btn.onclick=()=>{state.navAddress=btn.dataset.navAddress;render();});
    document.querySelector('[data-close-nav]')?.addEventListener('click',()=>{state.navAddress=null;render();});
    document.querySelectorAll('[data-favourite-address]').forEach(btn=>btn.onclick=()=>{const address=btn.dataset.favouriteAddress,key=favouriteKey(address);localStorage.setItem(key,isFavourite(address)?'0':'1');render();});
    document.querySelector('[data-optimise-route]')?.addEventListener('click',optimiseRoute);
    document.querySelector('[data-reset-route]')?.addEventListener('click',()=>{state.routeOrder=[];localStorage.removeItem('kls-driver-route-order');render();});
    document.querySelectorAll('[data-route-up]').forEach(btn=>btn.onclick=()=>moveRouteJob(btn.dataset.routeUp,-1));
    document.querySelectorAll('[data-route-down]').forEach(btn=>btn.onclick=()=>moveRouteJob(btn.dataset.routeDown,1));
    document.querySelectorAll('[data-route-alert]').forEach(btn=>btn.onclick=()=>reportRouteRisk(btn.dataset.routeAlert));
    document.querySelectorAll('[data-job-chat]').forEach(form=>form.onsubmit=async e=>{e.preventDefault();const message=String(new FormData(form).get('message')||'').trim();if(!message)return;const payload={job_id:form.dataset.jobChat,driver_id:state.profile.linked_driver_id,sender_type:'driver',message,created_at:new Date().toISOString()};if(!navigator.onLine){const queued={id:crypto.randomUUID(),type:'job_message',payload};state.offlineQueue.push(queued);saveOfflineQueue();state.jobMessages.push({...payload,id:queued.id,_queued:true});notice('Message saved and will send when your signal returns.','ok');return;}const{data,error}=await db.from('driver_job_messages').insert(payload).select().single();if(error){notice(error.message,'error');return;}state.jobMessages.push(data);render();});
    document.getElementById('driver-workflow-form')?.addEventListener('submit',completeWorkflow);
    document.getElementById('incident-form')?.addEventListener('submit',submitIncident);
    document.querySelectorAll('[data-pod]').forEach(btn=>{btn.onclick=()=>{state.podJob=state.jobs.find(j=>j.id===btn.dataset.pod);render();};});
    document.querySelectorAll('[data-close-pod]').forEach(btn=>btn.onclick=()=>{state.podJob=null;render();});
    setupSignature();
    document.getElementById('pod-submit-button')?.addEventListener('click',completePod);
    setupPhotoPreviews(); updateJobTimers(); clearInterval(window.__klsJobTimer); window.__klsJobTimer=setInterval(updateJobTimers,30000);
  }


  function applyAutomaticNightMode(){
    if(localStorage.getItem('kls-driver-dark')!==null)return;
    const h=new Date().getHours();state.darkMode=h>=19||h<7;
  }
  function startArrivalAssistant(){
    if(!navigator.geolocation||window.__klsArrivalWatch)return;
    window.__klsArrivalWatch=navigator.geolocation.watchPosition(pos=>{
      const job=state.jobs.find(j=>['En Route to Collection','In Transit'].includes(j.job_status));
      if(!job||state.arrivalPrompt)return;
      const lat=Number(job.job_status==='In Transit'?job.delivery_latitude:job.collection_latitude);
      const lng=Number(job.job_status==='In Transit'?job.delivery_longitude:job.collection_longitude);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
      const rad=Math.PI/180, dlat=(pos.coords.latitude-lat)*rad, dlng=(pos.coords.longitude-lng)*rad;
      const a=Math.sin(dlat/2)**2+Math.cos(lat*rad)*Math.cos(pos.coords.latitude*rad)*Math.sin(dlng/2)**2;
      const metres=6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      if(metres<=150){state.arrivalPrompt={jobId:job.id,status:job.job_status==='In Transit'?'Arrived at Delivery':'Arrived at Collection',label:job.job_status==='In Transit'?'Delivery location':'Collection location'};render();}
    },()=>{}, {enableHighAccuracy:false,maximumAge:60000,timeout:10000});
  }

  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out. Please refresh and try again.`)), ms))
  ]);

  function loadingStage(text){
    state.loading=true;
    root.innerHTML=`<div class="driver-loading pro-loading"><div class="loader-mark">KLS</div><span></span><p>${esc(text)}</p></div>`;
  }

  async function loadDriver(){
    try{
      loadingStage('Checking driver account…');
      state.profile=null;
      state.jobs=[];
      state.networkJobs=[];
      state.myBids=[];

      if(!state.user?.id) throw new Error('No signed-in user was found. Please sign out and sign in again.');

      const claimResult = await withTimeout(db.rpc('claim_driver_login'),10000,'Driver invitation check');
      let account = claimResult.error ? null : claimResult.data;
      if(Array.isArray(account)) account=account[0]||null;
      let driver=null;
      if(account?.driver_id){
        const linkedResult=await withTimeout(db.from('drivers').select('id,user_id,name,phone,vehicle,availability_status').eq('id',account.driver_id).maybeSingle(),10000,'Linked driver record');
        if(linkedResult.error)throw linkedResult.error;
        driver=linkedResult.data;
      }else{
        const ownerResult=await withTimeout(db.from('drivers').select('id,user_id,name,phone,vehicle,availability_status').eq('user_id',state.user.id).maybeSingle(),10000,'Office driver account check');
        if(ownerResult.error&&!claimResult.error)throw ownerResult.error;
        driver=ownerResult.data;
      }

      if(!driver){
        state.loading=false;
        state.profile=null;
        state.notice={text:claimResult.error?.message||`No active driver invitation is linked to ${state.user.email}. Ask the KLS office to check the email and resend your setup link.`,type:'error'};
        render();
        return;
      }

      const ownerCheck = await db.from('business_settings').select('user_id').eq('user_id',state.user.id).maybeSingle();
      state.isOfficeOwner = !ownerCheck.error && !!ownerCheck.data;

      state.profile={
        account_id:account?.id||null,
        owner_id:account?.owner_id||driver.user_id,
        driver_id:driver.id,
        linked_driver_id:driver.id,
        driver_name:driver.name,
        driver_phone:driver.phone,
        driver_vehicle:driver.vehicle,
        availability_status:driver.availability_status||'Available'
      };

      loadingStage('Loading assigned jobs…');
      const jobsResult = await withTimeout(
        db.from('jobs')
          .select('*')
          .eq('assigned_driver_id',driver.id)
          .is('archived_at',null)
          .order('collection_date',{ascending:true}),
        10000,
        'Assigned jobs'
      );
      if(jobsResult.error) throw jobsResult.error;
      state.jobs=jobsResult.data||[];
      const messagesResult=await db.from('driver_messages').select('*').eq('driver_id',driver.id).order('created_at',{ascending:false}).limit(50);
      state.messages=messagesResult.error?[]:(messagesResult.data||[]);
      const jobMessagesResult=await db.from('driver_job_messages').select('*').eq('driver_id',driver.id).order('created_at',{ascending:true}).limit(200);
      state.jobMessages=jobMessagesResult.error?[]:(jobMessagesResult.data||[]);
      const documentsResult=state.jobs.length?await db.from('job_documents').select('*').in('job_id',state.jobs.map(j=>j.id)).order('created_at',{ascending:false}):{data:[],error:null};
      state.jobDocuments=documentsResult.error?[]:(documentsResult.data||[]);
      state.lastUpdated=new Date().toISOString();
      await syncNotificationState();
      const requestedJob=String(new URLSearchParams(location.search).get('job')||'');
      if(requestedJob&&state.jobs.some(job=>job.id===requestedJob)){
        state.tab='home';state.screen='detail';state.detailJobId=requestedJob;
        history.replaceState({},'',location.pathname);
      }

      // Driver Exchange is deliberately loaded after the core app is visible.
      // Missing optional tables must never block the Driver App.
      state.loading=false;
      state.notice=null;
      render();
      startDriverPolling();

      Promise.allSettled([
        db.from('driver_network_jobs').select('*').order('created_at',{ascending:false}),
        db.from('driver_network_offers').select('*').eq('driver_id',driver.id).order('submitted_at',{ascending:false})
      ]).then(results=>{
        const [network,bids]=results;
        if(network.status==='fulfilled'&&!network.value.error)state.networkJobs=network.value.data||[];
        if(bids.status==='fulfilled'&&!bids.value.error)state.myBids=bids.value.data||[];
        if(state.tab==='exchange')render();
      });

      const active=state.jobs.find(j=>['En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery'].includes(j.job_status));
      if(active)startTracking(active.id,false);
    }catch(error){
      state.loading=false;
      state.notice={text:error?.message||'Unable to load the Driver App.',type:'error'};
      render();
    }
  }

  async function sendCustomerJobUpdate(jobId,status){
    try{
      const {error}=await db.functions.invoke('send-customer-job-update',{body:{job_id:jobId,status}});
      if(error)console.warn('Customer status email was not delivered',error);
    }catch(error){
      console.warn('Customer status email was not delivered',error);
    }
  }

  async function confirmAndAdvance(jobId,status,label){
    const job=state.jobs.find(j=>j.id===jobId);
    const question=status==='Arrived at Collection'||status==='Arrived at Delivery'
      ? `Confirm you have arrived for ${job?.job_number||'this job'}?`
      : status==='Collected' ? 'Confirm the goods have been collected?'
      : `Confirm “${label}”?`;
    if(!confirm(question))return;
    await advanceStatus(jobId,status,false);
  }

  async function advanceStatus(jobId,status,isCorrection=false){
    try{
      const pos=await nowPosition().catch(()=>null);
      const {error}=await db.rpc('driver_update_job_status',{p_job_id:jobId,p_status:status,p_latitude:pos?.coords.latitude??null,p_longitude:pos?.coords.longitude??null,p_accuracy:pos?.coords.accuracy??null});
      if(error)throw error;
      const job=state.jobs.find(j=>j.id===jobId);if(job)job.job_status=status;
      if(!isCorrection)void sendCustomerJobUpdate(jobId,status);
      if(status==='En Route to Collection')startTracking(jobId,true);
      else if(['Arrived at Collection','Collected','In Transit','Arrived at Delivery'].includes(status)&&watchId===null)startTracking(jobId,false);
      notice(isCorrection?`${job?.job_number||'Job'} moved back to ${status}.`:`${job?.job_number||'Job'} updated to ${status}.`,'ok');
    }catch(error){notice(error.message,'error');}
  }

  async function moveToPreviousStep(jobId,status){
    const job=state.jobs.find(j=>j.id===jobId);
    const currentLabel=statusDisplay[job?.job_status]?.[0]||job?.job_status||'current step';
    const nextLabel=statusDisplay[status]?.[0]||status;
    if(!confirm(`Go back from “${currentLabel}” to “${nextLabel}”?`))return;
    await advanceStatus(jobId,status,true);
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


  async function completeWorkflow(e){
    e.preventDefault();
    const job=state.workflowJob, type=state.workflowType, form=e.currentTarget, button=form.querySelector('button[type="submit"]');
    try{
      button.disabled=true;button.textContent='Saving…';
      const fd=new FormData(form);
      const photo=fd.get('photo');
      let photoUrl=null;
      if(photo?.size)photoUrl=await upload(job,photo,type==='collection'?'collection':'delivery');
      if(type==='collection'){
        const {error}=await db.rpc('driver_save_collection_check',{
          p_job_id:job.id,
          p_condition:String(fd.get('condition')||'')||null,
          p_notes:String(fd.get('notes')||'')||null,
          p_photo_url:photoUrl
        });
        if(error)throw error;
        job.collection_photo_url=photoUrl;
        state.workflowJob=null;state.workflowType=null;
        await advanceStatus(job.id,'Collected',false);
        await advanceStatus(job.id,'In Transit',false);
      }else{
        if(photoUrl)job._workflowDeliveryPhoto=photoUrl;
        state.workflowJob=null;state.workflowType=null;state.podJob=job;render();
      }
    }catch(error){button.disabled=false;button.textContent=type==='collection'?'Confirm loaded & begin delivery':'Continue to signature & POD';notice(error.message,'error');}
  }

  async function submitIncident(e){
    e.preventDefault();const form=e.currentTarget,fd=new FormData(form),button=form.querySelector('button');
    try{button.disabled=true;button.textContent='Sending…';let photoUrl=null;const photo=fd.get('photo');const job=state.jobs.find(j=>j.id===fd.get('job_id'));if(photo?.size)photoUrl=await upload(job||{id:'incident'},photo,'incident');const pos=await nowPosition().catch(()=>null);const {error}=await db.from('driver_incidents').insert({driver_id:state.profile.linked_driver_id,job_id:fd.get('job_id')||null,incident_type:fd.get('type'),notes:fd.get('notes'),photo_url:photoUrl,latitude:pos?.coords.latitude??null,longitude:pos?.coords.longitude??null});if(error)throw error;state.tab='home';notice('Incident report sent to dispatch.','ok');}catch(error){button.disabled=false;button.textContent='Send incident report';notice(error.message,'error');}
  }

  async function completePod(e){
    e?.preventDefault?.();
    const job=state.podJob;
    const form=document.getElementById('driver-pod-form');
    const btn=document.getElementById('pod-submit-button');
    const statusBox=document.getElementById('pod-upload-status');
    const showStage=(text,type='ok')=>{
      if(statusBox){statusBox.hidden=false;statusBox.className=`driver-msg ${type}`;statusBox.textContent=text;}
      if(btn)btn.textContent=text;
    };
    const timed=(promise,label,ms=25000)=>Promise.race([
      promise,
      new Promise((_,reject)=>setTimeout(()=>reject(new Error(`${label} timed out. Check your connection and try again.`)),ms))
    ]);
    try{
      if(!job||!form||!btn)throw new Error('The POD form was not ready. Close it and open it again.');
      if(signatureIsBlank())throw new Error('Please obtain the recipient signature.');
      const fd=new FormData(form);
      const recipient=String(fd.get('recipient_name')||'').trim();
      if(!recipient)throw new Error('Please enter the recipient name.');
      const photo=fd.get('photo');
      if(!photo?.size)throw new Error('Please take a delivery photo or choose one from your photo library.');
      btn.disabled=true;
      state.notice=null;
      showStage('Uploading photo…');
      const photoUrl=await timed(upload(job,photo,'photo'),'Photo upload');
      showStage('Uploading signature…');
      const blob=await new Promise(resolve=>signatureCanvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('The signature could not be prepared. Please clear it and sign again.');
      const signatureUrl=await timed(upload(job,blob,'signature'),'Signature upload');
      showStage('Completing job…');
      const pos=await nowPosition().catch(()=>null);
      const payload={
        p_job_id:job.id,
        p_recipient_name:recipient,
        p_pod_notes:String(fd.get('notes')||'').trim()||null,
        p_photo_url:photoUrl,
        p_signature_url:signatureUrl,
        p_latitude:pos?.coords.latitude??null,
        p_longitude:pos?.coords.longitude??null
      };
      const rpcResult=await timed(db.rpc('driver_complete_job',payload),'Job completion');
      if(rpcResult.error)throw rpcResult.error;
      void sendCustomerJobUpdate(job.id,'Delivered');
      const verify=await timed(db.from('jobs').select('*').eq('id',job.id).maybeSingle(),'Delivery confirmation');
      if(verify.error)throw verify.error;
      Object.assign(job,verify.data||{job_status:'Delivered',delivered_at:new Date().toISOString(),recipient_name:recipient,pod_photo_url:photoUrl,pod_signature_url:signatureUrl});
      state.podJob=null;stopTracking(false);
      state.completionCelebration={id:job.id,job_number:job.job_number};
      state.notice=null;
      await refreshAssignedJobs();
      render();
    }catch(error){
      if(btn){btn.disabled=false;btn.textContent='Upload POD & complete job';}
      if(statusBox){statusBox.hidden=false;statusBox.className='driver-msg error';statusBox.textContent=error?.message||'The POD could not be uploaded.';}
      console.error('KLS POD upload failed',error);
    }
  }


  let driverPollId=null;
  async function refreshAssignedJobs(force=false){
    if(!db||!state.profile?.linked_driver_id||(!force&&document.hidden))return;
    const {data,error}=await db.from('jobs').select('*').eq('assigned_driver_id',state.profile.linked_driver_id).is('archived_at',null).order('collection_date',{ascending:true});
    if(error)return;
    const previousIds=new Set(state.jobs.map(job=>job.id));
    const before=JSON.stringify(state.jobs.map(j=>[j.id,j.job_status,j.updated_at,j.delivered_at,j.pod_photo_url]));
    const after=JSON.stringify((data||[]).map(j=>[j.id,j.job_status,j.updated_at,j.delivered_at,j.pod_photo_url]));
    state.lastUpdated=new Date().toISOString();
    if(before!==after){
      const incoming=(data||[]).filter(job=>!previousIds.has(job.id)&&job.job_status!=='Delivered');
      state.jobs=data||[];
      incoming.forEach(notifyNewJob);
      render();
    }
  }
  function startDriverPolling(){if(driverPollId)clearInterval(driverPollId);driverPollId=setInterval(refreshAssignedJobs,5000);}

  let authLoadToken = 0;
  function queueDriverLoad(){
    const token=++authLoadToken;
    setTimeout(async()=>{
      if(token!==authLoadToken||!state.user)return;
      await loadDriver();
    },0);
  }

  async function init(){
    if(!db){
      state.loading=false;
      state.notice={text:'Supabase URL or anon key is invalid. Check the Vercel environment variables and redeploy.',type:'error'};
      render();
      return;
    }

    loadingStage('Checking saved login…');
    try{
      const sessionResult=await withTimeout(db.auth.getSession(),10000,'Saved login check');
      if(sessionResult.error)throw sessionResult.error;
      state.user=sessionResult.data.session?.user||null;
    }catch(error){
      state.loading=false;
      state.notice={text:error?.message||'Unable to read the saved login.',type:'error'};
      render();
      return;
    }

    db.auth.onAuthStateChange((_event,sessionNow)=>{
      const nextUser=sessionNow?.user||null;
      const changed=nextUser?.id!==state.user?.id;
      state.user=nextUser;
      if(!state.user){
        authLoadToken++;
        stopTracking(false);
        state.profile=null;state.jobs=[];state.isOfficeOwner=false;state.loading=false;render();
      }else if(changed&&state.mode!=='recovery'){
        queueDriverLoad();
      }
    });

    if(state.mode==='recovery'){state.loading=false;render();}
    else if(state.user)await loadDriver();
    else{state.loading=false;render();}
  }
  window.addEventListener('online',async()=>{state.online=true;await flushOfflineQueue();await loadDriver();render();});
  window.addEventListener('offline',()=>{state.online=false;render();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user&&state.profile)refreshAssignedJobs(true);});
  init();
})();
