# Fase 1 — Relatório de laboratório de separação de áudio

**Data:** 27 de agosto de 2026

**Projeto:** S·IA — Modo Imersão Audiovisual

**Estado:** laboratório operacional; integração com a extensão não aprovada

## Resumo executivo

A Fase 1 já possui um laboratório offline reprodutível, dois candidatos executáveis e um simulador de mistura com ducking e atraso. O Spleeter 2-stems FP16 apresentou custo computacional muito menor que o HT-Demucs no ambiente de teste. O HT-Demucs, por outro lado, preserva a fala de uma palestra limpa com boa inteligibilidade, porém consome memória elevada e deixa fala reconhecível no acompanhamento separado nessa mesma amostra.

A conclusão atual é **não integrar ainda nenhum separador à extensão**. O laboratório prova que a cadeia técnica é viável para experimentação, mas não prova que a voz original possa ser removida com qualidade suficiente de aulas reais enquanto música e sons ambientes são preservados. Essa decisão protege o núcleo estável de Coursera, Udemy e YouTube.

## O que foi construído

O laboratório está isolado em `experimental/audio-separation-lab/` e não participa do Manifest V3 da extensão. Ele contém manifesto de corpus, validação de autorização e duração, inspeção via `ffprobe`, hashes SHA-256, normalização para WAV PCM16, profiler de processo, análise RMS/clipping, mistura de acompanhamento e simulador de imersão.

Os arquivos audiovisuais brutos, stems, previews e pesos dos modelos são ignorados pelo Git. Apenas scripts, manifestos, relatórios e hashes pequenos são versionados. Nenhum áudio foi enviado a servidor para processamento.

## Comparação dos smoke tests

| Critério | HT-Demucs ONNX | Spleeter FP16 via sherpa-onnx |
|---|---:|---:|
| Papel | Separação de 4 stems | Separação de 2 stems |
| Entrada testada | Palestra real, domínio público, 30 s | Arquivo de teste musical, 10,9 s |
| Backend | ONNX Runtime Node, CPU | ONNX Runtime Node, CPU |
| Tempo de separação | 24,9–28,1 s | 1,03 s |
| Fator de tempo real | 0,83–0,94× | 0,094× |
| Pico de RSS | 2,73–2,75 GiB | aproximadamente 304 MiB |
| Saídas | `drums`, `bass`, `other`, `vocals` | `vocals`, `accompaniment` |
| Estado do áudio | WAV PCM16, estéreo, 44,1 kHz | WAV PCM16, estéreo, 44,1 kHz |
| Clipping após correção do adaptador | 0 amostras | 0 em `vocals`, 2 em `accompaniment` |

Os tempos não são uma classificação universal: as entradas têm durações e modelos diferentes, o ambiente é CPU compartilhada e o código de execução não é o mesmo. Eles servem como referência inicial de ordem de grandeza.

## Observações de qualidade

No smoke test do HT-Demucs, a transcrição auxiliar do stem `vocals` coincidiu com a fala reconhecida na entrada entre 00:00 e 00:25. Isso é uma evidência limitada de preservação da fala em cenário limpo. O acompanhamento formado por `drums + bass + other` ainda apresentou fala reconhecível, indicando vazamento relevante. Como a palestra não contém música ou ambiente complexo, não é possível saber se esse vazamento será mascarado ou agravado em uma aula real.

No smoke test do Spleeter, o arquivo usado é musical e não representa uma aula. A velocidade e o baixo consumo de memória são promissores para uma linha de base local. Ainda não há uma avaliação válida de Spleeter em professor falando sobre música, efeitos, sala ou reverberação. O primeiro adaptador apresentou clipping por erro de implementação; esse erro foi corrigido e o benchmark válido foi repetido.

## Simulação de imersão

O simulador aceita um acompanhamento e uma narração, aplica atraso configurável, reduz dinamicamente o acompanhamento durante a voz e recompõe a saída. Um preview com atraso de 180 ms foi gerado com os stems do Spleeter. A faixa vocal usada foi apenas um substituto técnico; não é a voz neural da S·IA e não valida a sincronização real com captions.

A simulação confirma que o conceito de ducking pode ser prototipado offline. Ela não prova que o áudio separado será suficientemente limpo nem que a latência do processamento será aceitável dentro de uma aba do Chrome.

## Decisão técnica atual

| Decisão | Estado |
|---|---|
| Alterar o núcleo normal de leitura da S·IA | **Não aprovado** |
| Integrar separação automaticamente em Coursera, Udemy ou YouTube | **Não aprovado** |
| Manter o laboratório local e offline | **Aprovado** |
| Usar Spleeter como baseline de velocidade | **Aprovado para laboratório** |
| Usar HT-Demucs como baseline de qualidade | **Aprovado para laboratório** |
| Distribuir pesos na extensão | **Bloqueado até auditoria de licença e desempenho** |
| Avançar para protótipo experimental isolado | **Condicionado a amostras reais e avaliação auditiva** |

## Critérios para avançar

O próximo avanço só deve ocorrer depois de testar pelo menos três trechos reais autorizados: fala limpa, fala sobre música ou ambiente e uma demonstração com ruído ou reverberação. O conjunto completo deverá chegar a 12–18 trechos, incluindo português-BR e variações de mixagem.

Para cada modelo, será necessário registrar redução perceptível da voz original no acompanhamento, preservação de sons relevantes, ausência de artefatos graves, inteligibilidade da S·IA, fator de tempo real, memória e recuperação após falha. A avaliação humana deverá ser cega em parte dos arquivos, e a licença do código, dos pesos, da conversão ONNX e do runtime deverá ser comprovada separadamente.

Mesmo que um modelo seja aprovado no laboratório, a primeira integração deverá ser manual, reversível e experimental. O áudio original precisa poder voltar imediatamente; o usuário deve iniciar o processamento por ação explícita; e a extensão não deve capturar ou enviar áudio sem indicação clara. O fallback normal da S·IA deve permanecer intacto.

## Próximo passo operacional

Adicionar os trechos de aula autorizados ao diretório local indicado no README do laboratório, preencher o manifesto e repetir automaticamente o mesmo protocolo com HT-Demucs e Spleeter. Depois será produzido um quadro comparativo por cenário. Até essa etapa, a recomendação é tratar o Modo Imersão como **pesquisa promissora, mas ainda não pronta para uso dentro da extensão**.

## Referências

[1]: <https://github.com/facebookresearch/demucs> "Meta Demucs — repositório oficial"
[2]: <https://github.com/timcsy/demucs-web> "demucs-web — referência ONNX/WebGPU/WASM"
[3]: <https://github.com/deezer/spleeter> "Deezer Spleeter — separação de fontes"
[4]: <https://github.com/k2-fsa/sherpa-onnx> "sherpa-onnx — runtime offline Apache-2.0"
[5]: <https://k2-fsa.github.io/sherpa/onnx/source-separation/models.html> "sherpa-onnx — modelos Spleeter e UVR"
[6]: <https://commons.wikimedia.org/wiki/File:White_House_Millennium_Lecture_Series_-_-2_-_Stephen_Hawking30s.ogg> "Palestra pública usada como smoke test"
