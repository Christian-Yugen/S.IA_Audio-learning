# Correção do congelamento no teste físico do adaptador Udemy

**Status:** corrigido em branch experimental; aguardando revisão explícita antes de qualquer merge.

## Diagnóstico

O congelamento observado no teste físico foi causado por uma realimentação entre o `MutationObserver` do adaptador e o painel roxo de diagnóstico. O adaptador observava o `documentElement` inteiro. Cada evento emitido atualizava o texto do painel; essa atualização gerava uma nova mutação; a nova mutação iniciava outro `scan()` e emitia outro evento. Em uma página Udemy dinâmica, o ciclo podia ocupar o thread principal e produzir o aviso do Chrome de que a página não estava respondendo.

O estado mostrado no painel, `player: "missing"` e `reason: "player-not-found"`, não provava que o player Udemy inexistia. Ele era compatível com a página ter ficado impedida de concluir a montagem do player enquanto o loop de observação consumia o processamento.

## Correção aplicada

A correção foi mantida exclusivamente no adaptador experimental e no pacote temporário de diagnóstico. O observer agora rejeita mutações cujo alvo seja o próprio diagnóstico marcado com `data-sia-diagnostic="true"`, aceita um filtro específico do host quando necessário e agenda as varreduras de forma coalescida com `setTimeout`, em vez de executar uma varredura síncrona a cada evento.

Além disso, eventos de fallback e de disponibilidade da fonte de legenda passaram a ser deduplicados. A troca de identidade do player limpa as chaves de deduplicação, permitindo que uma nova aula seja diagnosticada normalmente. Nenhuma fila de áudio, `speechSynthesis`, Piper, `AudioContext` ou núcleo Coursera foi adicionado ao adaptador.

## Evidências

| Verificação | Resultado |
|---|---:|
| Testes originais do adaptador Udemy | 10/10 aprovados antes da correção |
| Testes do adaptador após a correção | 12/12 aprovados |
| Testes oficiais do núcleo Coursera | 20/20 aprovados |
| Fixture em Chromium headless com mutações contínuas | aprovada |
| Continuidade do script da página durante 3,5 s | confirmada |
| Overlay e diagnóstico na fixture | confirmados |
| Hash protegido de `extension/sync-engine.js` | `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a` |
| PR #18 | aberta, `CLEAN`, sem merge |

## Limites de segurança

Esta correção não autoriza a integração com o núcleo de áudio nem altera o manifesto oficial. O estado `UNSAFE_TO_SPEAK` continua obrigatório para legenda DOM sem tempo confiável. O pacote corrigido permanece apenas um instrumento de diagnóstico e não produz voz.

Antes de um novo teste físico, a versão anterior deve permanecer removida. O novo pacote só deve ser instalado temporariamente, em uma aba de aula Udemy, e removido novamente ao terminar a coleta de evidências.
