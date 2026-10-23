import { XMLParser } from "fast-xml-parser";
import { MNI_SERVICE_NS } from "@/lib/mni/xml";
import { MNI_OPERATIONS } from "./capabilities";
export type ContractInspection = { compatible: boolean; operations: string[]; actions: Record<string, string>; message: string };
/** Inspeção estática; não autentica, não abre intimações e não envia petição. Não segue imports ou endereços do XML. */
export function inspectMniContract(xml: string, endpoint: string): ContractInspection {
  const fail = (message: string): ContractInspection => ({ compatible: false, operations: [], actions: {}, message });
  if (Buffer.byteLength(xml, "utf8") > 2 * 1024 * 1024) return fail("Contrato maior que 2 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) return fail("Contrato contém declarações XML não permitidas.");
  let doc: Record<string, unknown>;
  try { doc = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false, parseTagValue: false }).parse(xml); }
  catch { return fail("O serviço não retornou um WSDL válido."); }
  if (xml.includes("http://schemas.xmlsoap.org/wsdl/soap12/")) return fail("Contratos com SOAP 1.2 exigem seleção de binding específica, ainda não suportada.");
  if (!xml.includes("http://schemas.xmlsoap.org/wsdl/soap/")) return fail("O contrato não declara SOAP 1.1, versão usada pelo adaptador MNI atual.");
  const d = doc?.definitions as Record<string, unknown> | undefined;
  if (!d || d["@_targetNamespace"] !== MNI_SERVICE_NS) return fail("Este contrato não é MNI 2.2.2. MNI 3.0, REST e interfaces proprietárias precisam de adaptador específico.");
  const array = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x : x && typeof x === "object" ? [x] : []).filter(v => v && typeof v === "object");
  const canonical = (raw: string) => {
    const u = new URL(raw); u.hash = "";
    for (const key of [...u.searchParams.keys()]) if (key.toLowerCase() === "wsdl") u.searchParams.delete(key);
    u.searchParams.sort(); return u.href;
  };
  let expected: string;
  try { expected = canonical(endpoint); } catch { return fail("Endpoint inválido."); }
  const local = (raw: unknown) => typeof raw === "string" ? raw.split(":").pop() : "";
  const ports = array(d.service).flatMap(s => array(s.port)).filter(p => array(p.address).some(a => {
    try { return typeof a["@_location"] === "string" && canonical(a["@_location"]) === expected; } catch { return false; }
  }));
  if (!ports.length) return fail("O endereço SOAP do contrato não corresponde ao endpoint cadastrado. Confira o endereço informado pelo tribunal.");
  const declared = new Set<string>();
  const actions: Record<string, string> = {};
  for (const port of ports) {
    const binding = array(d.binding).find(b => b["@_name"] === local(port["@_binding"]));
    if (!binding || !array(binding.binding).some(b => b["@_transport"] === "http://schemas.xmlsoap.org/soap/http" && (!b["@_style"] || b["@_style"] === "document"))) continue;
    const portType = array(d.portType).find(p => p["@_name"] === local(binding["@_type"]));
    const portOperations = new Set(array(portType?.operation).map(o => o["@_name"]));
    for (const operation of array(binding.operation)) {
      const name = operation["@_name"];
      if (typeof name !== "string" || !portOperations.has(name)) continue;
      const action = array(operation.operation)[0]?.["@_soapAction"] ?? "";
      if (typeof action !== "string" || action.length > 500 || /[\x00-\x20\x7f"\\]/.test(action)) return fail("SOAPAction inválido no contrato.");
      if (actions[name] !== undefined && actions[name] !== action) return fail("O contrato declara SOAPActions diferentes para a mesma operação neste endpoint.");
      declared.add(name); actions[name] = action;
    }
  }
  const operations = MNI_OPERATIONS.filter(op => declared.has(op));
  if (!operations.length) return fail("Nenhuma operação MNI suportada está vinculada ao endpoint SOAP 1.1 cadastrado.");
  return { compatible: true, operations: [...operations], actions: Object.fromEntries(operations.map(op => [op, actions[op] ?? ""])), message: "Contrato MNI 2.2.2 compatível. Autenticação, permissões e homologação das operações ainda precisam ser verificadas." };
}
