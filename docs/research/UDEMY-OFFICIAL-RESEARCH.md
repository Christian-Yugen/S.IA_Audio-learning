# Pesquisa inicial da Udemy para o adaptador S·IA

**Data da consulta:** 21 de agosto de 2026  
**Objetivo:** registrar evidências públicas antes de qualquer implementação do adaptador Udemy.

## Fatos documentados pela própria Udemy

A documentação de suporte da Udemy informa que, quando uma aula possui legendas, o player do navegador exibe um ícone de closed captions no canto inferior direito. A partir dele, o usuário escolhe o idioma ou desativa as legendas. A mesma documentação descreve configurações de tamanho da fonte, opacidade do fundo e possibilidade de posicionamento das legendas abaixo do vídeo. [1]

A Udemy também documenta uma função de transcrições acessível pelo player. O texto aparece em um painel lateral, acompanha o progresso da aula, destaca a sentença atual e realiza autoscroll conforme o instrutor fala. A documentação informa que a transcrição utiliza o mesmo idioma escolhido para as legendas. [1]

A documentação oficial também informa que o comportamento da nova experiência de curso pode variar entre contas e cursos, pois a funcionalidade é apresentada como piloto. O material indica que as funções do player, incluindo áudio, taxa de reprodução, resolução e legendas, continuam localizadas no player, mas a posição de outras funções da interface pode mudar. [4]

A Udemy documenta controles de velocidade no player e atalhos de teclado para pausar, alterar velocidade, avançar, retroceder, controlar volume e adicionar uma anotação. Esses controles devem ser observados pelo adaptador, mas não assumidos como contrato DOM estável. [2] [3]

## O que ainda não está confirmado

A documentação pública não confirma qual elemento DOM, `TextTrack`, evento interno, endpoint ou estrutura de dados fornece a cue ativa ao JavaScript de uma extensão. Também não confirma que a fonte de transcrição e a legenda utilizem a mesma representação acessível ao content script.

Por isso, o adaptador não deverá ser implementado a partir de seletores encontrados em exemplos ou screenshots. A próxima etapa precisa realizar observação passiva em uma aula que o usuário tenha autorização para acessar.

## Hipóteses verificáveis

| ID | Hipótese | Como verificar | Evidência exigida |
|---|---|---|---|
| UDY-H01 | O vídeo expõe uma faixa `TextTrack` utilizável. | Inspecionar `HTMLMediaElement.textTracks` em aula real e fixture controlada. | Lista de faixas, cues e tempos anonimizados. |
| UDY-H02 | O texto da legenda ativa aparece em uma região DOM estável. | Observar mudanças com `MutationObserver` sem alterar o player. | Cues consecutivas capturadas uma vez. |
| UDY-H03 | O painel de transcrição contém a sentença atual e pode servir como fallback. | Comparar destaque/autoscroll com tempo do vídeo. | Correlação repetível entre cue e timestamp. |
| UDY-H04 | A nova experiência de curso altera posições, mas não elimina o conteúdo da legenda. | Testar contas/cursos com experiências diferentes, quando disponíveis. | Diagnóstico por variante de layout. |
| UDY-H05 | A troca de aula recria o player e exige destruição/reconexão do adaptador. | Navegar entre aulas e observar nós/listeners. | Ciclo de vida sem duplicação. |
| UDY-H06 | A legenda pode estar indisponível mesmo com transcrição ou vice-versa. | Desligar/ligar idiomas e testar cursos diferentes. | Estado explícito de ausência de fonte. |

## Plano de observação

A investigação deverá ser passiva. Não deve iniciar síntese, alterar velocidade, clicar em controles, capturar conteúdo de conta ou armazenar texto de curso fora do ambiente de teste autorizado.

Para cada cenário, deve-se registrar apenas o necessário: existência do player, existência da faixa, disponibilidade da cue, origem técnica, timestamp relativo e estado do adaptador. URLs privadas, cookies, identificadores de usuário e texto protegido devem ser removidos do relatório.

## Consequência para o projeto

A pesquisa confirma que a Udemy possui legendas, transcrições, controle de velocidade e mais de uma experiência de curso documentada, mas não confirma uma API DOM estável para integração. Portanto, o plano deverá tratar a Udemy como adaptador experimental, começar pela observação passiva e manter a fonte da cue visível no diagnóstico.

## Referências

[1]: https://support.udemy.com/hc/en-us/articles/229605028-How-to-Use-Subtitles-Transcripts-on-a-Browser "Udemy — How to Use Subtitles & Transcripts (on a Browser)"

[2]: https://support.udemy.com/hc/en-us/articles/229231247-How-to-Change-the-Course-Video-Speed "Udemy — How to Change the Course Video Speed"

[3]: https://support.udemy.com/hc/en-us/articles/13687901918999-How-to-Use-Keyboard-Shortcuts "Udemy — How to Use Keyboard Shortcuts"

[4]: https://support.udemy.com/hc/pt/sections/206457187-Reprodutor-do-curso "Udemy — Reprodutor do curso e nova experiência de curso"


## Confirmação por consulta visual

A consulta visual da documentação oficial confirmou que o artigo de legendas e transcrições apresenta o ícone de closed captions no canto inferior direito do player e a transcrição em painel lateral, com destaque da sentença atual e autoscroll. A consulta visual do artigo de velocidade confirmou que o controle de velocidade é apresentado no canto inferior esquerdo do player. Esses pontos servem como referências de comportamento para investigação, não como seletores de implementação.

As páginas oficiais também expõem um link para uma “nova experiência de aprendizado” e informam que a experiência do player pode diferir. Portanto, o plano deverá testar pelo menos duas variantes de layout quando disponíveis e registrar a variante no diagnóstico, sem considerar a posição visual como contrato permanente.
