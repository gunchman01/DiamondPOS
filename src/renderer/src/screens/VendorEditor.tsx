import { useEffect, useState } from 'react'
import { EMPTY_VENDOR, type Vendor, type VendorInput, type VendorDetail } from '../../../shared/vendors'
import { api } from '../api'
import { dateTime, money } from '../format'
export default function VendorEditor(props: { vendorId: number | null; onClose: () => void; onSaved: (vendor: Vendor) => void; onReceiving?: (id:number) => void }) {
  const [id,setId]=useState(props.vendorId)
  const [form,setForm]=useState<VendorInput>({...EMPTY_VENDOR})
  const [baseline,setBaseline]=useState(JSON.stringify(EMPTY_VENDOR))
  const [detail,setDetail]=useState<VendorDetail|null>(null)
  const [loading,setLoading]=useState(props.vendorId!==null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  useEffect(() => {
    let live=true
    if(props.vendorId!==null) api.vendor(props.vendorId).then((d)=>{ if(live) {const {id:_,...value}=d.vendor;setForm(value);setBaseline(JSON.stringify(value));setDetail(d);setLoading(false)} }).catch((e)=>{if(live){setError(e.message);setLoading(false)}})
    return()=>{live=false}
  },[props.vendorId])
  const dirty=JSON.stringify(form)!==baseline
  function close(){if(!busy&&(!dirty||confirm('Discard unsaved vendor changes?')))props.onClose()}
  const text=(key:keyof VendorInput)=>({value:String(form[key]),onChange:(e:React.ChangeEvent<HTMLInputElement>)=>setForm({...form,[key]:e.target.value})})
  function field(label:string,key:keyof VendorInput,type='text') { return <label className="vendor-field" key={key}><span>{label}</span><input type={type} maxLength={500} {...text(key)} /></label> }
  async function save(andNew=false){
    if(busy||loading)return
    setBusy(true);setError('');setNotice('')
    try {
      const saved=id===null?await api.createVendor(form):await api.updateVendor(id,form)
      props.onSaved(saved)
      if(andNew){setId(null);setForm({...EMPTY_VENDOR});setBaseline(JSON.stringify(EMPTY_VENDOR));setDetail(null);setNotice(`${saved.companyName} saved. Add the next vendor.`)}
      else props.onClose()
    }catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  return <div className="modal-backdrop vendor-backdrop"><form className="modal vendor-editor" role="dialog" aria-modal="true" aria-label={id===null?'Add Vendor':'Edit Vendor'}
    onSubmit={(e)=>{e.preventDefault();void save()}} onKeyDown={(e)=>{if(e.key==='Escape'){e.stopPropagation();close()}}}>
    <header className="vendor-title"><h2>{id===null?'Add Vendor':'Edit Vendor'}</h2><button type="button" disabled={busy} onClick={close} aria-label="Close vendor">✕</button></header>
    {notice&&<div className="ok-text" role="status">{notice}</div>}{error&&<div className="error-text" role="alert">{error}</div>}
    {loading?<p>Loading vendor…</p>:<fieldset className="vendor-fields" disabled={busy}>
      <section className="vendor-panel vendor-company"><h3>Vendor Info</h3><label>Company Name <span className="req">*</span><input autoFocus required maxLength={500} {...text('companyName')} /></label><span className="muted small">{id===null?'Enter the vendor company name. Existing names are checked to prevent duplicates.':`Vendor V-${String(id).padStart(6,'0')}`}</span></section>
      <div className="vendor-columns">
        <section className="vendor-panel"><h3>Contact Info</h3>
          <label className="vendor-field"><span>Title</span><input list="vendor-titles" {...text('title')}/><datalist id="vendor-titles">{['Mr.','Mrs.','Ms.','Dr.'].map((t)=><option key={t}>{t}</option>)}</datalist></label>
          {field('First','firstName')}{field('Last','lastName')}{field('Email','email','email')}{field('Vendor Web Site','website')}{field('Street','street')}{field('Street 2','street2')}{field('City','city')}{field('State','region')}{field('ZIP','postcode')}{field('Phone','phone')}{field('Mobile','mobile')}
        </section>
        <div className="vendor-middle"><section className="vendor-panel"><h3>Payment Terms</h3>
          <label className="vendor-term">Net due in<input type="number" min="0" max="3650" step="1" value={form.netDays} onChange={(e)=>setForm({...form,netDays:Number(e.target.value)})}/>days</label>
          <label className="vendor-term">Discount percentage<input type="number" min="0" max="100" step="0.01" value={form.discountPercent} onChange={(e)=>setForm({...form,discountPercent:Number(e.target.value)})}/>%</label>
          <label className="vendor-term">Discount if paid within<input type="number" min="0" max="3650" step="1" value={form.discountDays} onChange={(e)=>setForm({...form,discountDays:Number(e.target.value)})}/>days</label>
          <p className="muted small">Reference terms only; no automatic payment or discount is applied.</p>
        </section><section className="vendor-panel"><h3>Vendor Settings</h3>{field('Account #','accountNumber')}{field('Alt. Phone','altPhone')}{field('Alt. Contact','altContact')}
          <label className="check"><input type="checkbox" checked={!form.active} onChange={(e)=>setForm({...form,active:!e.target.checked})}/>Inactive</label>
        </section></div>
        <section className="vendor-panel vendor-notes"><h3>Vendor Notes</h3><textarea aria-label="Vendor notes" value={form.notes} maxLength={4000} onChange={(e)=>setForm({...form,notes:e.target.value})}/></section>
      </div>
      <section className="vendor-panel"><h3>History</h3>{detail?<>
        <p className="muted small">{detail.postedCount} posted receiving(s) · {money(detail.postedTotalCents)} total received. Latest 100 vouchers below.</p>
        <div className="vendor-history"><table className="table"><thead><tr><th>Date</th><th>Receiving voucher</th><th>Invoice #</th><th>Status</th><th className="r">Total</th></tr></thead><tbody>
          {detail.history.map((h)=><tr key={h.id}><td>{dateTime(h.date)}</td><td>{props.onReceiving?<button type="button" className="link" onClick={()=>{if(!dirty||confirm('Discard unsaved vendor changes and open this receiving?'))props.onReceiving!(h.id)}}>{h.number}</button>:h.number}</td><td>{h.invoiceNo}</td><td>{h.status==='posted'?'Received':'Draft'}</td><td className="r">{money(h.totalCents)}</td></tr>)}
        </tbody></table>{!detail.history.length&&<p className="muted">No receiving history yet.</p>}</div>
      </>:<p className="muted">Save this vendor to begin tracking receiving history.</p>}</section>
    </fieldset>}
    <footer className="vendor-footer"><button type="button" disabled={busy||loading} onClick={(e)=>{if(e.currentTarget.form?.reportValidity())void save(true)}}>Save &amp; New</button><div className="row gap"><button type="submit" className="primary" disabled={busy||loading}>{busy?'Saving…':'Save'}</button><button type="button" disabled={busy} onClick={close}>Cancel</button></div></footer>
  </form></div>
}
