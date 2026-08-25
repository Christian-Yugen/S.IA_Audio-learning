# Pesquisa oficial inicial — YouTube e integração com a S·IA

**Status:** investigação passiva; sem implementação autorizada neste documento.

**Baseline protegido:** S·IA 1.8.14, branch `main`.

**Escopo:** entender fontes de legendas, transcrição, player, navegação dinâmica e limites do Chrome antes de criar um adaptador YouTube.

## Conclusão executiva

O YouTube oferece legendas e transcrições em determinadas condições, mas a disponibilidade de uma transcrição não prova que a extensão terá acesso a cues temporais estáveis por uma API pública. A documentação oficial informa que a transcrição acompanha o texto da legenda atual e permite saltar para um trecho do vídeo [1]. A documentação também alerta que legendas automáticas são produzidas por reconhecimento de fala e podem conter erros relacionados a pronúncia, sotaques, dialetos e ruído [2].

A API oficial consultada é a YouTube IFrame Player API, voltada a players incorporados. Ela documenta eventos e opções do módulo de captions, mas não deve ser tratada como contrato público do player principal em `youtube.com` [3]. Portanto, a S·IA deverá investigar as fontes observáveis no player principal sem depender prematuramente de objetos internos, URLs assinadas ou endpoints não documentados.

## Fontes oficiais

| ID | Fonte | Evidência utilizada |
|---:|---|---|
| [1] | [Acessar transcrições de vídeo — YouTube](https://support.google.com/youtube/answer/15930243?hl=pt-BR) | `Mostrar transcrição`, rolagem da linha atual e salto para o trecho correspondente. |
| [2] | [Usar a transcrição automática — YouTube](https://support.google.com/youtube/answer/6373554?hl=pt-BR) | Transcrição automática por reconhecimento de fala e variação de qualidade. |
| [3] | [YouTube IFrame Player API Reference — Google for Developers](https://developers.google.com/youtube/iframe_api_reference) | Eventos, controle do player e opções do módulo de legendas em players incorporados. |
| [4] | [Scripts de conteúdo — Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) | Mundo isolado, acesso compartilhado ao DOM e comunicação por uma fronteira controlada. |
| [5] | [Padrões de correspondência — Chrome for Developers](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns) | Escopo de URLs para injeção de scripts e permissões de host. |

## Observação passiva inicial

Foi aberta a página pública do vídeo educacional [But what is a neural network?](https://www.youtube.com/watch?v=aircAruvnKk), do canal 3Blue1Brown, sem clicar em controles e sem acessar dados privados. O player foi identificado na interface pelo contêiner `#movie_player`. Na visualização inicial, o controle informou que não havia legendas disponíveis naquele estado, embora a resposta inicial pública capturada pela página contivesse metadados de tracks de legenda.

O analisador local encontrou tracks nos idiomas `pt` e `pt-BR` na resposta inicial do player, além de idiomas traduzíveis. Esse resultado é uma evidência de que a fonte de legenda pode estar disponível no estado de dados inicial mesmo quando o controle visual ainda não confirma uma faixa ativa. As URLs temporárias das tracks, parâmetros de sessão e demais dados da resposta não foram persistidos no repositório.

Essa diferença entre metadado inicial e estado visual exige uma confirmação em múltiplas etapas. O adaptador não deverá emitir fala apenas porque encontrou um campo de legenda; deverá confirmar texto, idioma, início, fim, player ativo e reprodução dentro da janela temporal.

## Hipóteses de investigação

| ID | Hipótese | Método passivo | Critério de confirmação |
|---|---|---|---|
| YT-H01 | O vídeo expõe `TextTrack` e `activeCues` utilizáveis. | Inspecionar o elemento de mídia em vídeos públicos autorizados, sem alterar o player. | Cues com texto, `startTime` e `endTime` corretos em várias frases. |
| YT-H02 | A resposta inicial contém tracks identificáveis e correlacionáveis com o player ativo. | Analisar somente metadados não sensíveis da página capturada. | Idioma, vídeo e faixa podem ser associados sem depender de URL assinada persistente. |
| YT-H03 | O overlay visível de captions muda de forma observável. | Observar mutações do DOM e comparar com o relógio do vídeo. | Cada frase aparece uma vez e possui timing confirmado por outra fonte. |
| YT-H04 | `Mostrar transcrição` oferece uma linha atual associável ao tempo do vídeo. | Abrir somente em vídeo público com transcrição disponível e comparar timestamps. | A linha atual é correlacionada repetidamente com uma cue temporal. |
| YT-H05 | Navegação SPA e troca de vídeo recriam player, tracks ou listeners. | Observar navegação interna, troca de vídeo, pausa e retomada. | O adaptador destrói e reconecta sem duplicar eventos ou falas. |
| YT-H06 | Vídeos e contas apresentam disponibilidade e formatos diferentes. | Repetir a observação em vídeos educacionais públicos com legendas manuais e automáticas. | O diagnóstico identifica a fonte e não transforma ausência em erro silencioso. |
| YT-H07 | O estado interno do player pode ser observado com segurança por uma ponte mínima. | Investigar somente se TextTrack e DOM não forem suficientes. | A ponte é isolada, validada, reversível e não libera texto sem timing. |

Pelo menos três hipóteses deverão ser testadas antes de escolher a fonte principal. Hipóteses não confirmadas deverão permanecer marcadas como desconhecidas.

## Implicações do Chrome

Content scripts executam em mundo isolado, mas compartilham acesso ao DOM com a página. Isso permite observar elementos da interface, porém não autoriza assumir que variáveis e objetos JavaScript privados do YouTube estarão diretamente acessíveis [4]. Se uma ponte entre o mundo da página e o content script for necessária, ela deverá ser mínima, validada e explicitamente diagnosticada.

O futuro padrão de content script deverá ser específico ao YouTube, como `https://www.youtube.com/watch*`, e deverá ser revisado junto com permissões e privacidade. Não usar `<all_urls>` para esta integração. Padrões de correspondência controlam os URLs em que scripts podem ser injetados e devem permanecer restritos ao escopo necessário [5].

## Política de segurança de fala

A S·IA deverá separar quatro conceitos: existência de texto, existência de legenda selecionada, existência de timing confiável e autorização para fala. Texto do overlay ou da transcrição sem `startTime` e `endTime` confirmados pode ser mostrado no diagnóstico, mas deverá resultar em `UNSAFE_TO_SPEAK`.

O fallback de legenda e o fallback de áudio continuam independentes. Se a fonte de legenda não for confirmada, a fala deve ser suspensa e o usuário deve receber orientação. Se uma cue válida chegar ao núcleo e o Piper falhar, o núcleo comum poderá retornar à voz nativa conforme o comportamento já validado no Coursera.

## Fora do escopo desta pesquisa

Esta fase não altera o manifesto, não inclui `youtube.com` nos `matches`, não modifica `sync-engine.js`, não cria uma fila de áudio YouTube, não chama Piper diretamente, não baixa legendas para um servidor e não contorna controles ou autenticação do site. O código Coursera e o adaptador Udemy permanecem intocados.

## Próxima decisão

Depois da investigação passiva, será apresentado um contrato de adaptador YouTube com fontes, níveis de confiança, estados, fallback, fixtures sintéticas e matriz de testes. A implementação somente deverá começar em branch separada, com diagnóstico e fallback desde o primeiro protótipo, e após o escopo ser aprovado pelo responsável do projeto.

## Referências

[1]: https://support.google.com/youtube/answer/15930243?hl=pt-BR "YouTube — Acessar transcrições de vídeo"

[2]: https://support.google.com/youtube/answer/6373554?hl=pt-BR "YouTube — Usar a transcrição automática"

[3]: https://developers.google.com/youtube/iframe_api_reference "Google for Developers — YouTube IFrame Player API Reference"

[4]: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts "Chrome for Developers — Scripts de conteúdo"

[5]: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns "Chrome for Developers — Padrões de correspondência"
