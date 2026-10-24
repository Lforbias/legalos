import {z} from "zod";
import {addDays,dateToYmd,diffDays,isYmd,weekday} from "@/lib/dates/ymd";
export const recurrenceSchema=z.object({frequency:z.enum(["DAILY","WEEKDAYS","WEEKLY","MONTHLY","YEARLY"]),interval:z.number().int().min(1).max(12).default(1),until:z.string().refine(isYmd)});
export type RecurrenceRule=z.input<typeof recurrenceSchema>;
/** Datas de calendário, ancoradas no dia original (31/jan → 28/fev → 31/mar). */
export function recurrenceDates(start:string,raw:RecurrenceRule):string[]{
 const rule=recurrenceSchema.parse(raw);
 if(!isYmd(start)||rule.until<start||diffDays(rule.until,start)>732) throw new Error("Escolha o término entre a data inicial e os próximos dois anos.");
 const result:string[]=[];const [y,m,d]=start.split("-").map(Number) as [number,number,number];
 let weekdayIndex=0;
 for(let n=0;n<734;n++){
  let date:string;
  if(rule.frequency==="MONTHLY"||rule.frequency==="YEARLY"){
   const offset=n*rule.interval*(rule.frequency==="YEARLY"?12:1);
   const first=new Date(Date.UTC(y,m-1+offset,1));const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
   date=dateToYmd(new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth(),Math.min(d,last))));
  }else date=addDays(start,n*(rule.frequency==="WEEKDAYS"?1:rule.interval)*(rule.frequency==="WEEKLY"?7:1));
  if(date>rule.until) break;
  if(rule.frequency==="WEEKDAYS"){if(weekday(date)===0||weekday(date)===6)continue;if(weekdayIndex++ % rule.interval!==0)continue;}
  result.push(date);if(result.length>120)throw new Error("No máximo 120 ocorrências por série. Reduza o período ou aumente o intervalo.");
 }
 return result;
}
