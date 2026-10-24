import {describe,it,expect} from "vitest";
import {inboundTransition} from "@/lib/whatsapp/lifecycle";
const at=new Date("2026-10-24T15:00:00Z"),settings={autoStatusEnabled:true,reopenAfterMinutes:30,reassignOnReopen:true};
const conv={status:"CLOSED",serviceStatus:"CLOSED",closedAt:new Date(at.getTime()-30*60000),lastMessageAt:null};
describe("Reabertura de atendimento",()=>{
 it("redistribui no limite de 30 minutos e conserva responsável antes dele",()=>{
  expect(inboundTransition(conv,settings,at).reassign).toBe(true);
  expect(inboundTransition({...conv,closedAt:new Date(at.getTime()-29*60000)},settings,at).reassign).toBe(false);
  expect(inboundTransition(conv,{...settings,reassignOnReopen:false},at).reassign).toBe(false);
 });
 it("não redistribui conversas abertas nem confunde esperar com resolver",()=>{
  expect(inboundTransition({...conv,status:"OPEN",serviceStatus:"WAITING",closedAt:null},settings,at)).toMatchObject({serviceStatus:"IN_SERVICE",reassign:false});
  expect(inboundTransition({...conv,status:"OPEN",serviceStatus:"IN_SERVICE",closedAt:null},settings,at).reassign).toBe(false);
  expect(inboundTransition(conv,{...settings,autoStatusEnabled:false},at)).toMatchObject({status:"OPEN",serviceStatus:"OPEN",reassign:false});
 });
});
