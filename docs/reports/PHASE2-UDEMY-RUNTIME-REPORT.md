# Relatório da Fase 2 — runtime da Udemy

**Projeto:** S·IA — Audio-learning by UXBRAS®  
**Data:** 21 de agosto de 2026  
**Fase:** 2 do plano Udemy  
**Status:** investigação concluída; implementação de produção não autorizada

## 1. Objetivo

A Fase 2 teve como objetivo descobrir quais sinais técnicos a Udemy expõe em runtime para vídeo, legendas, transcrição e ciclo de vida do player. O trabalho foi executado com um probe temporário, isolado da extensão oficial, e com uma fixture local determinística.

O probe não importou nem executou `sync-engine.js`, `piper-bridge.js` ou qualquer componente da extensão oficial. Também não chamou `speechSynthesis`, Piper, fila de áudio ou qualquer inferência. A extensão oficial permaneceu sem alterações.

## 2. Protocolo executado

O probe observou passivamente o elemento `<video>`, `textTracks`, marcadores de legenda/transcrição, mutações e eventos de mídia. O texto observado não foi persistido em bruto; o probe reduziu texto a comprimento, número de palavras e hash. O último relatório da sessão foi mantido apenas em `chrome.storage.session` do probe.

Foram observados dois estados reais após o usuário atualizar/reiniciar a aula. A reprodução ocorreu no ambiente do usuário; o probe somente registrou o estado já existente.

## 3. Evidência real

A primeira captura mostrou:

| Métrica | Valor |
|---|---:|
| Vídeo | `lecture-65933227` |
| Player | `shaka-video-container-65933227` |
| `readyState` | `4` |
| `paused` | `false` |
| Tempo | `20.052 s` |
| Duração | `114.267 s` |
| Velocidade | `1` |
| Tracks detectadas | `[]` |
| Marcadores de legenda | `6` |
| Marcadores de transcrição | `2` |
| Eventos | `66` |
| Mutações | `120` — teto do probe |
| Reconstruções | `0` |
| Confiança da fonte | `unknown` |

A legenda estava visível no vídeo enquanto `tracks` permanecia vazio. Essa combinação descarta, para esse instante, a suposição de que o texto necessariamente esteja disponível como `TextTrack` acessível ao content script.

A segunda captura, após atualização e reinício da aula, mostrou:

| Métrica | Valor |
|---|---:|
| Vídeo | `lecture-66055087` |
| Player | `shaka-video-container-66055087` |
| `readyState` | `4` |
| `paused` | `false` |
| Tempo | `57.567 s` |
| Duração | `121.267 s` |
| Velocidade | `1` |
| Tracks detectadas | `[]` |
| Marcadores de legenda | `6` |
| Marcadores de transcrição | `2` |
| Eventos | `120` — teto do probe |
| Mutações | `120` — teto do probe |
| Reconstruções | `1` |
| Confiança da fonte | `unknown` |

O usuário informou que, ao pausar o vídeo, os números do popup pararam de se alterar. Esse comportamento é consistente com o acompanhamento passivo do estado e dos eventos do elemento `<video>`.

## 4. Comparação das fontes

| Fonte | Resultado | Classificação atual |
|---|---|---|
| `HTMLMediaElement.textTracks` | Lista vazia nas duas capturas reais | Não confirmada como fonte principal |
| `<track>` no HTML inicial | Não materializado no HTML salvo | Não assumir |
| Legenda visual | Presente no vídeo; seis marcadores DOM | Candidato a fallback, ainda sem tempo validado |
| Transcrição | Dois marcadores e controle presente | Candidato alternativo, ainda sem correlação temporal |
| Eventos de mídia | Contadores variaram; pausa interrompeu mudanças | Fonte válida para estado, não para texto |
| Identidade do player | Mudou após reinício; rebuild detectado | Requer reconexão idempotente |

A conclusão não é que a Udemy não possua tracks internamente. A conclusão é mais precisa: **não houve `TextTrack` acessível ao probe nas duas capturas reais realizadas**. A plataforma pode carregar dados dinamicamente, utilizar outra camada ou condicionar a exposição ao estado do player.

## 5. Diagnóstico seguro

A evidência indica que a legenda pode estar visível antes de existir uma fonte temporal confiável para a extensão. Portanto, o adaptador futuro deverá distinguir presença visual de disponibilidade segura para fala.

O diagnóstico recomendado para o estado observado é:

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

A existência de legenda visual não deverá, por si só, iniciar o motor neural nem a voz nativa. A fala só poderá ser liberada depois de uma correlação repetível entre texto, tempo de início e tempo de fim.

## 6. Consequências para o adaptador

O adaptador deverá ser um tradutor de eventos e não um segundo motor de áudio. Ele poderá localizar o player, observar a fonte candidata, normalizar uma cue validada e emitir diagnóstico. Ele não poderá criar fila própria, chamar Piper, controlar `speechSynthesis`, ajustar velocidade ou alterar o comportamento do Coursera.

A identidade fixa `lecture-...` ou `shaka-video-container-...` não deverá ser codificada como valor permanente. O adaptador precisará observar a identidade atual, destruir listeners antigos, instalar listeners uma única vez e impedir que uma cue antiga atravesse a troca de player.

Os sinais provisórios a serem considerados em implementação futura são:

```text
SIA_PLATFORM_DETECTED
SIA_PLAYER_FOUND
SIA_CAPTION_SOURCE_READY
SIA_CAPTION_CHANGED
SIA_CUE_COMPLETED
SIA_ADAPTER_FALLBACK
SIA_ADAPTER_ERROR
SIA_PLATFORM_LEFT
```

Nenhum desses eventos foi adicionado à extensão oficial nesta fase.

## 7. Fixture e validação do probe

A fixture local incluiu vídeo, track WebVTT, marcadores de legenda, marcador de transcrição e mutações controladas. O probe foi executado em Chromium headless e detectou corretamente o elemento de vídeo, o contêiner do player, a track da fixture, os marcadores e as mutações. A execução confirmou o isolamento do probe e a ausência de referências proibidas à extensão oficial.

Essa validação demonstra que o probe consegue observar uma fonte `TextTrack` quando ela está materializada, mas que o runtime real observado da Udemy apresentou uma situação diferente, com legenda visual e lista de tracks vazia.

## 8. Regressão do núcleo protegido

A regressão do código funcional Coursera permaneceu em **20 testes aprovados e 0 falhas**. O validador da cópia organizada retornou:

```text
REPOSITORY_CHECK_OK
version=1.8.5
sync-engine-sha256=8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a
protected-architecture=ok
```

A árvore `extension/` permaneceu limpa no Git local. O probe não foi misturado ao diretório da extensão oficial.

## 9. Limitações e pendências

A Fase 2 não confirmou a origem técnica definitiva da legenda, não mediu correlação de cue com timestamp, não validou a linha ativa da transcrição e não testou troca deliberada entre duas aulas. A contagem de mutações e eventos possui teto e não deve ser interpretada como medida absoluta.

Para uma decisão de implementação, ainda será necessário um protocolo específico para capturar duas ou mais mudanças de cue anonimizadas, correlacionar o tempo do vídeo e verificar se a troca de aula remove observers sem duplicação. Esse protocolo deverá preservar o estado `UNSAFE_TO_SPEAK` até a fonte atingir confiança mínima.

## 10. Decisão e gate seguinte

A Fase 2 confirmou a viabilidade de observar a Udemy e produziu uma direção técnica clara: tratar a legenda DOM como candidato a fallback, manter `TextTrack` como fonte não confirmada e separar rigorosamente falha de legenda de falha de áudio.

A Fase 2 **não autoriza a implementação do adaptador de produção**. A próxima implementação somente poderá começar depois de uma nova aprovação explícita, com escopo limitado ao contrato aprovado, nova regressão Coursera e rollback preparado.

> **Resultado final:** o caminho é tecnicamente promissor, mas a fonte da cue ainda não possui confiança suficiente para falar automaticamente. A decisão correta neste momento é preservar o núcleo e não integrar código experimental à extensão oficial.

## Referências

- [Protocolo experimental da Fase 2](../experiments/PHASE2-RUNTIME-PROTOCOL.md)
- [Comparação de fontes e ciclo de vida](../experiments/PHASE2-SOURCE-COMPARISON.md)
- [Relatório de observação da Fase 1](PHASE1-UDEMY-OBSERVATION.md)
- [Especificação do adaptador Udemy](../architecture/UDEMY-ADAPTER-DESIGN.md)
- [Pesquisa oficial inicial da Udemy](../research/UDEMY-OFFICIAL-RESEARCH.md)
