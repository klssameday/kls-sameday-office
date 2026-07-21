import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase, configured } from './supabase'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  LayoutDashboard, Users, Truck, FileText, ReceiptText, Settings,
  Plus, LogOut, Save, Download, Pencil, Trash2
} from 'lucide-react'
import './styles.css'

const vehicles = ['Small Van', 'LWB Van', 'XLWB Van', 'Luton Curtainsider with Tail Lift']
const jobStatuses = ['Enquiry', 'Quoted', 'Booked', 'Collected', 'In Transit', 'Delivered', 'Invoiced', 'Paid', 'Cancelled']
const quoteStatuses = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired']
const invoiceStatuses = ['Not Invoiced', 'Sent', 'Part Paid', 'Paid', 'Overdue']

const money = n => new Intl.NumberFormat('en-GB', {style:'currency', currency:'GBP'}).format(Number(n || 0))
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-GB') : ''
const uid = () => crypto.randomUUID()

const defaultSettings = {
  trading_name: 'KLS SameDay',
  legal_name: 'Kings Logistics Services Ltd',
  phone: '0330 043 5237',
  whatsapp: '07361 854157',
  email: 'info@klssameday.co.uk',
  website: 'klssameday.co.uk',
  address_line: 'Based in Essex — Nationwide Coverage',
  bank_name: '',
  sort_code: '',
  account_number: '',
  default_terms: 7
}

function App() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [page, setPage] = useState('dashboard')
  const [customers, setCustomers] = useState([])
  const [jobs, setJobs] = useState([])
  const [settings, setSettings] = useState(defaultSettings)

  useEffect(() => {
    if (!configured) { setReady(true); return }
    supabase.auth.getSession().then(({data}) => { setSession(data.session); setReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) loadAll()
  }, [session])

  async function loadAll() {
    const [{data:c}, {data:j}, {data:s}] = await Promise.all([
      supabase.from('customers').select('*').order('company'),
      supabase.from('jobs').select('*').order('created_at', {ascending:false}),
      supabase.from('business_settings').select('*').limit(1).maybeSingle()
    ])
    setCustomers(c || [])
    setJobs(j || [])
    if (s) setSettings(s)
  }

  if (!ready) return <div className="centre">Loading…</div>
  if (!configured) return <SetupScreen />
  if (!session) return <Login />

  return (
    <div className="shell">
      <aside>
        <div className="brand"><strong>KLS</strong><span>SameDay Office</span></div>
        <Nav page={page} setPage={setPage}/>
        <button className="signout" onClick={() => supabase.auth.signOut()}><LogOut size={18}/> Sign out</button>
      </aside>
      <main>
        {page === 'dashboard' && <Dashboard jobs={jobs} customers={customers}/>}
        {page === 'customers' && <Customers customers={customers} reload={loadAll}/>}
        {page === 'jobs' && <Jobs jobs={jobs} customers={customers} reload={loadAll}/>}
        {page === 'quotes' && <Documents mode="quote" jobs={jobs} settings={settings}/>}
        {page === 'invoices' && <Documents mode="invoice" jobs={jobs} settings={settings}/>}
        {page === 'settings' && <SettingsPage settings={settings} setSettings={setSettings}/>}
      </main>
    </div>
  )
}

function SetupScreen() {
  return <div className="centre setup">
    <h1>KLS SameDay Office</h1>
    <p>The app is built, but it still needs connecting to Supabase.</p>
    <ol>
      <li>Create a Supabase project.</li>
      <li>Run the SQL file in <code>supabase/schema.sql</code>.</li>
      <li>Copy <code>.env.example</code> to <code>.env</code>.</li>
      <li>Add your Supabase URL and anon key.</li>
      <li>Run <code>npm install</code> and <code>npm run dev</code>.</li>
    </ol>
  </div>
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  async function submit(e) {
    e.preventDefault(); setMessage('')
    const {error} = await supabase.auth.signInWithPassword({email, password})
    if (error) setMessage(error.message)
  }
  return <div className="login-wrap"><form className="login-card" onSubmit={submit}>
    <h1>KLS SameDay Office</h1><p>Secure business login</p>
    <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
    <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
    {message && <div className="error">{message}</div>}
    <button className="primary">Sign in</button>
  </form></div>
}

function Nav({page, setPage}) {
  const items = [
    ['dashboard','Dashboard',LayoutDashboard],['customers','Customers',Users],
    ['jobs','Jobs',Truck],['quotes','Quotes',FileText],
    ['invoices','Invoices',ReceiptText],['settings','Settings',Settings]
  ]
  return <nav>{items.map(([id,label,Icon]) =>
    <button key={id} className={page===id?'active':''} onClick={()=>setPage(id)}><Icon size={18}/>{label}</button>
  )}</nav>
}

function Dashboard({jobs, customers}) {
  const total = jobs.reduce((a,j)=>a+Number(j.total_price||0),0)
  const paid = jobs.reduce((a,j)=>a+Number(j.amount_paid||0),0)
  const outstanding = total-paid
  const profit = jobs.reduce((a,j)=>a+Number(j.total_price||0)-Number(j.costs||0),0)
  const month = new Date().toISOString().slice(0,7)
  const monthly = jobs.filter(j=>(j.collection_date||'').startsWith(month)).reduce((a,j)=>a+Number(j.total_price||0),0)
  const cards = [
    ['Total job value',money(total)],['Amount received',money(paid)],['Outstanding',money(outstanding)],
    ['This month',money(monthly)],['Customers',customers.length],['Estimated profit',money(profit)]
  ]
  return <><PageTitle title="Dashboard" subtitle="Your business at a glance"/>
    <div className="cards">{cards.map(([a,b])=><div className="card" key={a}><span>{a}</span><strong>{b}</strong></div>)}</div>
    <section className="panel"><h2>Recent jobs</h2><JobTable jobs={jobs.slice(0,10)} compact/></section>
  </>
}

function Customers({customers, reload}) {
  const blank = {company:'',contact_name:'',phone:'',email:'',billing_address:'',payment_terms:7,notes:''}
  const [form,setForm]=useState(blank)
  async function save(e){e.preventDefault(); await supabase.from('customers').insert(form); setForm(blank); reload()}
  async function remove(id){if(confirm('Delete this customer?')){await supabase.from('customers').delete().eq('id',id);reload()}}
  return <><PageTitle title="Customers" subtitle="Store customer details and payment terms"/>
    <section className="panel"><h2>Add customer</h2><form onSubmit={save} className="form-grid">
      <Field label="Company" value={form.company} onChange={v=>setForm({...form,company:v})} required/>
      <Field label="Contact name" value={form.contact_name} onChange={v=>setForm({...form,contact_name:v})}/>
      <Field label="Phone" value={form.phone} onChange={v=>setForm({...form,phone:v})}/>
      <Field label="Email" type="email" value={form.email} onChange={v=>setForm({...form,email:v})}/>
      <Field label="Billing address" textarea value={form.billing_address} onChange={v=>setForm({...form,billing_address:v})}/>
      <Field label="Payment terms (days)" type="number" value={form.payment_terms} onChange={v=>setForm({...form,payment_terms:+v})}/>
      <div className="full"><button className="primary"><Save size={17}/> Save customer</button></div>
    </form></section>
    <section className="panel table-wrap"><table><thead><tr><th>Company</th><th>Contact</th><th>Phone</th><th>Email</th><th>Terms</th><th></th></tr></thead>
      <tbody>{customers.map(c=><tr key={c.id}><td>{c.company}</td><td>{c.contact_name}</td><td>{c.phone}</td><td>{c.email}</td><td>{c.payment_terms} days</td><td><button className="icon danger" onClick={()=>remove(c.id)}><Trash2 size={16}/></button></td></tr>)}</tbody>
    </table></section>
  </>
}

function Jobs({jobs, customers, reload}) {
  const blank={customer_id:'',contact_name:'',customer_email:'',collection_date:'',collection_time:'',collection_address:'',delivery_address:'',vehicle:vehicles[3],goods_description:'',miles:0,base_price:0,extras:0,costs:0,job_status:'Enquiry',quote_status:'Draft',invoice_status:'Not Invoiced',invoice_date:'',amount_paid:0,paid_date:'',pod_notes:''}
  const [form,setForm]=useState(blank)
  const [editId,setEditId]=useState(null)
  function chooseCustomer(id){
    const c=customers.find(x=>x.id===id)
    setForm({...form,customer_id:id,contact_name:c?.contact_name||'',customer_email:c?.email||''})
  }
  async function save(e){
    e.preventDefault()
    const payload={...form,total_price:Number(form.base_price)+Number(form.extras)}
    if(editId) await supabase.from('jobs').update(payload).eq('id',editId)
    else await supabase.from('jobs').insert(payload)
    setForm(blank);setEditId(null);reload()
  }
  function edit(j){setForm({...blank,...j});setEditId(j.id);window.scrollTo({top:0,behavior:'smooth'})}
  async function remove(id){if(confirm('Delete this job?')){await supabase.from('jobs').delete().eq('id',id);reload()}}
  return <><PageTitle title="Jobs" subtitle="Enter each job once and track it from quote to payment"/>
    <section className="panel"><h2>{editId?'Edit job':'New job'}</h2><form onSubmit={save} className="form-grid">
      <label>Customer<select value={form.customer_id} onChange={e=>chooseCustomer(e.target.value)} required><option value="">Select customer</option>{customers.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</select></label>
      <Field label="Contact name" value={form.contact_name} onChange={v=>setForm({...form,contact_name:v})}/>
      <Field label="Customer email" type="email" value={form.customer_email} onChange={v=>setForm({...form,customer_email:v})}/>
      <Field label="Collection date" type="date" value={form.collection_date} onChange={v=>setForm({...form,collection_date:v})}/>
      <Field label="Collection time" type="time" value={form.collection_time} onChange={v=>setForm({...form,collection_time:v})}/>
      <SelectField label="Vehicle" value={form.vehicle} options={vehicles} onChange={v=>setForm({...form,vehicle:v})}/>
      <Field label="Collection address" textarea value={form.collection_address} onChange={v=>setForm({...form,collection_address:v})}/>
      <Field label="Delivery address" textarea value={form.delivery_address} onChange={v=>setForm({...form,delivery_address:v})}/>
      <Field label="Goods / description" textarea value={form.goods_description} onChange={v=>setForm({...form,goods_description:v})}/>
      <Field label="POD / notes" textarea value={form.pod_notes} onChange={v=>setForm({...form,pod_notes:v})}/>
      <Field label="Miles" type="number" value={form.miles} onChange={v=>setForm({...form,miles:+v})}/>
      <Field label="Base price (£)" type="number" step="0.01" value={form.base_price} onChange={v=>setForm({...form,base_price:+v})}/>
      <Field label="Extras (£)" type="number" step="0.01" value={form.extras} onChange={v=>setForm({...form,extras:+v})}/>
      <Field label="Costs (£)" type="number" step="0.01" value={form.costs} onChange={v=>setForm({...form,costs:+v})}/>
      <SelectField label="Job status" value={form.job_status} options={jobStatuses} onChange={v=>setForm({...form,job_status:v})}/>
      <SelectField label="Quote status" value={form.quote_status} options={quoteStatuses} onChange={v=>setForm({...form,quote_status:v})}/>
      <SelectField label="Invoice status" value={form.invoice_status} options={invoiceStatuses} onChange={v=>setForm({...form,invoice_status:v})}/>
      <Field label="Invoice date" type="date" value={form.invoice_date||''} onChange={v=>setForm({...form,invoice_date:v})}/>
      <Field label="Amount paid (£)" type="number" step="0.01" value={form.amount_paid} onChange={v=>setForm({...form,amount_paid:+v})}/>
      <Field label="Paid date" type="date" value={form.paid_date||''} onChange={v=>setForm({...form,paid_date:v})}/>
      <div className="full actions"><button className="primary"><Save size={17}/> {editId?'Update job':'Save job'}</button>{editId&&<button type="button" className="secondary" onClick={()=>{setEditId(null);setForm(blank)}}>Cancel</button>}</div>
    </form></section>
    <section className="panel"><JobTable jobs={jobs} customers={customers} edit={edit} remove={remove}/></section>
  </>
}

function JobTable({jobs, customers=[], edit, remove, compact=false}) {
  return <div className="table-wrap"><table><thead><tr><th>Job No</th><th>Customer</th><th>Date</th><th>Vehicle</th><th>Total</th><th>Status</th><th>Outstanding</th>{!compact&&<th></th>}</tr></thead>
  <tbody>{jobs.map(j=>{const c=customers.find(x=>x.id===j.customer_id);const out=Number(j.total_price||0)-Number(j.amount_paid||0);return <tr key={j.id}>
    <td>{j.job_number}</td><td>{c?.company||'—'}</td><td>{fmtDate(j.collection_date)}</td><td>{j.vehicle}</td><td>{money(j.total_price)}</td><td><span className={'badge '+String(j.job_status).toLowerCase().replaceAll(' ','-')}>{j.job_status}</span></td><td>{money(out)}</td>
    {!compact&&<td className="row-actions"><button className="icon" onClick={()=>edit(j)}><Pencil size={16}/></button><button className="icon danger" onClick={()=>remove(j.id)}><Trash2 size={16}/></button></td>}</tr>})}</tbody></table></div>
}

function Documents({mode,jobs,settings}) {
  const [id,setId]=useState('')
  const job=jobs.find(j=>j.id===id)
  function createPDF(){
    if(!job)return
    const doc=new jsPDF()
    const type=mode==='quote'?'QUOTATION':'INVOICE'
    const number=(mode==='quote'?'Q-':'INV-')+(job.job_number||'').replace('KLS-','')
    doc.setFontSize(22);doc.text(settings.trading_name||'KLS SameDay',14,18)
    doc.setFontSize(10);doc.text(settings.legal_name||'',14,25);doc.text(`${settings.phone||''}  ${settings.email||''}`,14,31)
    doc.setFontSize(22);doc.text(type,196,18,{align:'right'})
    doc.setFontSize(11);doc.text(number,196,26,{align:'right'})
    autoTable(doc,{startY:40,head:[['Service details','']],body:[
      ['Collection',job.collection_address||''],['Delivery',job.delivery_address||''],['Date / Time',`${fmtDate(job.collection_date)} ${job.collection_time||''}`],
      ['Vehicle',job.vehicle||''],['Goods',job.goods_description||''],['Mileage',String(job.miles||0)]
    ],theme:'grid',headStyles:{fillColor:[17,17,17]}})
    const y=doc.lastAutoTable.finalY+14
    doc.setFontSize(16);doc.text(`${mode==='quote'?'Quoted price':'Total due'}: ${money(Number(job.total_price||0)-Number(mode==='invoice'?job.amount_paid||0:0))}`,196,y,{align:'right'})
    doc.setFontSize(9)
    const footer=mode==='quote'
      ?'Dedicated vehicle quotation, subject to availability. Waiting time, additional stops or changes may be charged separately. Not VAT Registered.'
      :`Bank: ${settings.bank_name||''}   Sort code: ${settings.sort_code||''}   Account: ${settings.account_number||''}
Please use the invoice number as the payment reference. Not VAT Registered.`
    doc.text(doc.splitTextToSize(footer,180),14,y+16)
    doc.save(`${number}.pdf`)
  }
  return <><PageTitle title={mode==='quote'?'Quotes':'Invoices'} subtitle="Select a job and create a professional PDF"/>
    <section className="panel document-picker"><label>Select job<select value={id} onChange={e=>setId(e.target.value)}><option value="">Choose a job</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.job_number} — {j.collection_address} to {j.delivery_address}</option>)}</select></label>
    <button className="primary" disabled={!job} onClick={createPDF}><Download size={17}/> Download PDF</button></section>
    {job&&<section className="paper"><div className="paper-head"><div><h1>{settings.trading_name}</h1><p>{settings.legal_name}<br/>{settings.phone}<br/>{settings.email}</p></div><h1>{mode==='quote'?'QUOTATION':'INVOICE'}</h1></div>
      <div className="details"><p><b>Collection:</b> {job.collection_address}</p><p><b>Delivery:</b> {job.delivery_address}</p><p><b>Vehicle:</b> {job.vehicle}</p><p><b>Goods:</b> {job.goods_description}</p></div>
      <div className="doc-total">{mode==='quote'?'Quoted price':'Total due'}: {money(Number(job.total_price||0)-Number(mode==='invoice'?job.amount_paid||0:0))}</div>
    </section>}
  </>
}

function SettingsPage({settings,setSettings}) {
  const [form,setForm]=useState(settings)
  useEffect(()=>setForm(settings),[settings])
  async function save(e){
    e.preventDefault()
    const payload={...form}
    if(settings.id) await supabase.from('business_settings').update(payload).eq('id',settings.id)
    else await supabase.from('business_settings').insert(payload)
    const {data}=await supabase.from('business_settings').select('*').limit(1).single()
    setSettings(data)
    alert('Settings saved')
  }
  return <><PageTitle title="Settings" subtitle="Business, contact and payment information"/>
    <section className="panel"><form onSubmit={save} className="form-grid">
      {[
        ['Trading name','trading_name'],['Legal name','legal_name'],['Telephone','phone'],['WhatsApp','whatsapp'],
        ['Email','email'],['Website','website'],['Address / area','address_line'],['Bank name','bank_name'],
        ['Sort code','sort_code'],['Account number','account_number']
      ].map(([label,key])=><Field key={key} label={label} value={form[key]||''} onChange={v=>setForm({...form,[key]:v})}/>)}
      <Field label="Default payment terms (days)" type="number" value={form.default_terms||7} onChange={v=>setForm({...form,default_terms:+v})}/>
      <div className="full"><button className="primary"><Save size={17}/> Save settings</button></div>
    </form></section>
  </>
}

function PageTitle({title,subtitle}) {return <div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div></div>}
function Field({label,value,onChange,type='text',textarea=false,required=false,step}) {
  return <label>{label}{textarea?<textarea value={value??''} onChange={e=>onChange(e.target.value)} required={required}/>:<input type={type} step={step} value={value??''} onChange={e=>onChange(e.target.value)} required={required}/>}</label>
}
function SelectField({label,value,options,onChange}) {return <label>{label}<select value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={o}>{o}</option>)}</select></label>}

createRoot(document.getElementById('root')).render(<App />)
