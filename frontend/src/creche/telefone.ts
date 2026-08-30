/**
 * Normaliza um telefone no formato brasileiro comum ("(21) 99123-4501") para o E.164 que a
 * mensageria espera como `destino` do canal WhatsApp/SMS (`backend/app/integracoes/mensageria.py`).
 * Mock só tem DDD+número — assume-se Brasil (+55). Devolve `null` se não sobrar dígito suficiente.
 */
export function telefoneParaWhatsapp(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  const semZeroInicial = digitos.replace(/^0+/, "");
  return `+55${semZeroInicial}`;
}
