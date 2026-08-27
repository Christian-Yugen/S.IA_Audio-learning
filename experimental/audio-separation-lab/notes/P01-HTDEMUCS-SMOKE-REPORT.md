# Smoke test P01 — HT-Demucs ONNX em CPU

## Identificação

Amostra `P01`: trecho real de palestra de 30 segundos, obtido do Wikimedia Commons e marcado como domínio público, com atribuição `Courtesy; William J. Clinton Presidential Library`. O arquivo original foi preservado em `corpus/raw/` e não foi adicionado ao Git.

Esta amostra serve somente para validar o encanamento de ingestão, conversão, carregamento do modelo, inferência e gravação dos stems. Ela não contém música ou ambiente complexo suficiente para decidir se o Modo Imersão deve avançar.

## Execução

| Campo | Resultado |
|---|---:|
| Modelo | `htdemucs_embedded.onnx` |
| Hash SHA-256 do modelo | `e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077` |
| Backend | ONNX Runtime Node, CPU |
| Entrada | WAV PCM16, estéreo, 44.100 Hz |
| Duração | 29,99998 s |
| Carga do modelo | 0,765 s |
| Separação | 24,885 s |
| Tempo total | 25,650 s |
| Fator de tempo real | 0,830× |
| Pico de RSS registrado | 2.883.216 KB, aproximadamente 2,75 GiB |
| Stems produzidos | `drums`, `bass`, `other`, `vocals` |
| Clipping PCM na saída | 0 amostras nos quatro stems |

## Métricas básicas dos stems

| Stem | RMS dBFS | Pico dBFS |
|---|---:|---:|
| `vocals` | -31,18 | -10,37 |
| `other` | -69,35 | -33,44 |
| `bass` | -74,24 | -49,32 |
| `drums` | -79,41 | -41,46 |

Os níveis são compatíveis com uma amostra dominada por fala, mas não medem por si só a inteligibilidade nem a qualidade da separação. É necessário ouvir o stem `vocals`, o acompanhamento e o remix com a S·IA.

## Observação de implementação

O código de referência informou `totalSegments: 5`, mas emitiu progresso até `currentSegment: 6`. A inferência foi concluída e os arquivos têm a duração correta, porém a contagem de progresso precisa ser corrigida ou encapsulada antes de ser usada em uma interface de usuário.

## Conclusão provisória

O pipeline offline está operacional para WAV PCM16 estéreo e o modelo executa em CPU mais rápido que o tempo do áudio neste ambiente. O consumo de memória é alto para uma extensão comum e será um risco relevante. O resultado ainda não autoriza integração com o Chrome, nem permite afirmar que música e sons ambientes serão preservados.

## Próximo teste

Adicionar uma amostra real autorizada com fala sobre música ou ambiente. Repetir a mesma configuração, gerar o acompanhamento (`drums + bass + other`) e realizar avaliação auditiva comparando original, acompanhamento, voz separada e preview com a S·IA.

## Verificação auxiliar de inteligibilidade

A transcrição local da entrada e a transcrição do stem `vocals` produziram os mesmos cinco segmentos reconhecidos entre 00:00 e 00:25. Isso indica que a fala principal permaneceu recuperável nesta amostra limpa. A medida não avalia vazamento de voz no acompanhamento, naturalidade, música, efeitos, reverberação ou latência percebida; esses pontos continuam pendentes para o corpus completo.

## Estado da Fase 1

O primeiro caminho técnico — ingestão, normalização, inferência HT-Demucs, gravação de stems, mistura de acompanhamento e verificação auxiliar — está operacional. Ainda falta a parte decisiva: testar amostras reais de aulas e vídeos com fala sobre música, ambiente e demonstração, preferencialmente em português-BR e nos cenários definidos no plano.

## Verificação de vazamento no acompanhamento

A transcrição auxiliar do acompanhamento (`drums + bass + other`) ainda reconheceu fala em vários intervalos. Portanto, nesta amostra de fala limpa, a separação não produziu um acompanhamento silencioso em relação à voz: houve vazamento suficiente para manter inteligibilidade parcial. Esse é um alerta importante para o Modo Imersão, pois simplesmente reproduzir o acompanhamento pode deixar a voz do professor audível junto da S·IA.

O resultado não permite concluir que o modelo falhará em música ou ambiente, porque a amostra não contém esses elementos. A próxima rodada precisa comparar a redução da voz em áudio realmente misturado e avaliar se o vazamento é mascarado pelo ambiente sem destruir seus sons.

## Segunda execução com medição corrigida

O executor do laboratório passou a calcular a contagem esperada de segmentos antes da execução e a registrar o SHA-256 do modelo. A repetição produziu seis segmentos, com progresso de 1/6 até 6/6, eliminando a inconsistência de apresentação observada na primeira execução.

| Campo | Segunda execução |
|---|---:|
| Hash SHA-256 do modelo | `e5e425c17683f163a472462eb5f5a4ffcd11c31858d57fbd0833b012d8b88077` |
| Carga do modelo | 0,850 s |
| Separação | 28,087 s |
| Tempo total | 28,937 s |
| Fator de tempo real | 0,936× |
| Pico de RSS registrado | 2.859.936 KB, aproximadamente 2,73 GiB |
| Segmentos esperados/processados | 6 / 6 |

A variação de tempo entre as duas execuções é esperada em uma medição de CPU compartilhada. O valor de referência para o planejamento será mantido como faixa, não como número único. O risco de memória permanece alto.
