# Contrato experimental do adaptador Udemy

**Branch:** `experiment/udemy-adapter-contract`
**Status:** implementação experimental isolada
**Escopo aprovado:** contrato de cue, diagnóstico, `UNSAFE_TO_SPEAK`, fallback DOM controlado e ciclo de vida idempotente.

## 1. Limites invioláveis

O adaptador é um tradutor de observações da Udemy. Ele não cria fila de áudio, não chama Piper, não usa `speechSynthesis`, não ajusta velocidade do vídeo, não altera o `sync-engine.js` e não modifica o caminho Coursera.

A integração com o núcleo compartilhado permanece fora desta branch. Os objetos produzidos aqui são dados de diagnóstico e cues que ainda precisam ser aprovadas por uma etapa posterior.

## 2. Estados

| Estado | Significado |
|---|---|
| `IDLE` | Nenhum contexto Udemy reconhecido. |
| `PLATFORM_DETECTED` | URL compatível, player ainda não localizado. |
| `PLAYER_FOUND` | Player localizado, sem fonte de legenda pronta. |
| `WAITING_FOR_CAPTIONS` | Player presente, fonte ainda não encontrada. |
| `PRIMARY_READY` | `TextTrack` com cue temporal validada e alta confiança. |
| `FALLBACK_PROBING` | Fonte alternativa em investigação. |
| `FALLBACK_READY` | Fonte alternativa validada com tempo e alta confiança. |
| `UNSAFE_TO_SPEAK` | Existe texto visual ou transcrição, mas a cue não está segura para fala. |
| `EMITTING_CUE` | Estado descritivo reservado para uma cue já aprovada; não habilita áudio nesta branch. |
| `DESTROYING` | Player ou plataforma deixou o contexto; listeners devem ser removidos. |

## 3. Regra de segurança da cue

Uma cue somente possui `safeToSpeak: true` quando contém texto não vazio, `startTime` e `endTime` finitos e ordenados, fonte reconhecida e confiança `high`. A implementação DOM inicial não produz alta confiança automaticamente.

Uma legenda visível no DOM sem correlação temporal deve produzir `source: "dom-caption"`, `confidence: "low"` ou `"unknown"` e `state: "UNSAFE_TO_SPEAK"`. Esse estado impede a emissão da cue para qualquer motor de fala.

## 4. Fontes

A ordem experimental é:

| Fonte | Tratamento |
|---|---|
| `texttrack` | Principal candidata; somente pronta com cues temporais e confiança alta. |
| `caption-event` | Alternativa ainda não confirmada; nunca falar sem tempo. |
| `transcript` | Candidata; texto sem correlação de tempo permanece inseguro. |
| `dom-caption` | Fallback controlado; inicialmente somente diagnóstico. |
| `none` | Sem fonte utilizável. |

## 5. Eventos normalizados

O contrato define `SIA_PLATFORM_DETECTED`, `SIA_PLAYER_FOUND`, `SIA_CAPTION_SOURCE_READY`, `SIA_CAPTION_CHANGED`, `SIA_CUE_COMPLETED`, `SIA_ADAPTER_FALLBACK`, `SIA_ADAPTER_ERROR` e `SIA_PLATFORM_LEFT`. Nesta fase os eventos são destinados ao adaptador experimental e ao diagnóstico local, não ao núcleo de áudio.

## 6. Idempotência

A identidade do player combina o `id` do vídeo e o identificador do contêiner Shaka. Ao detectar identidade diferente, a implementação deverá destruir listeners da instância anterior, invalidar a cue anterior, localizar o vídeo atual e instalar observers uma única vez. A mesma cue não pode ser emitida repetidamente apenas porque o DOM foi observado várias vezes.

## 7. Gate de integração

A branch somente poderá ser considerada pronta para uma revisão futura quando os testes demonstrarem normalização, rejeição de texto sem tempo, bloqueio de fala em `UNSAFE_TO_SPEAK`, deduplicação, destruição idempotente e ausência de qualquer chamada de áudio. Mesmo então, uma nova aprovação será necessária antes de conectar os eventos ao núcleo S·IA.
