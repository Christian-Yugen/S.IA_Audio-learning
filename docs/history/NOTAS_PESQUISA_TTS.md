# Notas de pesquisa para análise do texto TTS

Data da consulta: 21 de agosto de 2026.

## Fontes e fatos relevantes

1. MDN `SpeechSynthesis.getVoices()` — https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices
   - `getVoices()` retorna as vozes disponíveis no dispositivo atual.
   - A disponibilidade concreta depende do dispositivo/browser; a API não define uma voz neural uniforme para todos.

2. Chrome Developers, Web Speech API — https://developer.chrome.com/blog/web-apps-that-talk-introduction-to-the-speech-synthesis-api
   - `SpeechSynthesisUtterance` permite configurar voz, idioma, volume, taxa e pitch.
   - O post recomenda feature detection porque partes da Web Speech API podem variar entre implementações Chromium.

3. Microsoft Edge Read Aloud — https://explore.microsoft.com/en-us/edge/features/read-aloud
   - O Edge oferece várias vozes e sotaques e menciona vozes naturais.
   - A própria página informa que disponibilidade e funcionalidade podem variar conforme dispositivo, mercado e versão do browser.
   - Isso não é uma API pública de integração da extensão.

4. Transformers.js — https://huggingface.co/docs/transformers.js/en/index
   - Executa modelos no browser por ONNX Runtime.
   - Suporta áudio, incluindo text-to-speech.
   - Pode rodar em CPU via WASM ou usar `device: 'webgpu'`.
   - A documentação recomenda quantização em ambientes limitados; WebGPU é descrito como experimental em muitos browsers.

5. Piper atual — https://github.com/OHF-voice/piper1-gpl
   - O projeto atual é o repositório `OHF-voice/piper1-gpl`; o antigo `rhasspy/piper` foi arquivado em 6 de outubro de 2025.
   - É descrito como motor TTS neural rápido e local, com CLI, servidor, API Python e API C/C++.
   - O repositório atual mudou para GPLv3; isso torna incorreta a afirmação genérica de que todo Piper possui licença comercial aberta sem analisar código, modelo e voz separadamente.

6. Implementação web baseada em Piper — https://www.npmjs.com/package/@mintplex-labs/piper-tts-web
   - Há implementação para browser/Electron baseada em ONNX Runtime.
   - Os modelos são baixados no primeiro uso e armazenados no Origin Private File System.
   - A biblioteca permite configurar caminhos locais de WASM para uso offline após provisionamento.
   - A página informa que é frontend e não funciona em Node.js.

7. Modelo Piper PT-BR consultado — https://huggingface.co/Trelis/piper-pt-br-faber-medium
   - Exemplo de voz masculina PT-BR em ONNX, VITS, 22.05 kHz.
   - O modelo consultado informa aproximadamente 63 MB de arquivo ONNX e licença CC0, mas isso é uma propriedade desse modelo específico, não de todos os modelos Piper.

8. edge-tts — https://github.com/rany2/edge-tts
   - É um módulo Python que utiliza o serviço online de text-to-speech do Microsoft Edge.
   - O próprio projeto o apresenta como uso de um serviço online; não constitui uma API oficial de extensão Chrome nem uma garantia de estabilidade/licenciamento comercial.

## Relação com a S·IA atual

A S·IA usa `speechSynthesis.getVoices()`, `SpeechSynthesisUtterance` e `speechSynthesis.speak()` no `content.js` e no `popup.js`. Portanto, a tese geral de que a voz varia conforme navegador, sistema e vozes instaladas é relevante. Nenhuma das fontes consultadas justifica afirmar que Windows sempre oferece vozes robóticas, nem que Edge injeta automaticamente uma voz neural de nuvem em toda utilização da Web Speech API.

As alternativas locais seriam uma nova camada de áudio, não apenas uma troca de voz: Transformers.js + modelo TTS exige ONNX Runtime, modelo, cache, possível WebGPU/WASM, conversão dos chunks de áudio para reprodução e controle de fila; Piper no browser exige WASM, espeak/phonemizer e modelos/arquivos auxiliares, além de licenças separadas. BYOK reduz o tamanho do cliente, mas exige rede, gestão de segredo, política de privacidade e tratamento de custos/limites. Edge TTS por engenharia reversa é inadequado como fundação escalável ou comercial sem autorização/licença apropriada.

## Confirmações por navegação direta

9. Navegação direta na documentação Transformers.js — https://huggingface.co/docs/transformers.js/en/index
   - A documentação confirma text-to-speech entre as tarefas de áudio.
   - O runtime usa ONNX Runtime no browser, com CPU/WASM por padrão e opção WebGPU.
   - Quantização é recomendada para ambientes com recursos limitados; WebGPU permanece experimental em muitos browsers.

10. Navegação direta no Piper atual — https://github.com/OHF-voice/piper1-gpl
   - Repositório atual `OHF-Voice/piper1-gpl`, com release 1.7.0 em 15 de agosto de 2026.
   - A página mostra GPL-3.0 e descreve o motor como local/neural, incorporando espeak-ng para fonemização.
   - O código e os modelos/vozes não devem ser tratados como uma única licença: é necessário auditar cada componente antes de comercializar ou redistribuir.

11. Modelo PT-BR consultado — https://huggingface.co/Trelis/piper-pt-br-faber-medium
   - O modelo específico apresenta aproximadamente 63 MB em ONNX, 15M de parâmetros, VITS, 22.05 kHz e CC0.
   - Esse tamanho e licença são do modelo Faber consultado, não uma garantia para qualquer voz Piper.

12. OpenVoice oficial — https://github.com/myshell-ai/OpenVoice
   - V1 e V2 são anunciados sob MIT e com uso comercial permitido.
   - O V2 lista suporte nativo a inglês, espanhol, francês, chinês, japonês e coreano; não lista português brasileiro como idioma nativo.
   - Portanto, a licença do código é favorável, mas ele não atende diretamente ao requisito de PT-BR sem verificar um checkpoint/modelo adequado e a qualidade correspondente. O projeto também é orientado a voice cloning, não necessariamente ao menor runtime para uma extensão.

13. MeloTTS oficial — https://github.com/myshell-ai/MeloTTS
   - O repositório informa licença MIT e uso comercial/non-commercial.
   - Os idiomas listados são inglês, espanhol, francês, chinês, japonês e coreano; não há PT-BR listado.
   - O projeto é majoritariamente Python e sua documentação menciona inferência em CPU, mas isso não equivale a um pacote browser/WASM pronto para a S·IA.

14. sherpa-onnx — https://k2-fsa.github.io/sherpa/onnx/tts/all/
   - A documentação lista modelos TTS para português, incluindo `vits-piper-pt_BR-cadu-medium`, `vits-piper-pt_BR-dii-high`, `vits-piper-pt_BR-edresson-low`, `vits-piper-pt_BR-faber-medium`, `vits-piper-pt_BR-jeff-medium`, `vits-piper-pt_BR-miro-high` e `supertonic-3-pt`.
   - A página de catálogo confirma existência de modelos PT-BR no ecossistema ONNX, mas a licença de cada artefato ainda precisa ser auditada no model card antes de redistribuição comercial.

15. Supertonic oficial — https://github.com/supertone-inc/supertonic
   - É apresentado como TTS multilíngue local/on-device, baseado em ONNX Runtime, sem nuvem/API.
   - O repositório possui implementação Web e tags WebGPU/ONNX; a documentação descreve suporte a Portuguese e outras línguas.
   - A versão/release e o README precisam ser conferidos quanto à licença efetiva e ao modelo exato antes da decisão final; a página mostrada indica licença MIT no repositório.
   - É candidato particularmente forte para a S·IA porque combina PT, ONNX, execução local e um runtime web oficial, podendo reduzir o trabalho de portar Piper para WASM.

16. A URL específica de exemplo para o modelo `vits-piper-pt_BR-dii-high` no catálogo sherpa-onnx retornou 404, então não foi usada como prova de tamanho/licença. A existência do modelo foi tomada apenas da página oficial do catálogo.

17. Model card oficial do Supertonic 3 — https://huggingface.co/Supertone/supertonic-3
   - O modelo tem tags Text-to-Speech, Supertonic, ONNX, on-device e 31 languages.
   - A licença declarada do modelo é OpenRAIL-M, não MIT.
   - O model card informa que o modelo é utilizável comercialmente, mas com restrições baseadas no uso; a licença do modelo deve ser lida antes da redistribuição.

18. Página oficial Supertonic 3 — https://supertonic3.github.io/
   - Descreve o Supertonic 3 como modelo open-weight de 99M parâmetros, executado localmente em CPU via ONNX Runtime, sem GPU, cloud ou API.
   - Declara execução no browser ou totalmente offline.
   - Declara 31 idiomas e OpenRAIL-M.
   - A página ressalta expressamente que OpenRAIL-M não é equivalente a MIT: há restrições downstream, exigência de atribuição e proibições como dano/impersonação sem consentimento.
   - A página possui guia/aba Web, tornando-o um candidato melhor para prototipagem browser que Piper puro, embora a licença seja mais restritiva que MIT/Apache.

19. Página/model card do Supertonic 3 — https://supertonic3.github.io/ e https://huggingface.co/Supertone/supertonic-3
   - A página oficial lista Portuguese (PT) entre 31 idiomas, 99M parâmetros, CPU-only, ONNX Runtime e execução no browser/offline.
   - A página oficial declara que o modelo pesa 99M parâmetros e que a inferência é local em CPU, sem cloud/API.
   - O model card declara OpenRAIL-M para os pesos. O runtime/package e exemplos são MIT, mas isso não torna os pesos MIT.
   - OpenRAIL-M permite uso comercial com restrições baseadas em uso, obrigação de atribuição e restrições contra dano/impersonação sem consentimento. Portanto, atende uso comercial condicionado, mas não é licença permissiva irrestrita.
   - O site oficial possui runtime Web e exemplos upstream, tornando Supertonic 3 o candidato mais direto para protótipo de TTS local no navegador entre os modelos pesquisados.
   - Os benchmarks publicados pelo projeto indicam RTF 0,200 / 5x em uma CPU de 16 threads; isso é benchmark do autor e deve ser revalidado em máquinas reais dos usuários, especialmente em CPUs móveis ou de poucos threads.

20. Exemplo Web oficial do Supertonic — https://github.com/supertone-inc/supertonic/tree/main/web
   - A implementação web usa ONNX Runtime Web e Web Audio API.
   - O README do exemplo declara execução no browser sem servidor para inferência, suporte WebGPU com fallback automático para WebAssembly, 31 idiomas e presets de voz.
   - O exemplo requer modelos ONNX e arquivos de voice styles em `assets/onnx/` e `assets/voice_styles/`.
   - O `web/package.json` lista `onnxruntime-web` e `fft.js`; o projeto usa Vite para desenvolvimento/build.
   - O exemplo alerta para problemas de memória e que WebAssembly pode ser mais lento que WebGPU; isso é relevante para uso dentro de uma extensão, onde o Coursera já consome recursos.

21. sherpa-onnx oficial — https://github.com/k2-fsa/sherpa-onnx
   - O repositório é descrito como speech-to-text/text-to-speech local/offline e suporta WebAssembly; a página exibe licença Apache-2.0.
   - A documentação também menciona uso de modelos Supertonic TTS e correções no frontend para diacríticos em línguas latinas não inglesas, o que é relevante para PT.

22. sherpa-onnx WebAssembly TTS — https://k2-fsa.github.io/sherpa/onnx/tts/wasm/index.html
   - Há documentação oficial para compilar TTS do sherpa-onnx para WebAssembly e rodar no browser.
   - O caminho exige build com Emscripten e provisionamento dos modelos; não é um pacote pronto de uma linha, mas existe uma trilha técnica documentada.

23. Model card Piper PT-BR `cadu` — https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_BR/cadu/medium/MODEL_CARD
   - Declara idioma `pt_BR` (Portuguese, Brazil), um único speaker, qualidade medium e 22.050 Hz.
   - Declara licença CC0 para o dataset de treinamento associado ao card.
   - O repositório de vozes aparece com licença MIT no nível do dataset/repositório, mas runtime, voz e modelo devem continuar sendo verificados separadamente.

24. Verificação de `pt_BR/dii/high/MODEL_CARD` — URL consultada em `https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_BR/dii/high/MODEL_CARD`
   - A URL retornou 404; não foram inferidas licença, tamanho ou qualidade para a voz `dii high`.
   - A recomendação não deve depender de uma voz Piper específica sem baixar e testar o artefato e conferir o card correspondente.
