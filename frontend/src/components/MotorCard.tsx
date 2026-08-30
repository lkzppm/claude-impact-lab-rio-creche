import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getMotor, rodarCicloMotor } from "../api/client";
import type { MotorCiclo } from "../api/types";
import { Card, Pill, Button, StatTile, Spinner, ErrorBox, fmtInt, fmtDateTime, fmtHoras } from "../design-system";

function haQuanto(iso?: string | null): string {
  if (!iso) return "nunca";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `há ${Math.round(s)}s`;
  if (s < 3600) return `há ${Math.round(s / 60)} min`;
  return `há ${fmtHoras(s / 3600)}`;
}

function emQuanto(iso?: string | null): string {
  if (!iso) return "—";
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (s <= 0) return "agora";
  if (s < 60) return `em ${Math.round(s)}s`;
  return `em ${Math.round(s / 60)} min`;
}

/** O que o motor fez no último ciclo, em uma frase. */
export function resumoCiclo(c?: MotorCiclo | null): string {
  if (!c) return "ainda não rodou nesta sessão";
  if (c.erro) return `falhou: ${c.erro}`;
  const partes: string[] = [];
  if (c.rodada_criada) partes.push(`classificou a rede (rodada #${c.rodada_id}${c.motivo_rodada === "entrada_mudou" ? ", porque a entrada mudou" : ""})`);
  if (c.convocacoes_criadas) partes.push(`gerou ${fmtInt(c.convocacoes_criadas)} convocação(ões)`);
  if (c.expiradas) partes.push(`registrou ${fmtInt(c.expiradas)} prazo(s) vencido(s)`);
  if (c.repassadas) partes.push(`repassou ${fmtInt(c.repassadas)} vaga(s) ao próximo da fila`);
  if (!partes.length) return `nada mudou (${c.duracao_ms} ms)`;
  return partes.join(" · ");
}

/** Estado do motor contínuo. `compacto` = linha única para o painel da CRE. */
export default function MotorCard({ compacto = false, base = "" }: { compacto?: boolean; base?: string }) {
  const qc = useQueryClient();
  const motor = useQuery({ queryKey: ["motor"], queryFn: getMotor, refetchInterval: 15_000 });
  const ciclo = useMutation({
    mutationFn: rodarCicloMotor,
    onSuccess: () => {
      for (const k of ["motor", "painel-resumo", "painel-unidades", "painel-cres", "convocacoes", "mapa"]) {
        qc.invalidateQueries({ queryKey: [k] });
      }
    },
  });

  const m = motor.data;
  const ligado = !!m?.ligado;
  const estado = <Pill tone={ligado ? "ok" : "warn"}>{ligado ? "Rodando" : "Parado"}</Pill>;

  if (compacto) {
    return (
      <p className="text-sm muted">
        <span className="row" style={{ gap: 8, display: "inline-flex", alignItems: "center" }}>
          {estado}
          <span>
            Motor de classificação {ligado ? `roda a cada ${m!.intervalo_s}s` : "desligado"} · última passada{" "}
            {haQuanto(m?.ultima_execucao)} · já repassou <strong>{fmtInt(m?.total_repassadas ?? 0)}</strong> vaga(s) liberada(s)
            para o próximo da fila, sem ninguém clicar.
          </span>
        </span>
      </p>
    );
  }

  return (
    <Card
      title="Motor de classificação"
      secao={base === "/sme" ? "sme.motor" : "cre.motor"}
      actions={
        <span className="row" style={{ gap: 8, alignItems: "center" }}>
          {estado}
          <Button variant="secondary" size="sm" onClick={() => ciclo.mutate()} disabled={ciclo.isPending}>
            {ciclo.isPending ? "Rodando…" : "Rodar um ciclo agora"}
          </Button>
        </span>
      }
    >
      {motor.isLoading && <Spinner label="Consultando o motor…" />}
      {motor.isError && <ErrorBox error={motor.error} />}
      {m && (
        <>
          <p className="text-sm muted" style={{ marginBottom: 12 }}>
            A classificação não é mais um evento de calendário: o motor roda{" "}
            {ligado ? <>a cada <strong>{m.intervalo_s}s</strong></> : "sob demanda"} e faz sozinho o que hoje depende de alguém
            lembrar — reclassifica quando entra inscrição ou vaga nova, gera as convocações e repassa cada vaga devolvida
            (recusa, prazo vencido, confirmação em outra unidade) para o próximo da fila daquela unidade. Mesma régua da
            resolução, Deferred Acceptance, sem IA no núcleo.
          </p>
          <div className="grid-tiles">
            <StatTile
              label="Última passada"
              value={haQuanto(m.ultima_execucao)}
              tone="neutral"
              hint={ligado ? `próxima ${emQuanto(m.proxima_execucao)} · ${fmtInt(m.ciclos)} ciclo(s)` : `${fmtInt(m.ciclos)} ciclo(s)`}
            />
            <StatTile label="Vagas repassadas" value={fmtInt(m.total_repassadas)} tone="ok" hint="devolvidas à fila e reconvocadas pelo motor" />
            <StatTile label="Convocações geradas" value={fmtInt(m.total_convocacoes)} tone="info" hint={`${fmtInt(m.total_rodadas)} classificação(ões) rodada(s)`} />
            <StatTile
              label="Vagas à espera de fila"
              value={fmtInt(m.vagas_liberadas_pendentes)}
              tone={m.vagas_liberadas_pendentes > 0 ? "warn" : "ok"}
              hint="liberadas sem ninguém elegível na lista de espera da unidade"
            />
          </div>
          <p className="text-sm" style={{ marginTop: 12 }}>
            <strong>No último ciclo:</strong> {resumoCiclo(m.ultimo_ciclo)}
            {m.ultimo_ciclo && <span className="muted"> · {fmtDateTime(m.ultimo_ciclo.em)}</span>}
          </p>
          {m.rodada_vigente && (
            <p className="text-sm" style={{ marginTop: 4 }}>
              Classificação vigente:{" "}
              <Link to={`${base}/classificacao/${m.rodada_vigente.id}`}>
                #{m.rodada_vigente.id} · {m.rodada_vigente.ano}
              </Link>{" "}
              <span className="muted">
                ({m.rodada_vigente.parametros?.vagas_presas ?? 3} reserva(s) + {m.rodada_vigente.parametros?.alternativas ?? 2} alternativa(s) por criança)
              </span>
            </p>
          )}
          {!ligado && (
            <p className="text-sm muted" style={{ marginTop: 8 }}>
              A rotina de fundo está desligada (<code>MOTOR_INTERVALO_SEGUNDOS=0</code>). O ciclo continua disponível no botão acima.
            </p>
          )}
          {m.ultimo_erro && (
            <p className="text-sm" style={{ marginTop: 8, color: "var(--danger)" }}>
              Último erro: {m.ultimo_erro}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
