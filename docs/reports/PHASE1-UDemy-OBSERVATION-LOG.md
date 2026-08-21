# Registro de observação passiva — Fase 1

**Data:** 21 de agosto de 2026  
**Estado:** investigação em andamento  
**Escopo autorizado:** observação passiva, sem síntese, sem alteração do player e sem alteração do código S·IA

## Observação 001 — página pública da Udemy

A página pública da Udemy carregou normalmente em `https://www.udemy.com/`. Foram observados o campo de busca, o menu Explore, categorias públicas, seleção de idioma e links de autenticação. A página apresentou os estados `Log in` e `Sign up`, indicando que a sessão de observação atual não está autenticada em uma conta de aluno.

Nenhum player de curso, elemento de legenda, transcrição ou vídeo foi acessado nesta observação. Não houve clique, login, mudança de velocidade, início de reprodução ou alteração de conteúdo.

## Resultado técnico

A navegação pública confirma que a origem da Udemy está acessível, mas não fornece evidência suficiente para confirmar `TextTrack`, cues, transcrição ativa, troca de aula ou ciclo de vida do player. A Fase 1 precisa de uma aula acessível ao usuário em uma sessão autenticada ou de uma fixture autorizada que reproduza o player.

O conector My Browser não foi ativado na sessão; a solicitação de ativação não foi aceita. Por esse motivo, a observação real da conta do usuário não foi iniciada e nenhuma informação pessoal foi solicitada ou utilizada.

## Hipóteses ainda não observadas

`UDY-H01` a `UDY-H06` permanecem sem confirmação prática. A página pública não permite decidir se a fonte principal será `TextTrack`, DOM, transcrição ou outra representação.

## Próximo bloqueio legítimo

Para continuar sem violar o escopo, é necessário que a sessão My Browser seja ativada para esta tarefa ou que o usuário forneça uma URL de aula Udemy que esteja acessível no navegador autorizado. Mesmo nesse caso, a observação deverá permanecer passiva e registrar somente estrutura técnica, tempos relativos e estados necessários ao adaptador.


## Observação 002 — aula real acessível

A URL fornecida abriu em uma sessão autenticada do My Browser. A página exibiu o curso `Certified Lean Six Sigma Green Belt Training (Accredited)`, progresso do aluno e a estrutura de aulas. O acesso autenticado foi inferido apenas pela presença do progresso e do conteúdo do curso; nenhum dado de conta foi coletado.

O player ficou visível sem que a reprodução fosse iniciada. A interface expôs um contêiner com identificador `shaka-video-container-16910202`, o que confirma a hipótese de uma camada Shaka nesta variante do player. O estado observado foi `Carregado: 5%`, `0:00 / 0:00`, com a imagem inicial e o botão visual de Play disponíveis.

Foram observados, sem acionamento, controles de Play, barra de progresso, marcador, retroceder 5 segundos, avançar 5 segundos, velocidade `1x`, adicionar nota, transcrição, legendas, configurações, tela cheia e navegação de aulas. O menu de configurações expôs opções de qualidade, vídeos em sequência, download da aula, atalhos de teclado, informação do conteúdo e denúncia de abuso.

O controle de legendas apresentou uma lista que inclui Português, Inglês, Espanhol, Francês, Alemão, Hindi, Japonês, Turco e variantes automáticas. A página de visão geral também declarou `Legendas: Sim`. O controle `Transcrição` estava presente no player, mas não foi aberto nesta observação para manter o escopo passivo.

O painel lateral mostrou a estrutura de seções e aulas, estado concluído/não concluído, duração e botões de reprodução de cada aula. A navegação expôs elementos de aula anterior e próxima, além de painel de conteúdo do curso e área separada de AI Assistant.

## Hipóteses atualizadas

| Hipótese | Estado | Evidência |
|---|---|---|
| `UDY-H01`: existe vídeo detectável | Confirmada nesta aula | Contêiner `shaka-video-container-16910202` e frame inicial |
| `UDY-H02`: há controle de legenda no player | Confirmada nesta aula | Menu `Legendas` com idiomas |
| `UDY-H03`: há transcrição acessível pelo player | Presença confirmada; conteúdo ainda não observado | Controle `Transcrição` visível |
| `UDY-H04`: velocidade é controlável | Presença confirmada; comportamento não testado | Controle `1x` visível |
| `UDY-H05`: aulas e player convivem em navegação lateral | Confirmada nesta aula | Painel de conteúdo com seções e aulas |
| `UDY-H06`: a fonte da cue é `TextTrack` | Não confirmada | Ainda não houve inspeção de cues nem reprodução |

A reprodução permaneceu parada. Não houve mudança de velocidade, seek, troca de legenda, abertura de transcrição, clique em aula, alteração no DOM ou alteração no código da extensão.


## Observação 003 — estrutura HTML estática

A análise passiva do HTML salvo encontrou referências ao contêiner `shaka-video-container`, elementos de vídeo, controles de legenda/transcrição e itens de currículo. Essa evidência é estrutural e não prova, por si só, que as cues estejam expostas como `TextTrack` no runtime.

O HTML também contém itens de currículo com atributos `data-purpose` e classes específicas da interface atual. Esses seletores foram registrados somente como evidência de uma variante observada; não devem ser tratados como contrato de implementação antes de uma segunda hipótese e de testes de robustez.

O estado de player observado permaneceu em `0:00 / 0:00`, com imagem inicial e Play disponível. Não houve reprodução, portanto ainda não é possível confirmar eventos de `timeupdate`, troca de cue, `activeCues`, duração final ou atualização da linha ativa na transcrição.


## Observação 004 — elementos materializados no HTML

A análise do HTML da aula encontrou um elemento `<video>` com `id="lecture-16910202"`, `preload="auto"` e `controlslist="nodownload"`, dentro de um contêiner `data-purpose="shaka-video-player"` e do contêiner `shaka-video-container-16910202`.

Também foram encontrados marcadores semânticos para legenda e transcrição: `data-purpose="caption"`, `data-purpose="captions-dropdown-button"`, `data-purpose="captions-dropdown-menu"`, `data-purpose="transcript-toggle"` e `aria-label="Transcrição na área da barra lateral"`. Não foi encontrado um elemento `<track>` no HTML inicial salvo.

Conclusão provisória: a Udemy oferece uma superfície DOM identificável para controles de legenda/transcrição nesta aula, enquanto a exposição de `TextTrack` ainda não pode ser confirmada sem observar o estado do vídeo em runtime. O adaptador não deve assumir que a ausência de `<track>` no HTML inicial significa ausência de cues; o player pode carregá-las dinamicamente.


## Observação 005 — recarga da mesma aula

A mesma URL foi aberta novamente para observar uma recarga passiva. O player foi reconstruído com o mesmo contêiner `shaka-video-container-16910202`, o mesmo elemento de aula, a imagem inicial, o botão Play, o painel lateral e os controles de legenda/transcrição. O estado retornou a `0:00 / 0:00`, com `Carregado: 5%` e velocidade `1x`.

O painel de curso também foi reconstruído com a mesma estrutura de seções, estados de conclusão e navegação anterior/próxima. Não houve clique, reprodução, seek, pausa manual, troca de aula ou alteração de velocidade.

Essa observação confirma que o adaptador futuro precisará tolerar a recriação do player e reinstalar observers de forma idempotente, mas ainda não autoriza a implementação dessa lógica.


## Observação 006 — limites do ciclo de vida

A recarga e a reconstrução do player foram observadas passivamente. Não foram executados pausa, seek ou troca de aula, porque essas ações exigiriam iniciar ou controlar a reprodução, o que está fora do escopo aprovado para esta Fase 1.

Também não foi possível confirmar eventos `play`, `pause`, `timeupdate`, `seeking`, `seeked`, `ended` ou a atualização de `activeCues`. Esses eventos deverão ser investigados somente em uma etapa posterior, com autorização explícita para um protocolo de teste controlado e reversível.

A tentativa de localizar a palavra `Transcrição` por busca textual após a recarga não encontrou texto no estado atual, mas a observação anterior havia identificado o controle de transcrição no player. Isso reforça que controles podem ser renderizados ou expostos de forma dinâmica e que o adaptador não deve depender de uma única leitura estática da página.
