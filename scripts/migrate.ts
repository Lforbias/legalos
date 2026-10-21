import "./load-env";
import { runMigrations } from "../src/lib/db/migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}
runMigrations(url, undefined, (m) => console.log(m))
  .then((applied) => console.log(applied.length ? `${applied.length} migration(s) aplicada(s).` : "Banco já atualizado."))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
