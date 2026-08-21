

## Observação real 001 — probe ativo dentro de uma aula Udemy

O usuário forneceu uma captura do probe funcionando dentro de uma aula real da Udemy. O overlay mostrou:

| Métrica | Valor observado |
|---|---:|
| Versão do probe | `0.1.0` |
| Elemento de vídeo | `lecture-65933227` |
| Contêiner do player | `shaka-video-container-65933227` |
| `readyState` | `4` |
| `paused` | `false` |
| `currentTime` | `20.052` s |
| `duration` | `114.267` s |
| `playbackRate` | `1` |
| Tracks acessíveis | `[]` |
| Marcadores de legenda | `6` |
| Marcadores de transcrição | `2` |
| Eventos observados | `66` |
| Mutações observadas | `120` — limite máximo do probe |
| Reconstruções do player | `0` |
| Confiança da fonte | `unknown` |

A captura mostra texto de legenda visível no próprio vídeo enquanto `tracks` permanece vazio. Isso é evidência forte de que, nesta variante e neste instante, há uma superfície DOM/camada visual de legenda sem uma lista de `TextTrack` detectável pelo probe. Como o texto bruto não deve ser armazenado, o relatório registra somente a presença visual e as métricas sanitizadas.

O valor `paused: false` e o tempo diferente de zero confirmam que a aula estava em reprodução quando a captura foi feita. Essa reprodução ocorreu no ambiente de teste do usuário, não foi iniciada pelo probe. O contador `events: 66` demonstra que listeners passivos receberam eventos de mídia. O contador de mutações atingiu o teto de 120, portanto não deve ser interpretado como exatamente 120 mutações.

A captura confirma `UDY-H01` como não evidenciada para `TextTrack` nesta variante, fortalece `UDY-H02` como candidata a fallback DOM e confirma que o adaptador deverá expor `sourceConfidence: unknown` quando houver legenda visível sem fonte técnica confiável. `UDY-H05` ainda não foi testada em troca de aula, pois `rebuilds: 0` representa somente o intervalo observado.


## Observação real 002 — evolução durante reprodução e pausa

O usuário atualizou a página e iniciou novamente a aula em ambiente de teste. Em uma segunda captura, o overlay mostrou uma identidade de vídeo diferente (`lecture-66055087`) e um contêiner diferente (`shaka-video-container-66055087`), indicando que uma nova instância de aula/player foi observada. O campo `rebuilds` estava em `1`.

| Métrica | Primeira captura | Segunda captura |
|---|---:|---:|
| Elemento de vídeo | `lecture-65933227` | `lecture-66055087` |
| Contêiner | `shaka-video-container-65933227` | `shaka-video-container-66055087` |
| `readyState` | `4` | `4` |
| `paused` | `false` | `false` |
| Tempo | `20.052` s | `57.567` s |
| Duração | `114.267` s | `121.267` s |
| Velocidade | `1` | `1` |
| Tracks | `[]` | `[]` |
| Marcadores de legenda | `6` | `6` |
| Marcadores de transcrição | `2` | `2` |
| Eventos | `66` | `120` |
| Mutações | `120` | `120` |
| Rebuilds | `0` | `1` |
| Confiança | `unknown` | `unknown` |

A legenda permaneceu visualmente presente enquanto `tracks` permaneceu vazio. O usuário também relatou que, ao pausar o vídeo, os números do popup deixaram de se alterar. Essa observação é consistente com a interrupção dos eventos de progresso e com um probe que acompanha o estado real do elemento `<video>`.

A diferença de identidade, duração e tempo entre as capturas não deve ser interpretada como uma troca automática feita pelo probe. Ela resultou da atualização/reinício realizado pelo usuário durante o teste. A evidência confirma que o probe detecta a nova instância e que a futura reconexão deverá ser idempotente.

A contagem de eventos atingiu o limite de 120 e a de mutações permaneceu no teto definido pelo probe; esses valores são limites de coleta, não medidas exatas. O campo `confidence: unknown` é o comportamento desejado enquanto a legenda visível não puder ser associada a uma fonte técnica confiável.
