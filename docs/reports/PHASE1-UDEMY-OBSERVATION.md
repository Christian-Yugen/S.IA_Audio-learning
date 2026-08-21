# Relatório da Fase 1 — observação passiva da Udemy

**Projeto:** S·IA — Audio-learning by UXBRAS®  
**Data:** 21 de agosto de 2026  
**Fase:** 1 do plano Udemy  
**Status:** concluída dentro do escopo autorizado; implementação não autorizada

## 1. Escopo e restrições

A Fase 1 foi autorizada exclusivamente para observar uma aula real da Udemy, verificar o player, registrar as superfícies de legenda e transcrição e compreender a reconstrução da página. Não foi autorizada a implementação do adaptador, a reprodução do vídeo, a alteração da velocidade, o seek, a troca manual de aula, a síntese de voz ou qualquer modificação no código funcional da S·IA.

A observação foi feita na aula fornecida pelo responsável do projeto:

`https://www.udemy.com/course/six-sigma-green-belt-with-minitab/learn/lecture/13014304?start=0#overview`

Nenhuma credencial, cookie, identificador de conta ou texto de curso foi armazenado no relatório. O conteúdo foi usado somente para confirmar a estrutura técnica necessária ao planejamento.

## 2. Acessibilidade observada

A aula abriu em uma sessão autenticada do navegador autorizado. A página exibiu o curso **Certified Lean Six Sigma Green Belt Training (Accredited)**, o progresso do aluno e o painel de conteúdo com seções, aulas, duração e estado de conclusão. Esse comportamento confirma que a observação ocorreu dentro de uma aula real acessível, não apenas em uma página pública de catálogo.

O player permaneceu parado em `0:00 / 0:00`, com uma imagem inicial e o botão visual de Play. A página informou carregamento de aproximadamente 5%. Como a reprodução não foi iniciada, não foram capturados texto de legenda, áudio, cues ou timestamps de conteúdo.

## 3. Estrutura do player

A variante observada expôs um contêiner `shaka-video-container-16910202`, um contêiner com `data-purpose="shaka-video-player"` e um elemento `<video>` com `id="lecture-16910202"`, `preload="auto"` e `controlslist="nodownload"`. Isso confirma que existe uma superfície de vídeo e que a variante observada utiliza uma camada identificada como Shaka.

| Elemento observado | Resultado | Interpretação de planejamento |
|---|---|---|
| Contêiner do player | Presente | O adaptador deve localizar o vídeo sem depender somente de classes visuais. |
| Identificação Shaka | Presente nesta aula | Deve ser tratada como evidência de variante, não como contrato universal. |
| Elemento `<video>` | Presente | O adaptador deverá investigar `HTMLMediaElement` em runtime autorizado. |
| Botão Play | Presente | Não foi acionado nesta fase. |
| Barra de progresso | Presente | Não foi manipulada nesta fase. |
| Velocidade `1x` | Presente | Não foi alterada nesta fase. |
| Transcrição | Controle visível na primeira observação | O conteúdo e o mecanismo de atualização ainda não foram observados. |
| Legendas | Menu visível com vários idiomas | A origem da cue ainda não foi confirmada. |

## 4. Legendas e transcrição

O player apresentou um controle de legendas com Português, Inglês, Espanhol, Francês, Alemão, Hindi, Japonês, Turco e variantes automáticas. A página de informações do curso também indicou `Legendas: Sim`. A documentação oficial da Udemy descreve o closed captions no player e informa que a transcrição aparece em painel lateral, acompanha o progresso, destaca a sentença atual e realiza autoscroll [1].

No HTML salvo foram encontrados os marcadores `data-purpose="caption"`, `data-purpose="captions-dropdown-button"`, `data-purpose="captions-dropdown-menu"` e `data-purpose="transcript-toggle"`. Também foi encontrado o atributo `aria-label="Transcrição na área da barra lateral"`.

Não foi encontrado um elemento `<track>` no documento HTML inicial. Isso não prova que o player não utilize `TextTrack`: as faixas e cues podem ser adicionadas dinamicamente depois que o player inicializa ou quando a reprodução começa. Portanto, `TextTrack` continua sendo hipótese de runtime, não fato confirmado.

## 5. Reconstrução e recarga

A mesma URL foi aberta novamente sem interação com o player. O contêiner Shaka, o elemento de aula, a imagem inicial, o botão Play, os controles e o painel de conteúdo foram reconstruídos no mesmo estado. A página retornou a `0:00 / 0:00`, velocidade `1x` e carregamento aproximado de 5%.

Essa observação confirma que o adaptador futuro precisará tratar recriação do player e reinstalação de observers de forma idempotente. A troca de aula, a pausa, o seek, o encerramento e a atualização de `activeCues` não foram executados porque exigiriam controlar a reprodução e ultrapassariam o escopo aprovado.

## 6. Hipóteses atualizadas

| ID | Hipótese | Estado após a Fase 1 | Próxima evidência necessária |
|---|---|---|---|
| `UDY-H01` | O vídeo expõe uma faixa `TextTrack` utilizável. | Não confirmada | Inspeção de `textTracks` e cues em runtime autorizado. |
| `UDY-H02` | A legenda ativa aparece em região DOM estável. | Não confirmada | Observação de mudanças durante reprodução controlada. |
| `UDY-H03` | A transcrição contém a sentença atual e pode ser fallback. | Presença do controle confirmada; conteúdo não confirmado. | Comparação entre destaque, autoscroll e tempo do vídeo. |
| `UDY-H04` | A nova experiência pode variar a posição dos controles. | Confirmada em documentação; uma variante real observada. | Comparação com segunda variante de curso/conta. |
| `UDY-H05` | A troca ou recarga recria o player. | Recarga confirma reconstrução; troca de aula não testada. | Navegação controlada entre duas aulas. |
| `UDY-H06` | Legenda e transcrição podem ter disponibilidade independente. | Não confirmada | Comparação entre idiomas e cursos autorizados. |

## 7. Decisões para o adaptador futuro

A primeira fonte candidata continua sendo `TextTrack`, mas sua adoção dependerá de evidência de runtime. A superfície DOM de legendas e transcrição deverá ser tratada como fallback ou fonte alternativa, identificada no diagnóstico. A ausência de `<track>` no HTML inicial impede qualquer conclusão simplista sobre a fonte real das cues.

O adaptador deverá localizar o player por sinais combinados: elemento `<video>`, contexto semântico do player e estado de aula. O identificador `shaka-video-container-16910202` não deverá ser codificado como identificador fixo. A reconexão deverá destruir observers antigos e evitar duplicação após recarga ou navegação SPA.

Nenhuma dessas decisões autoriza alteração do `sync-engine.js`, do caminho Coursera, da fila de áudio, do Piper ou do fallback existente. A futura implementação deverá produzir eventos normalizados para o mesmo núcleo único.

## 8. Limitações

A Fase 1 não confirma a disponibilidade de cues, o texto real de uma legenda, a relação entre legenda e transcrição, eventos de mídia, duração final, troca de aula ou comportamento de `activeCues`. Essas limitações são deliberadas: o plano proibiu iniciar ou controlar a reprodução nesta fase.

Uma tentativa auxiliar de localizar o texto `Transcrição` após a recarga não encontrou o texto no estado atual da página, embora a observação anterior tenha identificado o controle e o HTML tenha apresentado `data-purpose="transcript-toggle"`. Essa diferença reforça que a interface pode ser renderizada dinamicamente e não deve ser tratada como snapshot estático.

## 9. Conclusão e gate seguinte

A Fase 1 confirmou que a aula real acessível possui player baseado em uma estrutura identificada como Shaka, elemento `<video>`, menu de legendas, controle de transcrição, velocidade, painel de aulas e reconstrução consistente após recarga. Também confirmou que ainda não há evidência suficiente para escolher a fonte técnica definitiva das cues.

A Fase 1 está concluída dentro do escopo autorizado. A **Fase 2 — contrato e protótipo do adaptador** não deve começar automaticamente. Ela exigirá nova aprovação explícita e deverá começar por um protocolo controlado de runtime, com fixtures, diagnóstico e rollback, sem tocar no núcleo Coursera.

> **Resultado:** a Udemy é tecnicamente observável e candidata à integração, mas permanece experimental. O próximo passo depende de autorização específica e não está liberado por este relatório.

## Referências

[1]: https://support.udemy.com/hc/en-us/articles/229605028-How-to-Use-Subtitles-Transcripts-on-a-Browser "Udemy — How to Use Subtitles & Transcripts on a Browser"

[2]: https://support.udemy.com/hc/en-us/articles/229231247-How-to-Change-the-Course-Video-Speed "Udemy — How to Change the Course Video Speed"

[3]: https://support.udemy.com/hc/en-us/articles/13687901918999-How-to-Use-Keyboard-Shortcuts "Udemy — How to Use Keyboard Shortcuts"

[4]: https://support.udemy.com/hc/pt/sections/206457187-Reprodutor-do-curso "Udemy — Reprodutor do curso e nova experiência"
