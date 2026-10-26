import {can,type TenantContext} from "@/server/context";
import {activityDetails} from "@/server/services/activity-details.service";
import {listActiveMembers} from "@/server/services/members";
import type {ActivityKind} from "@/server/services/activity.service";
import {getActivitySeries} from "@/server/services/activity-series.service";
import {RecurrenceUi} from "./recurrence-ui";
import {ActivityDetailsUi} from "./details-ui";
export async function ActivityDetailsSection({ctx,kind,id}:{ctx:TenantContext;kind:ActivityKind;id:string}){
  const canWrite=kind==="TASK"?can(ctx,"tasks:write"):kind==="DEADLINE"?can(ctx,"deadlines:write"):can(ctx,"deadlines:write")||can(ctx,"tasks:write");
  const [data,members,series]=await Promise.all([activityDetails(ctx,kind,id),canWrite?listActiveMembers(ctx):[],kind!=="DEADLINE"?getActivitySeries(ctx,kind,id):null]);
  return <><ActivityDetailsUi kind={kind} id={id} data={data} members={members} canWrite={canWrite}/>{kind!=="DEADLINE"?<RecurrenceUi kind={kind} id={id} series={series} canWrite={canWrite}/>:null}</>;
}
