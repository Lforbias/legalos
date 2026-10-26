"use client";
import { useState } from "react";
import Link from "next/link";
import type { CalcResult } from "@/lib/calc/num";
import { send } from "../../_forms";
export default function Calculator({
  tool,
  logged,
}: {
  tool: "prazos" | "rescisao";
  logged: boolean;
}) {
  const [result, setResult] = useState<CalcResult | null>(null),
    [input, setInput] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  return (
    <>
      <form
        className="aud-card"
        onChange={() => {
          setResult(null);
          setInput(null);
          setMsg("");
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setMsg("");
          try {
            const i = {
              ...Object.fromEntries(new FormData(e.currentTarget)),
              tool,
            };
            const r = await send("calculate", i);
            setResult(r.result);
            setInput(i);
          } catch (e) {
            setMsg((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 style={{ marginTop: 0 }}>Dados do cálculo</h2>
        {tool === "prazos" ? (
          <>
            <label>
              Data inicial (não será contada)
              <input
                className="aud-input"
                type="date"
                name="startDate"
                min="2000-01-01"
                max="2099-12-31"
                required
              />
            </label>
            <div className="aud-columns">
              <label>
                Quantidade de dias
                <input
                  className="aud-input"
                  type="number"
                  name="days"
                  min={1}
                  max={365}
                  defaultValue={15}
                  required
                />
              </label>
              <label>
                Contagem
                <select className="aud-input" name="countType">
                  <option value="BUSINESS">Dias úteis</option>
                  <option value="CALENDAR">Dias corridos</option>
                </select>
              </label>
            </div>
            <p className="aud-muted">
              Você escolhe o prazo e a forma de contagem. A ferramenta não
              determina o prazo legal aplicável ao caso.
            </p>
          </>
        ) : (
          <>
            <div className="aud-columns">
              <label>
                Admissão
                <input
                  className="aud-input"
                  type="date"
                  name="admissao"
                  min="2000-01-01"
                  max="2099-12-31"
                  required
                />
              </label>
              <label>
                Desligamento
                <input
                  className="aud-input"
                  type="date"
                  name="demissao"
                  min="2000-01-01"
                  max="2099-12-31"
                  required
                />
              </label>
            </div>
            <label>
              Salário bruto (R$)
              <input
                className="aud-input"
                name="salario"
                inputMode="decimal"
                pattern="[0-9]{1,8}([.,][0-9]{1,2})?"
                placeholder="3500,00"
                required
              />
            </label>
            <label>
              Modalidade
              <select className="aud-input" name="tipo">
                <option value="SEM_JUSTA_CAUSA">
                  Dispensa sem justa causa
                </option>
                <option value="JUSTA_CAUSA">Dispensa por justa causa</option>
                <option value="PEDIDO_DEMISSAO">Pedido de demissão</option>
                <option value="ACORDO">Acordo</option>
              </select>
            </label>
            <label>
              Períodos completos de férias não gozadas
              <input
                className="aud-input"
                type="number"
                min={0}
                max={30}
                name="feriasVencidas"
                defaultValue={0}
              />
            </label>
            <p className="aud-muted">
              Estimativa bruta. FGTS estimado, sem INSS/IRRF, horas extras,
              adicionais ou projeção de aviso prévio. Confira com o cálculo
              oficial.
            </p>
          </>
        )}
        <button className="aud-btn primary" disabled={busy}>
          {busy ? "Calculando…" : "Calcular gratuitamente"}
        </button>
      </form>
      {msg && (
        <p role="alert" className="aud-feedback error">
          {msg}
        </p>
      )}
      {result && (
        <section className="aud-card" aria-live="polite">
          <span className="aud-tag">Resultado auxiliar</span>
          <h2>{result.title}</h2>
          <dl>
            {result.summary.map(([k, v]) => (
              <div
                className="aud-row"
                key={k}
                style={{ borderBottom: "1px solid #e0e5ef", padding: "10px 0" }}
              >
                <dt>{k}</dt>
                <dd>
                  <b>{v}</b>
                </dd>
              </div>
            ))}
          </dl>
          <div className="aud-card warning" style={{ marginTop: 24 }}>
            {result.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
          <details>
            <summary>Memória e critérios do cálculo</summary>
            {result.criteria.map((c) => (
              <p className="aud-muted" key={c}>
                {c}
              </p>
            ))}
            {result.sections.map((s) => (
              <div key={s.title}>
                <h3>{s.title}</h3>
                <div className="aud-scroll">
                  <table>
                    <thead>
                      <tr>
                        {s.columns.map((c) => (
                          <th key={c}>{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {s.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j}>{c}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </details>
          <div className="aud-actions">
            {logged ? (
              <button
                className="aud-btn primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await send("save", input);
                    window.location.assign(r.url);
                  } catch (e) {
                    setMsg((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Salvar resultado e acessar PDF
              </button>
            ) : (
              <Link
                className="aud-btn primary"
                href="/acesso?origem=ferramenta"
              >
                Entrar para salvar e baixar PDF
              </Link>
            )}
            <Link href="/comunidade" className="aud-link">
              Tirar uma dúvida →
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
