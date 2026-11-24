import type {UnitCategory} from './workorders'
export type IntakeQuestion={id:string;label:string;type:'text'|'yesno'|'choice';required:boolean;choices:string[]}
export type IntakeSettings=Record<UnitCategory,IntakeQuestion[]>
export interface IntakeResponse {id:string;category:UnitCategory;unitLabel:string;submittedAt:string;questions:IntakeQuestion[];answers:Record<string,string>}
const question=(id:string,label:string,type:IntakeQuestion['type']='text'):IntakeQuestion=>({id,label,type,required:true,choices:[]})
export const DEFAULT_INTAKE: IntakeSettings={
 mower:[question('starts','Does it start and run?','yesno'),question('cutdrive','Describe any cutting or drive problems.'),question('noiseleaks','Describe any unusual noises or leaks.'),question('when','When did the problem begin?')],
 handheld:[question('starts','Does it start and run?','yesno'),question('stalls','Does it stall or lose power?','yesno'),question('operation','Describe any cutting, feeding or blowing problems.'),question('when','When did the problem begin?')],
 other:[question('problem','Describe the problem with this equipment.'),question('when','When did the problem begin?'),question('other','Is there anything else the mechanic should know?')]
}
