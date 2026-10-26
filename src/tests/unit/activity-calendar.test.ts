import {describe,it,expect} from "vitest";
import {recurrenceDates} from "@/lib/activities/recurrence";
import {activityOffset} from "@/lib/activities/offset";
describe("Calendário operacional",()=>{
 it("mantém a âncora mensal e trata anos bissextos",()=>{
  expect(recurrenceDates("2027-01-31",{frequency:"MONTHLY",until:"2027-03-31"})).toEqual(["2027-01-31","2027-02-28","2027-03-31"]);
  expect(recurrenceDates("2024-02-29",{frequency:"YEARLY",until:"2026-02-28"})).toEqual(["2024-02-29","2025-02-28","2026-02-28"]);
 });
 it("limita séries e exclui fins de semana no modo dias de semana",()=>{
  expect(recurrenceDates("2026-10-23",{frequency:"WEEKDAYS",until:"2026-10-27"})).toEqual(["2026-10-23","2026-10-26","2026-10-27"]);
  expect(()=>recurrenceDates("2026-01-01",{frequency:"DAILY",until:"2026-12-31"})).toThrow(/120/);
  expect(()=>recurrenceDates("2026-01-01",{frequency:"MONTHLY",until:"2029-01-01"})).toThrow(/dois anos/);
  expect(()=>recurrenceDates("2026-02-30",{frequency:"MONTHLY",until:"2026-03-31"})).toThrow();
 });
 it("conta deslocamentos positivos, negativos e exceções sem recesso processual",()=>{
  expect(activityOffset("2026-10-23",1,"BUSINESS",["2026-10-26"])).toBe("2026-10-27");
  expect(activityOffset("2026-10-26",-1,"BUSINESS")).toBe("2026-10-23");
  expect(activityOffset("2026-12-24",1,"BUSINESS")).toBe("2026-12-28");
  expect(activityOffset("2026-10-23",1,"CALENDAR")).toBe("2026-10-24");
  expect(activityOffset("2026-10-24",0,"BUSINESS")).toBe("2026-10-24");
 });
});
