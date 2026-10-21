import "./load-env";
import { checkProductionEnv } from "../src/lib/config/prod-check";

const issues = checkProductionEnv(process.env);
for (const i of issues) console.log(`${i.level === "error" ? "ERRO " : "AVISO"} [${i.code}] ${i.message}`);
const errors = issues.filter((i) => i.level === "error").length;
console.log(errors ? `\n${errors} erro(s) impedem a produção.` : `\nSem erros bloqueantes (${issues.length} aviso(s) para revisar).`);
process.exit(errors ? 1 : 0);
