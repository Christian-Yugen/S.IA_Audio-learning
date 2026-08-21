# Comparação de fontes e ciclo de vida — Fase 2

**Status:** resultado experimental; sem implementação de produção  
**Baseline protegido:** S·IA Coursera 1.8.5

## 1. Resultado resumido

A observação controlada em duas instâncias de aula Udemy mostrou vídeo Shaka em runtime, legenda visual presente, marcadores DOM de legenda/transcrição, eventos de mídia e reconstrução de player. Nas duas capturas, `tracks` permaneceu vazio. Portanto, a fonte `TextTrack` não foi confirmada nesta variante; a superfície DOM é a candidata mais forte para investigação posterior, mas ainda não possui correlação temporal suficiente para ser considerada fonte segura de fala.

> **Decisão provisória:** nenhuma fonte de cue está autorizada para integração de produção. O estado correto do adaptador, diante da legenda visível sem fonte temporal validada, é `UNSAFE_TO_SPEAK` ou equivalente, com diagnóstico explícito.

## 2. Matriz comparativa

| Fonte ou sinal | Evidência observada | Confiança atual | Decisão provisória |
|---|---|---:|---|
| `HTMLMediaElement.textTracks` | `tracks: []` nas duas capturas reais | Baixa | Não usar como fonte principal sem nova evidência. |
| Elemento `<track>` | Não apareceu no HTML inicial nem no relatório de runtime | Baixa | Não assumir materialização estática. |
| Legenda visual no DOM/camada do player | Texto visível no vídeo; `captionMarkers: 6` | Média para presença; baixa para tempo | Candidato a fallback, ainda não falar automaticamente. |
| Marcadores de transcrição | `transcriptMarkers: 2`; controle presente | Média para presença; baixa para cue | Investigar correlação temporal antes de usar. |
| Eventos do vídeo | Contadores variaram; pausa interrompeu alterações | Alta para ciclo de mídia | Usar para estado e diagnóstico, não para obter texto. |
| Identidade do player/vídeo | Mudou após atualização/reinício; `rebuilds: 1` | Alta nesta observação | Reconectar observers de modo idempotente. |
| Velocidade e estado de pausa | `rate: 1`, `paused` acompanhou reprodução | Alta nesta observação | Observar; não alterar o controle. |

## 3. Fonte de cue versus fallback de áudio

A ausência de `TextTrack` é uma questão de **fonte de legenda**. Ela não é uma falha do Piper e não deve disparar fallback de áudio. O futuro diagnóstico deverá distinguir pelo menos:

```text
Fonte de legenda: não confirmada / DOM candidato
Áudio: não iniciado pelo adaptador
Motor neural: não testado nesta fase
Fallback de áudio: não acionado
```

O Piper, a voz nativa, a fila, o pré-carregamento e a sincronização continuam pertencendo ao núcleo S·IA compartilhado. O adaptador Udemy não poderá criar uma fila própria nem chamar qualquer motor de áudio.

## 4. Ciclo de vida

A mudança de `lecture-65933227` para `lecture-66055087`, acompanhada de mudança do contêiner Shaka e `rebuilds: 1`, demonstra que uma nova instância pode surgir depois de atualização/reinício. O adaptador deverá possuir uma sequência de destruição e reconexão:

```text
detectar nova identidade
  → remover listeners do vídeo anterior
  → invalidar referência anterior
  → localizar vídeo atual
  → instalar listeners uma única vez
  → limpar cue antiga
  → publicar diagnóstico atualizado
```

A contagem de mutações atingiu o limite do probe e não deve ser utilizada como métrica absoluta. Ela serve somente para demonstrar atividade dinâmica da página.

## 5. Diagnóstico recomendado

Enquanto não houver correlação temporal validada, o estado recomendado é:

```javascript
{
  platformId: "udemy",
  adapterVersion: "udemy-v0-experimental",
  player: "found",
  source: "dom-caption-candidate",
  confidence: "low",
  reason: "visible-caption-without-confirmed-texttrack",
  state: "UNSAFE_TO_SPEAK",
  userAction: "none"
}
```

Quando uma futura execução comprovar que uma região DOM muda de forma repetível junto com o tempo do vídeo e puder ser deduplicada, ela poderá subir para `FALLBACK_READY`. Até lá, a S·IA não deve falar texto capturado somente por presença visual.

## 6. Critérios que ainda faltam

Ainda é necessário validar, em execução autorizada e controlada:

- se o texto da legenda DOM muda entre cues e se o hash muda com o tempo;
- se há uma relação reproduzível entre texto, início e fim da cue;
- se o painel de transcrição expõe uma linha ativa correlacionável ao vídeo;
- se a troca deliberada entre duas aulas desconecta o vídeo antigo sem observers duplicados;
- se a pausa congela a fonte e o diagnóstico sem produzir emissões duplicadas;
- se cursos ou variantes diferentes expõem outra fonte técnica.

Esses testes pertencem ao contrato do adaptador e não autorizam alteração do núcleo.

## 7. Conclusão

A Fase 2 confirmou a viabilidade de observar a Udemy e descartou, provisoriamente, a suposição de que uma `TextTrack` estará disponível de forma direta. O caminho tecnicamente mais promissor é um adaptador que monitore uma fonte DOM ou transcrição, mas somente após validar tempo, deduplicação e confiança.

A decisão segura é manter a implementação bloqueada até que a fonte de cue tenha contrato mínimo, o estado `UNSAFE_TO_SPEAK` esteja garantido e a regressão Coursera esteja comprovada novamente.
