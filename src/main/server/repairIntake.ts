import {ValidationError} from './products'
import type {DB} from './db'
import {DEFAULT_INTAKE,type IntakeSettings,type IntakeQuestion,type IntakeResponse} from '../../shared/repairIntake'
import type {UnitCategory} from '../../shared/workorders'
export function intakeSettings(db:DB):IntakeSettings{const row=db.prepare("SELECT value FROM settings WHERE key='repair_intake'").get() as {value:string}|undefined;return row?JSON.parse(row.value):JSON.parse(JSON.stringify(DEFAULT_INTAKE))}
export function saveIntakeSettings(db:DB,b:unknown):IntakeSettings{
 if(!b||typeof b!=='object')throw new ValidationError('Enter repair intake questions')
 const result={} as IntakeSettings
 for(const category of ['mower','handheld','other'] as UnitCategory[]){
  const input=(b as any)[category];if(!Array.isArray(input)||input.length>20)throw new ValidationError('Use up to 20 questions per equipment category')
  const used=new Set<string>();result[category]=input.map((q:any):IntakeQuestion=>{
   if(!q||typeof q!=='object'||typeof q.id!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(q.id)||['__proto__','constructor','prototype'].includes(q.id)||used.has(q.id))throw new ValidationError('Each question needs a unique valid ID')
   used.add(q.id);const label=String(q.label??'').trim();if(!label||label.length>300)throw new ValidationError('Question wording must be 1–300 characters')
   if(!['text','yesno','choice'].includes(q.type)||typeof q.required!=='boolean')throw new ValidationError('Choose a valid question type and required setting')
   const choices=q.type==='choice'?q.choices:[];if(!Array.isArray(choices)||choices.length>10||choices.some(v=>typeof v!=='string'||!v.trim()||v.length>100)||new Set(choices.map(v=>v.trim())).size!==choices.length||(q.type==='choice'&&choices.length<2))throw new ValidationError('Multiple choice needs 2–10 different answers, up to 100 characters each')
   return {id:q.id,label,type:q.type,required:q.required,choices:choices.map(v=>v.trim())}
  })
 }
 db.prepare("INSERT INTO settings(key,value) VALUES ('repair_intake',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(result));return result
}
export function intakeAnswers(questions:IntakeQuestion[],input:unknown):Record<string,string>{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new ValidationError('Please answer the repair questions')
 if(Object.keys(input).some(k=>!questions.some(q=>q.id===k)))throw new ValidationError('Unknown intake question. Ask staff to resend the form.')
 const result:Record<string,string>={}
 for(const q of questions){const value=(input as any)[q.id]??'';if(typeof value!=='string'||value.length>2000)throw new ValidationError('Keep each answer under 2,000 characters');const answer=value.trim();if(q.required&&!answer)throw new ValidationError(`Please answer: ${q.label}`);if(answer&&q.type==='yesno'&&!['Yes','No','Not sure'].includes(answer))throw new ValidationError(`Choose an answer for: ${q.label}`);if(answer&&q.type==='choice'&&!q.choices.includes(answer))throw new ValidationError(`Choose an answer for: ${q.label}`);result[q.id]=answer}return result
}
export function workOrderIntakes(db:DB,id:number):IntakeResponse[]{return (db.prepare('SELECT * FROM work_order_intakes WHERE work_order_id=? ORDER BY submitted_at DESC,rowid DESC').all(id) as any[]).map(r=>({id:r.id,category:r.category,unitLabel:r.unit_label,submittedAt:r.submitted_at,questions:JSON.parse(r.questions_json),answers:JSON.parse(r.answers_json)}))}
