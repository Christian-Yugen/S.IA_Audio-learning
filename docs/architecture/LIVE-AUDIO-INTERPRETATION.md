# Proposta: tradução de vídeo sem legendas

Estado: desenho de engenharia; NÃO implementado nem validado na 1.11.1.
Pedido: 25/10/2026 — transcrever, traduzir para português e falar a partir do
áudio do vídeo, inclusive quando não há legendas/transcrição.

## Experiência pretendida

Um comando "Traduzir áudio deste vídeo" inicia a sessão após o gesto exigido
pelo Chrome. Mostrar fonte (legendas ou áudio), idiomas, aquecimento, atraso
medido e botão parar. Quando uma legenda temporal confiável existir, preservar
o caminho atual; quando faltar, oferecer reconhecimento do áudio como modo
separado. Não ativar captura escondida nem trocar a fonte no meio da frase.

## O limite de latência

1 ms de áudio a 16 kHz contém apenas 16 amostras: não contém uma palavra completa.
Transcrição e tradução precisam de contexto; texto parcial pode mudar. Não se
promete 1 ms ou atraso zero de áudio → fala traduzida. Medir separadamente:
primeiro texto parcial, texto confirmado, tradução e início de áudio traduzido.
A aceitação será por P50/P95 e qualidade em hardware identificado, não por um
número inventado antes de executar o pipeline.

## Componentes

| Camada | Responsabilidade |
|---|---|
| Captura da aba | `chrome.tabCapture`, sessão por aba, gesto do usuário e limpeza em parar/fechar |
| Host offscreen | Captura e processamento sem depender do popup aberto; integrar ao host único existente |
| Preparação | PCM mono, taxa exigida pelo ASR, buffer limitado, detecção de fala e silêncio |
| Reconhecimento | Modelo ASR local em Worker; avaliar WebGPU e alternativa WASM no hardware real |
| Confirmação | Separar hipótese provisória de trecho confirmado; deduplicar fronteiras e preservar timestamps |
| Tradução | Texto confirmado em blocos com contexto; usar provedor local existente quando disponível |
| Fala | Mesmo núcleo Piper, fila e cancelamento; evitar narrar hipóteses que serão corrigidas depois |
| Diagnóstico | Modelo, idioma, fila, atrasos, falhas e ação para recuperar |

## Decisões que exigem prova de conceito

1. **Evitar realimentação:** tabCapture pode capturar o som emitido pela própria
   S·IA se a voz continuar saindo na aba do YouTube. A voz sintetizada deve sair
   por um destino separado da aba capturada, sem duplicar o núcleo de síntese.
2. **Não silenciar a entrada do ASR:** diminuir `video.volume` antes da captura
   também pode reduzir o sinal reconhecido. Separar ramo bruto para ASR e ramo
   de monitoração com ganho/ducking no host de áudio; não duplicar atenuações.
3. **Sincronia percebida não é latência zero:** uma pequena reserva pode alinhar
   tradução e imagem, mas simplesmente pausar/atrasar o mesmo elemento que
   alimenta o reconhecimento não cria áudio futuro. É necessário provar um
   caminho de captura/decodificação independente da apresentação atrasada.
   Começar pelo modo de interpretação com atraso explícito; só oferecer vídeo
   alinhado depois de comprovar esse caminho nas plataformas reais.
4. **Silêncio não é texto:** não emitir fala em silêncio/música sem voz e testar
   alucinações do ASR. Não narrar resultados provisórios instáveis.
5. **Ritmos diferentes:** tradução pode durar mais que o original; fila limitada,
   métricas de atraso e política clara sem descarte silencioso de conteúdo.
6. **Pausa/seek/troca de vídeo:** invalidar gerações antigas, limpar buffers,
   reiniciar relógio e impedir frase de uma aula na seguinte.
7. **Local primeiro:** empacotar código executável; validar modelo, tamanho,
   licença, RAM/VRAM e download inicial. Não reaproveitar o runtime TTS como ASR:
   o runtime atual oferece síntese, não reconhecimento de fala.

## Prova mínima antes de ativar no produto

- Vídeo inglês sem legendas: áudio → ASR → português → Piper, com timestamps.
- Vídeo já em português: ASR → Piper, sem tradução desnecessária.
- Ausência de legenda não interrompe a descoberta; o modo é identificado como ASR.
- Silêncio, música, sotaque, fala técnica e sobreposição de vozes.
- Nenhuma voz S·IA volta à entrada do reconhecedor.
- Pausa, seek, troca de vídeo e parada liberam microfone/aba/Worker/áudio.
- Não há frase duplicada, entrega antiga ou fila crescente sem limite.
- Medições com CPU/GPU, modelo e configurações registrados.
- Regressão do caminho por legendas preservada; implantação experimental isolada.

## Referências primárias consultadas

- https://developer.chrome.com/docs/extensions/reference/api/tabCapture
- https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture
- https://huggingface.co/docs/transformers.js/guides/webgpu
- https://github.com/ufal/whisper_streaming
- https://aclanthology.org/2023.ijcnlp-demo.3/

O artigo Whisper-Streaming demonstra uma técnica de confirmação de texto com
latência adaptativa. Seus resultados não são um benchmark da S·IA nem garantia
para o computador do usuário. Whisper não traduz diretamente qualquer idioma
para português; o pipeline deve manter a etapa de tradução para o destino.
