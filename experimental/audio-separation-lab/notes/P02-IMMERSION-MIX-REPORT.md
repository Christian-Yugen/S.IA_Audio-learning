# Preview de imersão P02 — Spleeter FP16

## O que foi simulado

A faixa `accompaniment.wav` do Spleeter foi usada como ambiente/acompanhamento e a faixa `vocals.wav` foi usada como narração de teste. Essa narração não é a voz neural da S·IA; ela representa apenas uma fonte vocal para validar o grafo de mistura.

O preview aplicou atraso de 180 ms à narração, reduziu o acompanhamento durante a fala com compressor sidechain e recompôs as duas faixas. O objetivo foi verificar a mecânica de ducking, não medir a qualidade final da experiência.

| Campo | Resultado |
|---|---:|
| Entrada ambiente | Spleeter `accompaniment.wav` |
| Entrada de narração | Spleeter `vocals.wav` |
| Atraso de teste | 180 ms |
| Redução dinâmica | threshold 0,08; ratio 8; attack 20 ms; release 250 ms |
| Saída | WAV PCM16 estéreo, 44.100 Hz |
| Duração | 11,099 s, incluindo o atraso |
| Estado | Grafo validado |

## Correção aplicada

A primeira tentativa falhou porque a mesma etiqueta de áudio foi consumida pelo compressor e reutilizada no mixer. O grafo foi corrigido com `asplit`, mantendo uma cópia da narração para o sidechain e outra para a saída. O preview final foi gerado sem erro.

## Limitações

Este preview não valida sincronização com captions, atraso de Piper, captura da aba, AudioContext, proteção contra falhas ou recuperação do áudio original. Também não permite concluir se a redução da fala original é suficiente, pois depende da qualidade do acompanhamento separado. A próxima validação precisa usar uma faixa de fala da S·IA sincronizada a timestamps reais e amostras de aulas autorizadas.
