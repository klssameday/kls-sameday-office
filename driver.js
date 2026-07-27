// KLS SameDay Driver v32.0 — Professional Edition
(() => {
  const raw = window.KLS_CONFIG || {};
  const root = document.getElementById('driver-app');
  const url = String(raw.supabaseUrl || '').trim();
  const key = String(raw.supabaseAnonKey || '').trim();
  const validUrl = (() => {
    try { return new URL(url).hostname.endsWith('.supabase.co'); } catch { return false; }
  })();
  const db = validUrl && key && window.supabase ? window.supabase.createClient(url, key) : null;
  const steps = ['Booked','En Route to Collection','Arrived at Collection','Collected','In Transit','Arrived at Delivery','Delivered'];
  let state = { user:null, profile:null, jobs:[], loading:true, mode:'signin', notice:null, podJob:null, tab:'home', screen:'dashboard', detailJobId:null, networkJobs:[], myBids:[], online:navigator.onLine, lastUpdated:null, refreshing:false, jobAlerts:[], notificationsEnabled:typeof Notification!=='undefined'&&Notification.permission==='granted', completionCelebration:null };
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



  function notifyNewJob(job){
    if(!job)return;
    state.jobAlerts=state.jobAlerts.filter(item=>item.id!==job.id);
    state.jobAlerts.unshift(job);
    if(state.notificationsEnabled&&typeof Notification!=='undefined'&&Notification.permission==='granted'){
      try{
        const alert=new Notification(`New KLS job: ${job.job_number||'Assigned job'}`,{
          body:`${shortPlace(job.collection_address)} → ${shortPlace(job.delivery_address)} · ${jobTime(job)}`,
          icon:'/icons/icon-192.png',
          tag:`kls-job-${job.id}`,
          renotify:true
        });
        alert.onclick=()=>{window.focus();state.tab='home';state.screen='detail';state.detailJobId=job.id;state.jobAlerts=state.jobAlerts.filter(item=>item.id!==job.id);render();};
      }catch(error){ console.warn('Driver notification unavailable',error); }
    }
  }
  async function enableJobNotifications(){
    if(typeof Notification==='undefined'){notice('Job notifications are not supported on this device.','error');return;}
    const permission=await Notification.requestPermission();
    state.notificationsEnabled=permission==='granted';
    notice(state.notificationsEnabled?'New job alerts are now enabled.':'Notification permission was not enabled.',state.notificationsEnabled?'ok':'error');
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

  function authView(){
    const signup=state.mode==='signup';
    return `<div class="driver-auth"><section class="driver-auth-card"><div class="driver-brand"><b>KLS</b><span>Driver<small>SameDay mobile app</small></span></div><h1>${signup?'Create driver login':'Driver sign in'}</h1><p>Only assigned jobs, navigation, tracking and proof of delivery are shown here. Prices and office accounts are not available.</p>${state.notice?`<div class="driver-msg ${state.notice.type}">${esc(state.notice.text)}</div>`:''}<form id="driver-auth-form"><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" minlength="6" autocomplete="current-password" required></label><button class="btn primary full">${signup?'Create login':'Sign in'}</button></form><div class="auth-switch">${signup?'Already registered?':'First time?'} <button data-mode="${signup?'signin':'signup'}">${signup?'Sign in':'Create driver login'}</button></div></section></div>`;
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
      ${current?currentJobHero(current):`<section class="pro-no-job"><span>✓</span><h2>No active job</h2><p>The office will send assigned work automatically.</p></section>`}
      <div class="pro-stats"><div><small>UPCOMING</small><strong>${upcoming.length}</strong></div><div><small>COMPLETED TODAY</small><strong>${completed.length}</strong></div><button data-refresh-jobs ${state.refreshing?'disabled':''}><small>LAST UPDATE</small><strong>${state.refreshing?'Refreshing…':state.lastUpdated?new Date(state.lastUpdated).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}):'Refresh'}</strong></button></div>
      <div class="dashboard-section-title"><h2>Upcoming jobs</h2><span>${upcoming.length}</span></div>
      ${upcoming.length?`<div class="dashboard-job-list">${upcoming.map(j=>miniJobCard(j)).join('')}</div>`:'<div class="empty compact"><strong>No upcoming jobs</strong><p>Nothing else is currently assigned.</p></div>'}
    </section>`;
  }
  function jobsView(){
    const active=state.jobs.filter(j=>j.job_status!=='Delivered');
    const completed=state.jobs.filter(j=>j.job_status==='Delivered').slice().reverse();
    return `<section class="jobs-screen">
      <div class="screen-heading"><small>MY WORK</small><h1>Jobs</h1><p>Active and completed KLS jobs.</p></div>
      <div class="dashboard-section-title"><h2>Active</h2><span>${active.length}</span></div>
      ${active.length?`<div class="dashboard-job-list">${active.map(j=>miniJobCard(j,activeStatuses.includes(j.job_status)?'ACTIVE':'ASSIGNED')).join('')}</div>`:'<div class="empty compact"><strong>No active jobs</strong><p>Your assigned work will appear here.</p></div>'}
      <div class="dashboard-section-title history-title"><h2>Completed</h2><span>${completed.length}</span></div>
      ${completed.length?`<div class="dashboard-job-list completed-list">${completed.map(j=>miniJobCard(j,'COMPLETED')).join('')}</div>`:'<div class="empty compact"><strong>No completed jobs</strong></div>'}
    </section>`;
  }
  function profileView(){
    return `<section class="profile-screen">
      <div class="screen-heading"><small>DRIVER PROFILE</small><h1>${esc(state.profile?.driver_name||'Driver')}</h1><p>${esc(state.profile?.driver_vehicle||'Vehicle not set')}</p></div>
      <div class="profile-card"><div><span>Login</span><b>${esc(state.user?.email||'')}</b></div><div><span>Telephone</span><b>${esc(state.profile?.driver_phone||'Not set')}</b></div><div><span>Availability</span><b>${esc(state.profile?.availability_status||'Available')}</b></div></div>
      <section class="profile-notification-card"><div><span>New job alerts</span><b>${state.notificationsEnabled?'Enabled':'Not enabled'}</b></div><button class="btn secondary" data-enable-notifications>${state.notificationsEnabled?'Enabled ✓':'Enable alerts'}</button></section>
      <button class="btn secondary full profile-signout" data-signout>Sign out</button>
    </section>`;
  }
  function detailSection(title,address,contact,phone,notes,company,timeLabel,timeValue){
    return `<section class="location-card detailed-location"><div class="location-title"><small>${esc(title)}</small>${timeValue?`<b>${esc(timeLabel)}: ${esc(timeValue)}</b>`:''}</div>${company?`<h3>${esc(company)}</h3>`:''}<h2>${esc(address||'Address not supplied')}</h2>${contact?`<div class="location-line"><span>Contact</span><b>${esc(contact)}</b></div>`:''}${phone?`<div class="location-line"><span>Telephone</span><b class="phone-number">${esc(phone)}</b></div>`:''}${notes?`<div class="job-instructions"><span>Instructions</span><p>${esc(notes)}</p></div>`:''}</section>`;
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
      ${importantNotes(job)}
      <div class="workflow-progress">${steps.map((step,i)=>`<span class="${i<idx?'complete':i===idx?'current':''}"><i></i><small>${esc(step)}</small></span>`).join('')}</div>
      ${detailSection('COLLECTION',job.collection_address,contactValue(job,'collection'),phoneValue(job,'collection'),notesValue(job,'collection'),collectCompany,'Ready',collectionClock)}
      ${detailSection('DELIVERY',job.delivery_address,contactValue(job,'delivery'),phoneValue(job,'delivery'),notesValue(job,'delivery'),deliveryCompany,'Deadline',deliveryClock)}
      ${goodsDetails(job)}
      ${jobInfoPanel(job)}
      <section class="job-activity-card"><div class="activity-heading"><div><small>JOB ACTIVITY</small><h2>Progress history</h2></div><span>${esc(statusDisplay[job.job_status]?.[0]||job.job_status||'Booked')}</span></div><div class="activity-list">${activityRows(job).map(row=>`<div class="activity-row ${row.current?'current':''}"><i></i><div><b>${esc(row.step)}</b><small>${row.time?fmtClock(row.time):(row.complete?'Completed':'Current step')}</small></div></div>`).join('')}</div></section>
      <div class="sticky-job-actions">
        ${job.job_status!=='Delivered'?`<a class="btn secondary navigate-btn" target="_blank" rel="noopener" href="${mapsLink(destination)}">Open navigation</a>`:''}
        ${action?`<button class="btn primary main-action" data-status-job="${job.id}" data-status="${esc(action[1])}">${esc(action[0])}</button>`:''}
        ${job.job_status==='Arrived at Delivery'?`<button class="btn primary main-action" data-pod="${job.id}">Photo, signature & complete</button>`:''}
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


  function appView(){
    const driverName=state.profile?.driver_name || 'Driver';
    const vehicle=state.profile?.driver_vehicle || 'Vehicle not set';
    const detailJob=state.detailJobId?state.jobs.find(j=>j.id===state.detailJobId):null;
    const mainContent=state.screen==='detail'&&detailJob
      ? jobDetailView(detailJob)
      : state.tab==='exchange' ? exchangeView()
      : state.tab==='jobs' ? jobsView()
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
        ${state.podJob?podView(state.podJob):''}
        ${state.completionCelebration?`<div class="completion-celebration"><section><div class="completion-tick">✓</div><small>DELIVERY COMPLETE</small><h2>${esc(state.completionCelebration.job_number||'Job')}</h2><p>Proof of delivery has been saved successfully.</p><button class="btn primary full" data-close-celebration>Back to home</button></section></div>`:''}
      </main>
      ${state.screen!=='detail'?`<nav class="bottom-nav" aria-label="Driver navigation">
        <button class="${state.tab==='home'?'active':''}" data-driver-tab="home"><i>⌂</i><span>Home</span></button>
        <button class="${state.tab==='jobs'?'active':''}" data-driver-tab="jobs"><i>▤</i><span>Jobs</span>${state.jobs.filter(j=>j.job_status!=='Delivered').length?`<em>${state.jobs.filter(j=>j.job_status!=='Delivered').length}</em>`:''}</button>
        <button class="${state.tab==='exchange'?'active':''}" data-driver-tab="exchange"><i>⇄</i><span>Exchange</span>${state.networkJobs.filter(j=>j.status==='open').length?`<em>${state.networkJobs.filter(j=>j.status==='open').length}</em>`:''}</button>
        <button class="${state.tab==='profile'?'active':''}" data-driver-tab="profile"><i>◉</i><span>Profile</span></button>
      </nav>`:''}
    </div>`;
  }

  function render(){
    if(state.loading){root.innerHTML='<div class="driver-loading pro-loading"><div class="loader-mark">KLS</div><span></span><p>Loading Driver App…</p></div>';return;}
    if(!state.user){root.innerHTML=authView();bindAuth();return;}
    if(!state.profile){root.innerHTML=`<div class="driver-auth"><section class="driver-auth-card"><div class="driver-brand"><b>KLS</b><span>Driver</span></div><h1>Account not linked</h1>${state.notice?`<div class="driver-msg ${state.notice.type}">${esc(state.notice.text)}</div>`:`<p>Ask the KLS office to link this exact login email to your driver record:</p><div class="driver-msg error">${esc(state.user.email)}</div>`}<button class="btn secondary full" data-signout>Sign out</button></section></div>`;bindCommon();return;}
    root.innerHTML=appView();bindApp();
  }

  function bindCommon(){document.querySelectorAll('[data-signout]').forEach(b=>b.onclick=async()=>{stopTracking(false);await db.auth.signOut();});}
  function bindAuth(){
    document.querySelector('[data-mode]')?.addEventListener('click',e=>{state.mode=e.currentTarget.dataset.mode;state.notice=null;render();});
    document.getElementById('driver-auth-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.currentTarget));try{if(!db)throw new Error('Supabase is not configured.');if(state.mode==='signup'){const{data,error}=await db.auth.signUp({email:f.email,password:f.password});if(error)throw error;if(!data.session){state.notice={text:'Login created. Confirm the email, then sign in.',type:'ok'};render();return;}}else{const{error}=await db.auth.signInWithPassword({email:f.email,password:f.password});if(error)throw error;}}catch(error){state.notice={text:error.message,type:'error'};render();}});
  }

  function bindApp(){
    bindCommon();
    document.querySelectorAll('[data-driver-tab]').forEach(btn=>btn.onclick=()=>{state.tab=btn.dataset.driverTab;state.screen='dashboard';state.detailJobId=null;render();});
    document.querySelectorAll('[data-open-job]').forEach(btn=>btn.onclick=e=>{e.stopPropagation();dismissJobAlert(btn.dataset.openJob);state.screen='detail';state.detailJobId=btn.dataset.openJob;state.notice=null;render();window.scrollTo({top:0,behavior:'smooth'});});
    document.querySelector('[data-back-dashboard]')?.addEventListener('click',()=>{state.screen='dashboard';state.detailJobId=null;state.notice=null;render();window.scrollTo({top:0,behavior:'smooth'});});
    document.querySelector('[data-refresh-jobs]')?.addEventListener('click',async()=>{state.refreshing=true;render();await refreshAssignedJobs(true);state.refreshing=false;state.lastUpdated=new Date().toISOString();render();});
    document.querySelector('[data-enable-notifications]')?.addEventListener('click',enableJobNotifications);
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
    document.querySelectorAll('[data-pod]').forEach(btn=>{btn.onclick=()=>{state.podJob=state.jobs.find(j=>j.id===btn.dataset.pod);render();};});
    document.querySelectorAll('[data-close-pod]').forEach(btn=>btn.onclick=()=>{state.podJob=null;render();});
    setupSignature();
    document.getElementById('pod-submit-button')?.addEventListener('click',completePod);
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

      // Use the real KLS schema directly: public.drivers.user_id links the
      // authenticated Supabase user to the driver record. No RPC is required.
      const driverResult = await withTimeout(
        db.from('drivers')
          .select('id,user_id,name,phone,vehicle,availability_status')
          .eq('user_id',state.user.id)
          .maybeSingle(),
        10000,
        'Driver account check'
      );
      if(driverResult.error) throw driverResult.error;
      const driver=driverResult.data;

      if(!driver){
        state.loading=false;
        state.profile=null;
        state.notice={text:`No driver record is linked to ${state.user.email}. In Driver Control, make sure this login is linked to the driver.`,type:'error'};
        render();
        return;
      }

      state.profile={
        account_id:null,
        owner_id:driver.user_id,
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
          .order('collection_date',{ascending:true}),
        10000,
        'Assigned jobs'
      );
      if(jobsResult.error) throw jobsResult.error;
      state.jobs=jobsResult.data||[];
      state.lastUpdated=new Date().toISOString();

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
    const {data,error}=await db.from('jobs').select('*').eq('assigned_driver_id',state.profile.linked_driver_id).order('collection_date',{ascending:true});
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
        state.profile=null;state.jobs=[];state.loading=false;render();
      }else if(changed){
        queueDriverLoad();
      }
    });

    if(state.user)await loadDriver();
    else{state.loading=false;render();}
  }
  window.addEventListener('online',()=>{state.online=true;refreshAssignedJobs(true);render();});
  window.addEventListener('offline',()=>{state.online=false;render();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user&&state.profile)refreshAssignedJobs(true);});
  init();
})();
