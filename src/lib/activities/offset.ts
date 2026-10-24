import {addDays,isYmd} from "@/lib/dates/ymd";
import {dayStatus} from "@/lib/deadlines/calculator";
/** Calendário operacional: finais de semana, feriados nacionais e exceções informadas. Não aplica recesso processual. */
export function activityOffset(base:string,days:number,type:string="CALENDAR",nonWorkingDates:string[]=[]):string{
 if(!["CALENDAR","BUSINESS"].includes(type)||nonWorkingDates.some(d=>!isYmd(d))||!isYmd(base)||!Number.isInteger(days)||Math.abs(days)>365)throw new Error("Deslocamento inválido.");
 if(type!=="BUSINESS")return addDays(base,days);
 const excluded=new Set(nonWorkingDates);let result=base,count=0,iterations=0;
 while(count<Math.abs(days)){
  if(++iterations>1500)throw new Error("Calendário sem dias suficientes.");
  result=addDays(result,days<0?-1:1);
  if(dayStatus(result,{applyRecess:false}).business&&!excluded.has(result))count++;
 }
 return result;
}
