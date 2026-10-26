import {describe,it,expect,vi,afterEach} from "vitest";
import {parseGroundedSearch,sourceUrl,groundedSearch} from "@/lib/ai/grounded-search";
describe("Pesquisa externa com fontes",()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it("aceita apenas links oficiais e o redirecionador do provedor",()=>{
  expect(sourceUrl("https://www.stj.jus.br/decisao")).toContain("stj.jus.br");
  for(const url of ["javascript:alert(1)","http://www.stj.jus.br/", "https://www.stj.jus.br.evil.test/","https://user:pass@www.stj.jus.br/","https://127.0.0.1/","https://www.stj.jus.br:444/"])expect(sourceUrl(url)).toBeNull();
 });
 it("não promove texto sem suporte ou URLs inventadas a resultado localizado",()=>{
  const r=parseGroundedSearch({candidates:[{content:{parts:[{text:"Processo inventado sem fonte"}]},groundingMetadata:{groundingChunks:[{web:{uri:"https://www.stj.jus.br/fonte",title:"STJ"}},{web:{uri:"javascript:alert(1)"}}],groundingSupports:[{segment:{text:"Síntese apoiada"},groundingChunkIndices:[0,1,99]},{segment:{text:"Sem apoio"},groundingChunkIndices:[1]}]}}]});
  expect(r.passages).toEqual([{text:"Síntese apoiada",sourceIds:[1]}]);expect(r.sources).toHaveLength(1);
  expect(parseGroundedSearch({candidates:[{}]}).passages).toEqual([]);
 });
 it("envia pesquisa com ferramenta de busca e trata erros sem expor credencial",async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({candidates:[]}),{status:200}));vi.stubGlobal("fetch",request);
  await groundedSearch("segredo-de-teste","gemini-2.5-flash","Questão pública");
  const body=JSON.parse(request.mock.calls[0]![1].body);expect(body.tools).toEqual([{google_search:{}}]);expect(body.contents[0].parts[0].text).toContain("Questão pública");
  request.mockResolvedValue(new Response("Erro com informação secreta",{status:403}));await expect(groundedSearch("segredo-de-teste","gemini-2.5-flash","Questão pública")).rejects.toThrow(/recusou/);
 });
});
