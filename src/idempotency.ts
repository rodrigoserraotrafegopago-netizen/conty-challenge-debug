// O provedor reenvia a mesma chave com espaço no fim ou com caractere invisível
// (zero-width space, U+200B). Sem limpar isso, o retry vira uma chave nova e credita de novo.
export function normalizeKey(key: string): string {
  return key.replace(/\p{Cf}/gu, "").trim().toLowerCase();
}
