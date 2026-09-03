# Smoke test P02 — Spleeter FP16 via sherpa-onnx

## Identificação

A rodada usa `audio_example.wav`, arquivo de teste publicado na documentação de source separation do sherpa-onnx. Ele tem 10,919 segundos, estéreo, PCM16 e 44.100 Hz. O arquivo é tratado como material de teste do fornecedor; sua licença de redistribuição ainda não foi comprovada e ele não será incluído no pacote da extensão.

Foram usados os modelos `vocals.fp16.onnx` e `accompaniment.fp16.onnx`, baixados do release oficial `source-separation-models`. Os pesos ficam em diretório ignorado e seus hashes são mantidos em `notes/spleeter-sherpa-artifacts.sha256`.

## Execução válida

| Campo | Resultado |
|---|---:|
| Modelos | Spleeter 2-stems FP16 |
| Backend | ONNX Runtime Node, CPU |
| Entrada | WAV PCM16, estéreo, 44.100 Hz |
| Duração | 10,919 s |
| STFT | FFT 4096, hop 1024, janela Hann, sem centralização |
| Frames | 471 |
| Splits | 1 |
| Separação | 1,030 s |
| Tempo total | 1,297 s |
| Fator de tempo real | 0,094× |
| Pico de RSS registrado | 311.560 KB, aproximadamente 304 MiB |
| Clipping em `vocals` | 0 amostras |
| Clipping em `accompaniment` | 2 amostras, após arredondamento PCM |

## Correção do adaptador

A primeira implementação usou acidentalmente o tensor bruto do modelo como fator de ganho durante a reconstrução, produzindo stems com RMS artificialmente alto e clipping massivo. O diagnóstico confirmou que as máscaras normalizadas estavam entre 0 e 1. O executor foi corrigido para aplicar apenas a máscara, e a segunda execução produziu amplitudes compatíveis com a entrada.

Esse erro pertenceu exclusivamente ao adaptador de benchmark do laboratório. Não houve alteração em nenhum arquivo da extensão S·IA.

## Interpretação provisória

O Spleeter FP16 é muito mais leve e rápido que o HT-Demucs no ambiente atual, o que o torna um candidato melhor para experimentos de latência e possível execução local. Entretanto, velocidade não comprova qualidade. Ainda é necessário ouvir os dois stems, medir vazamento de voz e testar falas sobre música, efeitos e ambiente.

O arquivo de teste é um exemplo de separação musical e não uma aula. Portanto, o resultado não autoriza uma decisão sobre cursos, português-BR, sincronização com captions ou uso em tempo real dentro do Chrome.

## Próximas ações

1. Gerar prévias leves dos dois stems para avaliação auditiva.
2. Comparar o Spleeter com o HT-Demucs em uma mesma amostra mista autorizada.
3. Auditar a licença dos pesos e do arquivo de teste antes de qualquer redistribuição.
4. Repetir em pelo menos três trechos reais de aulas fornecidos pelo usuário.

## Referências

[1]: <https://k2-fsa.github.io/sherpa/onnx/source-separation/models.html> "sherpa-onnx — modelos de separação e exemplos Spleeter"
[2]: <https://github.com/k2-fsa/sherpa-onnx> "sherpa-onnx — runtime Apache-2.0"
[3]: <https://github.com/deezer/spleeter> "Deezer Spleeter — código e documentação"
