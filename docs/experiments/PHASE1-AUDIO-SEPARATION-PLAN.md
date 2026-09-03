# Fase 1 — Plano de laboratório para separação de áudio

## 1. Objetivo e limite da fase

A Fase 1 avaliará se é tecnicamente possível manter música, efeitos e ambiente de um vídeo enquanto a voz original é reduzida e a leitura da S·IA é inserida posteriormente. O trabalho será realizado em um laboratório isolado, usando arquivos de áudio autorizados e cópias de teste. **Nenhum código do leitor estável de Coursera, Udemy ou YouTube será alterado nesta fase.**

O objetivo não é provar que a voz original desaparecerá perfeitamente em qualquer vídeo. O objetivo é medir, em amostras reais, o equilíbrio entre quatro fatores: redução da voz original, preservação do ambiente, quantidade de artefatos e custo para executar o processamento localmente.

> Critério de honestidade: o laboratório deverá produzir evidências suficientes para dizer em quais tipos de vídeo o recurso funciona, em quais funciona apenas com atraso controlado e em quais deve ser recusado.

Soluções comerciais como o Moises demonstram a utilidade de separar vocais e acompanhamento, mas isso não significa que um modelo musical terá o mesmo desempenho em aulas, diálogos, reverberação ou gravações de tela.[1] A separação no navegador é tecnicamente possível com ONNX Runtime Web, WebGPU e WebAssembly, mas modelos maiores impõem custos de download, memória e processamento.[2] [4]

## 2. Hipóteses que serão testadas

| Código | Hipótese | Como será verificada |
|---|---|---|
| H1 | Um modelo de separação musical consegue reduzir a voz original sem destruir completamente música e efeitos. | Comparação auditiva entre áudio original, faixa de acompanhamento e remix com voz da S·IA. |
| H2 | A qualidade varia muito conforme o cenário do vídeo. | Corpus estratificado por música, ruído, reverberação, fala sobre apresentação e fala sobre demonstração. |
| H3 | Processamento em blocos com sobreposição pode ser mais estável que separação amostra a amostra. | Medição de descontinuidades, estalos, bombeamento e variação de timbre nas bordas dos blocos. |
| H4 | O custo de um modelo grande pode impedir tempo real em parte dos computadores. | Medição de tempo de inicialização, tempo de processamento, memória e fator de tempo real por perfil de hardware. |
| H5 | Um denoiser de fala não substitui um separador de voz, mas pode ser útil como comparação ou complemento. | Execução separada de modelos de aprimoramento e comparação do que é removido ou preservado. |

## 3. Corpus de amostras reais

O corpus principal deverá conter **12 a 18 trechos de 30 a 90 segundos**, obtidos de aulas e vídeos que o usuário esteja autorizado a processar. A duração total recomendada é de 12 a 20 minutos. Não é necessário baixar aulas completas; trechos representativos são suficientes e reduzem armazenamento, tempo de processamento e exposição de conteúdo.

As amostras devem ser identificadas por códigos, e não por nomes de pessoas ou títulos sensíveis. O manifesto deverá registrar somente os metadados necessários: código, origem genérica, duração, canais, taxa de amostragem, idioma, cenário e observações técnicas. Os arquivos brutos permanecerão fora do Git e fora de qualquer upload automático.

| Grupo | Quantidade | Características necessárias |
|---|---:|---|
| A — Fala limpa | 2 | Professor falando diretamente, sem música ou com ambiente muito baixo. |
| B — Fala com música | 2 | Voz sobre trilha musical contínua, incluindo pelo menos uma trilha intensa. |
| C — Fala com ambiente | 2 | Ruído de sala, rua, laboratório, plateia ou sons de equipamento. |
| D — Fala com reverberação | 2 | Auditório, igreja, sala grande ou gravação distante. |
| E — Demonstração prática | 2 | Professor narrando enquanto máquina, software, instrumento ou procedimento produz sons. |
| F — Vídeo educacional editado | 2 | Cortes, vinhetas, música de transição, efeitos e mudanças de volume. |
| G — Legenda fragmentada ou irregular | 2 | Vídeos em que as captions aparecem palavra a palavra ou com mudanças rápidas. |
| H — Casos difíceis opcionais | 2 a 4 | Vozes sobrepostas, entrevista, chamada, aplausos, compressão forte ou áudio mono. |

Além do corpus real, poderá ser usado um pequeno conjunto público com fontes conhecidas para calibrar métricas objetivas, desde que a licença de áudio e dos modelos permita esse uso. Esse conjunto não substituirá o corpus real, pois o objetivo é avaliar a experiência de aulas e vídeos, não somente o desempenho em música de estúdio.

## 4. Modelos candidatos

Os modelos serão avaliados em uma ordem que reduza risco e custo. Primeiro será executada uma linha de base simples; depois serão comparados separadores de fontes e, por fim, modelos de aprimoramento de fala. A presença de um modelo nesta lista não representa aprovação para distribuição comercial: código, pesos, conversões ONNX e dados de treinamento deverão ser auditados separadamente.

| Candidato | Papel no laboratório | Observação de risco |
|---|---|---|
| HT-Demucs/Demucs ONNX | Separação principal em `vocals` e acompanhamento, com possibilidade de stems intermediários. | É voltado principalmente à separação musical; pode deixar vazamentos ou artefatos em aulas. A implementação web de referência indica modelo na ordem de 172 MB e execução por WebGPU/WASM.[2] |
| Demucs em modo de dois stems | Linha de base de qualidade para comparar “voz” contra “restante”. | O repositório oficial descreve separação de vocais, bateria, baixo e acompanhamento, mas está arquivado; a manutenção e os pesos precisam ser avaliados.[5] |
| Spleeter ou outro separador leve | Linha de base de menor custo. | Pode ser mais rápido, porém com qualidade inferior; só entra após auditoria de licença, pesos e conversão. |
| DeepFilterNet | Comparação de aprimoramento e redução de ruído. | Não deve ser tratado como removedor de voz. O projeto é de aprimoramento de fala de baixa complexidade, com código dual MIT/Apache; os pesos exigem auditoria própria.[7] |
| DPDFNet via sherpa-onnx | Comparação de supressão de ruído com opção de streaming. | É descrito como modelo causal de aprimoramento de fala, não como separador completo de professor e ambiente. Os modelos ONNX publicados devem ser verificados antes de qualquer uso comercial.[8] |

A primeira execução poderá limitar-se a dois candidatos: um HT-Demucs ONNX e um modelo leve de comparação. Isso evita gastar tempo e armazenamento antes de verificar se as amostras realmente contêm informação de ambiente recuperável.

## 5. Protocolo de preparação

Cada arquivo será convertido somente para um formato de trabalho não destrutivo, preservando o original. O protocolo deverá registrar taxa de amostragem, número de canais, pico, loudness integrado e duração antes do processamento. Os candidatos receberão a mesma entrada normalizada, mas as conversões específicas de taxa de amostragem ficarão documentadas por modelo.

Cada trecho será processado em três condições: separação sem sobreposição, separação com sobreposição e a melhor configuração recomendada pelo próprio projeto. Nos modelos que trabalham por janelas, a saída será recomposta com crossfade ou soma ponderada para evitar cortes nas bordas. A configuração usada, o tamanho das janelas, a sobreposição e o provedor de execução serão salvos junto dos resultados.

O áudio de cada amostra deverá gerar, no mínimo, os seguintes artefatos:

| Artefato | Finalidade |
|---|---|
| `original.wav` | Controle auditivo e medição de entrada. |
| `voice.wav` | Verificar quanto da voz original foi separado. |
| `bed.wav` ou `accompaniment.wav` | Verificar música, efeitos e ambiente restantes. |
| `residual.wav` | Medir vazamento da voz no acompanhamento. |
| `sia-mix-preview.wav` | Opcional nesta fase: acompanhamento processado misturado com uma fala fixa da S·IA. |
| `metrics.json` | Guardar tempos, memória, configuração e métricas. |
| `spectrogram.png` | Visualizar cortes, ruído tonal e artefatos. |

Os arquivos derivados grandes deverão ficar em uma pasta de laboratório ignorada pelo Git. O repositório deverá conter somente manifestos, scripts reproduzíveis, relatórios e amostras autorizadas ou pequenos clipes explicitamente liberados.

## 6. Métricas objetivas

Quando houver referência separada confiável, serão calculadas métricas de separação como SDR, SI-SDR ou métricas equivalentes. Em amostras reais de aulas, normalmente não haverá uma faixa original isolada para servir de verdade-terreno. Nesses casos, as métricas objetivas serão usadas como evidência auxiliar, nunca como substituto da escuta humana.

| Dimensão | Medição | Registro mínimo |
|---|---|---|
| Supressão da voz | Energia e inteligibilidade da voz residual na faixa de acompanhamento; análise por segmentos com fala. | Média, mediana e pior segmento por amostra. |
| Preservação do ambiente | Loudness, espectro e continuidade da faixa de acompanhamento em segmentos sem fala e com eventos sonoros. | Diferença de loudness, alteração espectral e observação de transientes. |
| Artefatos | Detecção e anotação de estalos, musicalização, eco, bombeamento, phasing e cortes nas bordas. | Contagem por minuto e severidade auditiva. |
| Custo | Tempo de carga do modelo, tempo de separação, pico de RAM/VRAM e tamanho dos pesos. | Tempo absoluto e fator de tempo real. |
| Estabilidade | Falhas, travamentos, resultados vazios, incompatibilidade de backend e variação entre execuções. | Taxa de sucesso e log de erro. |
| Latência potencial | Tamanho mínimo de buffer necessário para produzir uma saída contínua. | Estimativa em segundos, sem ainda integrar ao player. |

O fator de tempo real será calculado como `tempo de processamento / duração do áudio`. Valores abaixo de 1,0 indicam que o processamento terminou mais rápido que a duração do trecho, mas não garantem tempo real no navegador: inicialização, cópia de buffers, garbage collection e mistura também precisam ser contabilizados.

## 7. Avaliação auditiva cega

A avaliação auditiva será feita com nomes neutros, sem revelar o modelo. Para cada amostra, o avaliador ouvirá o original, o acompanhamento separado e o preview com uma voz de referência da S·IA. O volume será nivelado para que uma faixa mais alta não pareça automaticamente melhor.

A escala será de 1 a 5, com definições fixas. **Supressão da voz original**: 1 significa voz completamente presente e 5 significa voz quase inaudível. **Preservação do ambiente**: 1 significa ambiente destruído e 5 significa ambiente natural e contínuo. **Naturalidade da mistura**: 1 significa mistura inutilizável e 5 significa integração convincente. **Artefatos**: 1 significa artefatos graves e 5 significa ausência ou quase ausência de artefatos. **Compreensão da S·IA**: 1 significa fala mascarada ou difícil e 5 significa leitura clara.

Cada amostra deverá receber também uma anotação livre sobre o defeito dominante. As categorias serão: vazamento de voz, música metálica, eco, perda de efeito, corte de transiente, atraso, bombeamento, voz da S·IA mascarada ou outro.

## 8. Perfis de hardware e execução

A medição deverá ser repetida em pelo menos dois perfis: um computador sem GPU dedicada e um computador com WebGPU disponível. Se possível, será incluído um perfil de baixo recurso. O teste do navegador só ocorrerá depois que a execução offline tiver identificado um candidato promissor.

| Perfil | Exemplo de capacidade | Pergunta principal |
|---|---|---|
| Econômico | CPU de poucos núcleos, 8 GB de RAM, sem GPU dedicada | A função precisa ser desativada para não prejudicar o navegador? |
| Intermediário | CPU moderna, 16 GB de RAM, GPU integrada ou WebGPU | É possível manter buffer de alguns segundos? |
| Alto | CPU/GPU com WebGPU estável | O atraso pode ser reduzido sem degradar a qualidade? |

Não serão coletados identificadores pessoais. Apenas capacidades técnicas necessárias à comparação serão registradas. O modelo será executado localmente; nenhum arquivo de aula, caption, resposta ou áudio será enviado para servidor durante o laboratório.

## 9. Critérios preliminares de decisão

Os limites abaixo são **gates experimentais**, sujeitos a revisão depois das primeiras amostras. Um candidato só poderá avançar para o protótipo audiovisual se atender simultaneamente aos requisitos de qualidade e segurança.

| Gate | Aprovação preliminar |
|---|---|
| Qualidade | Mediana igual ou superior a 3,5/5 em supressão de voz, preservação do ambiente e compreensão da S·IA. |
| Artefatos | Mediana igual ou superior a 3/5 e nenhum cenário principal com nota 1 em artefatos. |
| Cobertura | Pelo menos 70% dos trechos principais devem ser considerados utilizáveis sem edição manual. |
| Desempenho | Em pelo menos um perfil de hardware, fator de tempo real compatível com o buffer escolhido. |
| Recuperação | Falha, falta de memória, backend indisponível ou atraso crescente devem permitir retornar ao áudio original. |
| Licença | Código, modelo, pesos e conversão devem ter evidência documental suficiente para revisão de uso comercial. |

Se o candidato falhar na qualidade, será rejeitado mesmo que seja rápido. Se falhar apenas no desempenho, poderá avançar somente como modo com atraso controlado. Se falhar na recuperação ou na licença, não avançará.

## 10. Entregáveis da Fase 1

Ao final, o laboratório deverá produzir um relatório com a matriz de amostras, versões exatas dos modelos, hashes dos arquivos de modelo, configurações, tempos de execução, métricas, resultados auditivos e limitações por cenário. O relatório também deverá separar claramente o que foi medido em arquivo local do que ainda não foi testado dentro do Chrome.

A decisão final terá uma destas formas: **avançar para protótipo**, **avançar somente com buffer e poucos cenários**, **testar outro modelo** ou **não integrar por enquanto**. A decisão não será baseada em uma única demonstração impressionante; será baseada no pior comportamento observado e na capacidade de desligar o modo sem regressão.

## 11. Sequência de execução recomendada

1. Confirmar que as amostras são autorizadas e receber os arquivos ou instruções de localização local.
2. Criar o manifesto anonimizado e a estrutura de diretórios do laboratório.
3. Auditar versões, licenças, pesos e hashes dos dois primeiros candidatos.
4. Executar a linha de base em todas as amostras, sem integrar à extensão.
5. Medir custo, gerar stems, espectrogramas e logs.
6. Repetir com o segundo candidato e configurações de janela/sobreposição.
7. Realizar a avaliação auditiva cega e consolidar as notas.
8. Aplicar os gates preliminares e decidir se existe base para o protótipo com atraso controlado.

## Referências

[1]: <https://moises.ai/features/vocal-remover/> "Moises — Vocal Remover"
[2]: <https://github.com/timcsy/demucs-web> "demucs-web — separação de fontes no navegador"
[3]: <https://developer.chrome.com/docs/extensions/reference/api/tabCapture> "Chrome Extensions — tabCapture API"
[4]: <https://onnxruntime.ai/docs/tutorials/web/> "ONNX Runtime Web — tutorial e provedores de execução"
[5]: <https://github.com/facebookresearch/demucs> "Meta Demucs — repositório e documentação"
[6]: <https://github.com/facebookresearch/demucs/blob/main/LICENSE> "Demucs — licença MIT do repositório"
[7]: <https://github.com/rikorose/DeepFilterNet> "DeepFilterNet — aprimoramento de fala"
[8]: <https://k2-fsa.github.io/sherpa/onnx/speech-enhancement/dpdfnet.html> "sherpa-onnx — DPDFNet"
