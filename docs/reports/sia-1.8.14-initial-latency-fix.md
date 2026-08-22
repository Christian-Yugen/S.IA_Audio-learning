# Relatório técnico — redução do atraso inicial na S·IA 1.8.14

## Resultado executivo

A base utilizada continua sendo a **S·IA 1.8.14**, identificada no repositório pelo commit `eba278c`, cuja implementação já havia reduzido a latência neural [1]. O YouTube permaneceu fora do manifesto e fora do pacote.

Foi aplicado um ajuste cirúrgico em três pontos, sem alterar `sync-engine.js`, o Udemy, a fila compartilhada ou a rota nativa:

| Ajuste | Efeito | Escopo |
|---|---|---|
| Pré-cache progressivo durante a cobertura da cue atual | Prepara a próxima frase assim que ela aparece no `TextTrack`, antes de seu início | `content.js` |
| Pré-cache no intervalo anterior à primeira cue | Permite que a primeira frase já esteja sintetizada quando o relógio alcançar seu início | `content.js` |
| Preparação antecipada do `AudioContext` ao ativar Piper | Executa o preparo do áudio em paralelo ao aquecimento do worker | `piper-bridge.js` |
| Encaminhamento de `silenceScale` ao worker offscreen | Garante que a pausa curta da continuação chegue ao motor neural | `offscreen.js` |

O pacote recomendado é `sia-extension-1.8.14-initial-latency-fix.zip`. Ele mantém `version: 1.8.14` para deixar explícito que é uma derivação conservadora da base aprovada; para instalar, a versão antiga deve ser removida/desativada antes de carregar o novo pacote.

## Medição no Chrome conectado

A sessão real do Chrome foi aberta com o usuário Coursera autenticado e a aula `Engenharia de recursos`. A URL inicial informada pelo usuário apontava para `UvWX9K`; o link interno do módulo abriu a aula real em `UwX9K`.

O player real do Coursera foi inspecionado diretamente. A página, os controles e o botão de reprodução carregaram, mas o player permaneceu no indicador visual de carregamento. Mesmo depois do comando de reprodução, o Chrome conectado não disponibilizou tempo de vídeo, cue temporal ou evento de fala observável pelos instrumentos disponíveis. Portanto, não seria correto inventar uma medição do atraso real nessa sessão: o bloqueio observado foi de carregamento do player, não uma falha atribuída ao novo código.

> A limitação do player real foi registrada; o ajuste foi validado em uma fixture local que reproduz `video`, `TextTrack`, cues progressivas e o runtime Piper, sem depender do endpoint do Coursera.

## Causa técnica do atraso residual

A 1.8.14 já pré-carregava a próxima cue apenas depois que uma cue atual era detectada e falada. Esse comportamento funciona quando o Coursera fornece toda a lista futura imediatamente, mas não cobre dois casos comuns: a primeira cue, que não possui uma fala anterior para disparar o pré-cache, e a lista de cues que chega progressivamente enquanto o vídeo já está reproduzindo.

A correção mantém a regra de segurança: nenhuma cue é falada antes do `startTime`. Quando existe uma janela temporal sem cue ativa, o leitor somente chama `primeText()` para a próxima cue temporal. Quando a cue realmente fica ativa, o `speak()` normal utiliza o áudio preparado. O mesmo vale para uma próxima cue que foi adicionada ao `TextTrack` enquanto a fala atual ainda está cobrindo o vídeo.

O atraso residual da primeira fala também tinha uma etapa independente: o worker podia estar pronto, mas o `AudioContext` ainda não preparado. A ativação do Piper agora chama `warmUp()` e `primeAudio()` em paralelo. O `primeAudio()` não gera fala nem cria fila; apenas prepara o contexto de áudio para que a primeira síntese não aguarde essa etapa.

A propriedade `silenceScale` da continuação já era aceita pelo worker Piper, mas estava sendo descartada no `offscreen.js`. O encaminhamento foi corrigido e coberto por teste. Essa correção é necessária para que a pausa curta de uma cue sem pontuação seja efetiva no motor neural real.

## Proteções preservadas

| Área protegida | Verificação |
|---|---|
| `sync-engine.js` | Não modificado; hash preservado em `8c2e9ad28c1c570e44d4c3c42148ada403dec696864b21675aedd2d6d9bef00a` |
| Coursera | Somente `content.js` ganhou o pré-cache e o perfil de pausa; nenhuma mudança de taxa, cancelamento ou fonte de legenda |
| Udemy | Nenhuma alteração de produção no adaptador ou host |
| Voz nativa | Não recebe `silenceScale`; fallback continua no caminho existente |
| Piper | Uma única fila e um único provider compartilhado; nenhuma fila ou `AudioContext` paralelo foi criado |
| YouTube | Ausente do manifesto e do ZIP entregue |
| Multiaba | O patch não altera `sessionId`, `requestId` ou roteamento do worker |

## Defeito encontrado e corrigido durante o teste físico

A primeira execução da fixture real encontrou um problema do patch, não do código anterior: `TextTrack.activeCues` é um `TextTrackCueList` no navegador e não possui o método `.map()` diretamente. O código foi corrigido para converter a lista com spread antes do mapeamento. A fixture foi reiniciada e passou sem exceções JavaScript.

Esse achado é importante porque demonstra que o teste físico foi executado contra a API real do navegador, e não apenas contra um mock Array. A correção não altera o comportamento semântico do leitor; apenas torna a leitura compatível com o tipo nativo do Chrome.

## Validação automatizada

| Suíte | Resultado |
|---|---:|
| Testes do núcleo da extensão | 25 aprovados |
| Testes de plataforma/adaptadores | 52 aprovados |
| Testes experimentais Udemy | 18 aprovados |
| Testes específicos content/Piper/offscreen | 14 + 11 + 13 aprovados nos recortes executados |
| Validador do repositório | `REPOSITORY_CHECK_OK` |
| Sintaxe de `content.js`, `piper-bridge.js` e `offscreen.js` | Aprovada |
| `git diff --check` | Aprovado |
| Hash de `sync-engine.js` | Preservado |

Os testes novos cobrem três situações: primeira cue pré-sintetizada antes de ficar ativa, próxima cue adicionada progressivamente durante a fala atual e cue sem pontuação usando `silenceScale: 0.08` enquanto uma cue com ponto mantém `0.2`. Também foi adicionado um teste do offscreen que confirma o encaminhamento de `silenceScale` ao worker.

## Validação física local

No Chromium isolado com host local simulando Coursera, o content script carregou o `SiaSyncEngine`, o Piper foi selecionado no perfil isolado e o status neural chegou a `engine: piper-local`, `state: ready`, `queued: 0`, `ready: true`, sem exceções após a correção do `TextTrackCueList`.

A fixture possui duração curta e o Chromium headless não constitui prova de audição pelo alto-falante. A validação física confirma inicialização, captura temporal, pré-cache e ausência de exceções; a confirmação auditiva final deve ser feita no Chrome normal do usuário com o pacote anexado.

## Procedimento de instalação e teste

Remova ou desative todas as outras instalações da S·IA em `chrome://extensions`. Carregue somente o ZIP `sia-extension-1.8.14-initial-latency-fix.zip` como extensão descompactada. Feche a aba Coursera antiga, abra novamente a aula e faça `Ctrl+Shift+R`.

Selecione primeiro a voz nativa e teste duas ou três trocas de legenda. Depois selecione `Voz neural local PT-BR — experimental`, aguarde o status do Piper ficar pronto e repita o teste. O comportamento esperado é que a próxima frase comece com menor espera porque já foi preparada enquanto a cue atual estava em execução. No caso de continuação sem pontuação, a pausa deve ser curta; no caso de ponto final, a pausa normal deve permanecer.

Se a voz neural falhar, o fallback nativo deve assumir conforme a implementação anterior. Se isso ocorrer, registre o texto exato do status do popup e a sequência `engine/state`; não reinstale o YouTube nem outra versão durante a validação.

## Estado de publicação

O código permanece apenas no workspace local. Não houve commit, push, merge ou alteração na PR #22. O YouTube continua adiado até que esta base Coursera/Udemy seja confirmada fisicamente.

## Artefato

O ZIP entregue é `/tmp/sia-extension-1.8.14-initial-latency-fix.zip`, com SHA-256 `9cb80fe8a17ae0696e86309576593e56286d1711dd43f8203b98a66254d7a91e`. A listagem do ZIP contém zero entradas YouTube e zero arquivos de teste.

## Referências

[1]: https://github.com/Christian-Yugen/S.IA_Audio-learning/commit/eba278c "Commit eba278c — versão 1.8.14, redução da latência neural"

[2]: https://github.com/Christian-Yugen/S.IA_Audio-learning/commit/736b9d3 "Commit 736b9d3 — versão 1.8.15, continuidade prosódica neural"
