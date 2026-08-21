# Avaliação do texto sobre vozes neurais para a S·IA

## 1. Veredito executivo

O texto faz sentido como **mapa inicial de alternativas**, mas mistura fatos corretos, simplificações técnicas e algumas afirmações que não devem ser usadas como base de arquitetura ou de comunicação comercial.

A premissa principal é válida: a S·IA atual usa `window.speechSynthesis`, `SpeechSynthesisUtterance` e `getVoices()`, portanto a disponibilidade e a qualidade das vozes dependem do ambiente do usuário. A documentação do navegador descreve `getVoices()` como a lista de vozes disponíveis no dispositivo atual, e não como um catálogo neural uniforme fornecido pela extensão. [1] [2]

A conclusão recomendada é:

> **Não substituir o mecanismo atual agora. Manter `speechSynthesis` como caminho padrão e preparar uma arquitetura de provedores de voz opt-in, com Piper local como primeira candidata neural experimental.**

Isso preserva a funcionalidade já validada e permite evoluir a qualidade sem transformar a versão estável em um projeto de infraestrutura de IA.

## 2. O que no texto está correto

| Afirmação do texto | Avaliação | Observação aplicada à S·IA |
|---|---|---|
| `window.speechSynthesis` depende das vozes disponíveis no ambiente | **Correta** | A S·IA lista as vozes retornadas por `speechSynthesis.getVoices()` e seleciona uma voz do navegador/sistema. [1] [2] |
| Vozes podem variar entre navegador, sistema operacional e dispositivo | **Correta** | Essa variação é uma limitação do modelo atual e não é controlada pela extensão. |
| É possível executar modelos TTS localmente no navegador | **Correta** | Transformers.js usa ONNX Runtime no browser e suporta tarefas de text-to-speech. [3] |
| WebGPU pode acelerar inferência local | **Correta com ressalva** | Há opção `device: 'webgpu'`, mas a própria documentação informa que WebGPU ainda é experimental em muitos navegadores. [3] |
| Piper pode ser usado em implementações web baseadas em WASM/ONNX | **Tecnicamente viável** | Existe implementação browser baseada em ONNX Runtime; o primeiro uso baixa o modelo e pode armazená-lo localmente. [4] |
| Uma solução em nuvem pode oferecer maior previsibilidade de qualidade | **Geralmente correta** | Porém introduz rede, custo, privacidade, disponibilidade, chaves, quotas e dependência de fornecedor. |
| Edge TTS por engenharia reversa não é uma fundação segura | **Correta** | O projeto `edge-tts` usa um serviço online do Edge; isso não equivale a uma API pública oficial para extensões. [5] |

## 3. O que precisa ser corrigido no texto

### 3.1 “Windows comum sempre tem vozes antigas e robóticas”

Essa frase é forte demais. A API retorna as vozes disponíveis no dispositivo atual; elas podem ser locais, instaladas posteriormente ou fornecidas por diferentes componentes do ambiente. Não é tecnicamente seguro afirmar que todo Windows terá voz robótica ou que todo Edge disponibilizará determinada voz neural para qualquer uso da Web Speech API. [1]

O recurso **Read Aloud** do Edge é uma funcionalidade do produto Edge. A página oficial menciona vozes e sotaques variados, incluindo vozes naturais em determinados contextos, mas informa que disponibilidade e funcionalidade podem variar conforme dispositivo, mercado e versão do navegador. Isso não prova que uma extensão Chrome possa acessar diretamente essas vozes por `window.speechSynthesis`. [6]

A formulação correta para a S·IA seria: “A qualidade e a disponibilidade da voz nativa dependem das vozes expostas pelo navegador e pelo sistema operacional do usuário.”

### 3.2 “Transformers.js é uma solução pronta para VITS no browser”

Transformers.js torna possível executar modelos ONNX no browser, inclusive modelos de áudio e text-to-speech, mas não é automaticamente uma solução pronta para a fila da S·IA. A integração ainda precisa resolver carregamento do modelo, cache, worker, geração de waveform, conversão para reprodução, cancelamento, eventos de início/fim, latência e sincronização com as cues. A documentação recomenda quantização em ambientes restritos e registra que WebGPU ainda tem caráter experimental em muitos navegadores. [3]

Além disso, um modelo de TTS não é apenas uma biblioteca JavaScript. É necessário escolher um modelo compatível, conferir idioma, licença, tamanho, qualidade, vocoder/phonemizer e forma de distribuição.

### 3.3 “Piper é VITS comprimido de 15 MB a 25 MB”

A ideia de que Piper é rápido e local é útil, mas o tamanho apresentado não deve ser tratado como regra. Um modelo PT-BR consultado, `piper-pt-br-faber-medium`, informa aproximadamente **63 MB em ONNX**, além de arquivos de configuração e dependências de execução. Esse tamanho pertence a esse modelo específico; outras vozes e quantizações podem ser diferentes. [7]

Também é necessário separar três licenças: licença do código do runtime, licença do modelo e licença dos dados/voz. O repositório atual do Piper está em `OHF-Voice/piper1-gpl`, exibe GPL-3.0 e informa que o desenvolvimento saiu do repositório antigo, que foi arquivado. O fato de uma voz específica ser CC0, como no modelo consultado, não transforma automaticamente todo o runtime e todas as vozes em CC0 ou em licença comercial irrestrita. [8] [7]

### 3.4 “BYOK deixa a extensão leve e resolve a qualidade”

BYOK pode ser uma boa opção premium, mas não é uma solução simples para a linha gratuita. A chave informada pelo usuário precisa ser armazenada, protegida e utilizada em chamadas de rede. A extensão terá de tratar CORS, endpoints, erros, rate limit, timeouts, cache, interrupção de áudio, custos inesperados e vazamento acidental do texto da legenda para o provedor.

Uma chave BYOK não cria custo para a S·IA, mas cria risco e responsabilidade para o usuário. A experiência precisa deixar claro que as legendas serão enviadas ao serviço escolhido e que o consumo será cobrado pelo respectivo provedor.

### 3.5 “Edge TTS gratuito”

Não deve ser usado como base do produto. O projeto `edge-tts` é apresentado como módulo que usa o serviço online de text-to-speech do Microsoft Edge, e não como SDK oficial da Microsoft para uma extensão Chrome. [5]

Mesmo que funcione tecnicamente durante algum tempo, engenharia reversa pode quebrar sem aviso, sofrer bloqueio, não oferecer garantias de quota ou disponibilidade e criar risco de termos de uso e distribuição. Para uma extensão que pretende crescer ou ser monetizada, é uma dependência inadequada.

## 4. Avaliação das quatro rotas na S·IA

### 4.1 Manter `speechSynthesis` como padrão

| Critério | Avaliação |
|---|---|
| Compatibilidade com a S·IA atual | **Excelente** |
| Alteração de código | Nenhuma |
| Latência | Geralmente baixa |
| Tamanho do pacote | Praticamente zero adicional |
| Privacidade | Melhor cenário do desenho atual |
| Qualidade previsível | Baixa a média, variável |
| Escalabilidade operacional | Excelente, pois não há servidor nem modelo para distribuir |
| Decisão | **Manter como baseline estável** |

Esse mecanismo já está integrado à fila de fala, à calibração de duração, à sincronização adaptativa, ao pitch, ao volume, ao idioma, ao replay e ao Companion. A extensão deve continuar funcionando mesmo que nenhum modelo neural esteja instalado.

### 4.2 Transformers.js + ONNX/WebGPU

| Critério | Avaliação |
|---|---|
| Qualidade potencial | Alta, dependendo do modelo |
| Tamanho inicial | Médio ou alto; depende de pesos e quantização |
| Compatibilidade | Variável por CPU, memória e WebGPU |
| Complexidade de integração | Alta |
| Privacidade | Boa após o modelo estar local |
| Primeira execução | Pode ter download e aquecimento demorados |
| Escalabilidade | Boa como recurso opcional, ruim como caminho obrigatório |
| Decisão | **P&D posterior, não primeira entrega de produção** |

É uma rota interessante para prototipagem de modelos modernos, mas a S·IA precisa de leitura contínua de frases curtas e respostas de baixa latência. Gerar o áudio de cada cue com um pipeline neural no thread principal pode causar atraso, consumo de memória e concorrência com a página do Coursera. O caminho correto exigiria Web Worker, cache local, cancelamento e uma camada de áudio independente.

### 4.3 Piper + WASM/ONNX

| Critério | Avaliação |
|---|---|
| Qualidade potencial | Média a boa, dependente da voz |
| Desempenho | Promissor em CPU, mas precisa ser medido no browser |
| Privacidade | Excelente quando o modelo está local |
| Tamanho | Relevante; um modelo PT-BR consultado tem cerca de 63 MB ONNX |
| Complexidade | Média/alta |
| Licença | Exige auditoria separada de runtime, modelo, voz e dependências |
| Escalabilidade | Boa como provedor opcional versionado |
| Decisão | **Melhor primeira candidata neural local** |

Piper se alinha melhor à filosofia “local-first” da S·IA do que uma API externa. Porém, não deve ser embutido diretamente em `content.js`. O motor deveria rodar em um Web Worker ou contexto isolado, gerar áudio para uma fila própria e comunicar eventos de início, fim e erro ao controlador. O primeiro modelo deveria ser pequeno, licenciado de forma compatível com o produto e testado especificamente em PT-BR.

Uma observação importante: se o modelo for baixado de Hugging Face ou de outro domínio no primeiro uso, a experiência não será offline desde a instalação. Para cumprir a promessa de distribuição totalmente local, o modelo precisa ser empacotado ou provisionado por um processo explicitamente documentado. Empacotar um modelo de dezenas de megabytes também afeta atualização, download da Chrome Web Store e uso de armazenamento.

### 4.4 BYOK com API neural

| Critério | Avaliação |
|---|---|
| Qualidade | Alta, conforme provedor |
| Tamanho do cliente | Pequeno |
| Privacidade | Fraca por padrão, porque texto sai do dispositivo |
| Custo para a S·IA | Baixo ou zero, se o usuário paga diretamente |
| Complexidade de produto | Alta em segurança, UX e suporte |
| Dependência externa | Alta |
| Escalabilidade | Boa tecnicamente, mas com suporte e risco operacional maiores |
| Decisão | **Somente como modo premium claramente opt-in** |

BYOK é mais produtivo depois que a S·IA possuir uma abstração formal de provedores, política de privacidade atualizada e uma experiência para testar conexão, quota e custos. Não deve alterar o modo local padrão nem enviar legendas sem consentimento explícito.

### 4.5 Edge TTS não oficial

| Critério | Avaliação |
|---|---|
| Qualidade aparente | Alta em algumas vozes |
| Estabilidade | Baixa |
| Oficialidade | Não é uma API pública de extensão |
| Licenciamento/termos | Incerto para uso comercial |
| Dependência externa | Alta e frágil |
| Decisão | **Não recomendar** |

## 5. O que é funcional, relevante, produtivo e escalável

### Funcional agora

O que já é funcional na S·IA é manter `speechSynthesis` como provedor principal e melhorar a seleção da melhor voz disponível, sem prometer que todas as vozes serão neurais. O código atual já aproveita corretamente idioma, voz, taxa, pitch, volume, eventos, fila e calibração. Essa solução tem a menor superfície de falha.

Também é funcional criar um diagnóstico de voz no pop-up: nome, idioma, `localService`, disponibilidade e resultado do teste. Isso não produz uma voz neural, mas permite descobrir se o usuário possui uma voz de melhor qualidade instalada.

### Relevante para o produto

A possibilidade de uma voz neural local é relevante porque o diferencial da S·IA depende de compreensão e conforto durante cursos longos. O caminho local também preserva a promessa de privacidade e evita custos recorrentes por caractere.

O recurso mais relevante não é simplesmente “ter IA no áudio”. É garantir que a voz neural conserve as propriedades que já fazem a S·IA funcionar: início/fim determinísticos, taxa ajustável, cancelamento, fila, replay, pausa, erro recuperável e sincronização com o vídeo.

### Produtivo no curto prazo

A ação mais produtiva é criar uma **camada de provedor de voz sem ativá-la por padrão**, em uma branch separada ou feature flag. O contrato mínimo pode ser:

```text
provider.prepare(text, options) -> áudio ou handle
provider.play(handle)            -> eventos start/end/error
provider.cancel(handle)
provider.isAvailable()
provider.getVoices()
```

O provedor atual continua sendo o adaptador `BrowserSpeechProvider`. O futuro Piper seria `PiperLocalProvider`. A fila e a sincronização poderiam continuar sendo responsabilidades do controlador, mas o provedor precisaria expor eventos equivalentes aos eventos atuais de `SpeechSynthesisUtterance`.

Essa abstração exige alguma alteração futura no ponto em que `content.js` cria e envia a utterance. Portanto, se o requisito for literalmente “nenhuma alteração no código existente”, a alternativa correta agora é apenas prototipar Piper fora do fluxo de produção. Uma substituição neural real inevitavelmente precisa de uma pequena integração no controlador da fala; ela não deve ser feita por monkey patch de `speechSynthesis`.

### Escalável no médio prazo

A arquitetura escalável é híbrida e opt-in:

```text
BrowserSpeechProvider  ← padrão, estável e sem download
        │
        ├── PiperLocalProvider ← opcional, local e neural
        │
        └── CloudProvider      ← opcional, BYOK e com consentimento
```

O estado do provedor deve ser independente do estado de detecção de legendas. O fallback DOM recentemente adicionado deve continuar apenas entregando texto ao pipeline; ele não deve saber se a fala será produzida pelo navegador, Piper ou nuvem.

A distribuição deve usar carregamento sob demanda. O bundle inicial deve conter apenas o provedor nativo e o código de seleção; o modelo local e seus binários devem ser baixados ou instalados somente quando o usuário optar por ativá-los. Se a exigência for funcionamento sem rede desde o primeiro uso, o modelo terá de ser incluído no pacote, com impacto real no tamanho e na publicação.

## 6. Roadmap recomendado

| Fase | Entrega | Risco |
|---|---|---|
| 0 | Medir vozes nativas disponíveis e registrar métricas de início, duração, erro e atraso | Baixo |
| 1 | Introduzir contrato de provedor em branch separada, mantendo `BrowserSpeechProvider` como padrão | Médio |
| 2 | Prototipar Piper PT-BR fora do fluxo principal, com Web Worker e reprodução de áudio | Médio/alto |
| 3 | Testar 100, 500 e 1.000 frases em máquinas fracas, com pausa, replay e troca de cue | Alto |
| 4 | Adicionar `PiperLocalProvider` atrás de feature flag e fallback automático para a voz nativa | Alto |
| 5 | Só depois avaliar BYOK, com consentimento, política de privacidade e controle de custos | Alto |

A Fase 0 é a mais produtiva imediatamente. Antes de carregar dezenas de megabytes e introduzir uma segunda fila de áudio, é necessário saber quantos usuários realmente recebem voz inadequada e qual o impacto percebido.

## 7. Recomendação final para a S·IA

O texto deve ser aceito como direção de pesquisa, mas não como especificação pronta. A decisão recomendada é:

1. **Preservar integralmente o fluxo atual** e manter `speechSynthesis` como fallback permanente.
2. **Não usar Edge TTS por engenharia reversa** em uma versão comercial ou escalável.
3. **Não assumir que qualquer Piper é MIT, pequeno ou automaticamente liberado para uso comercial**; auditar runtime, modelo, voz e dependências.
4. **Investigar Piper + WASM/ONNX como primeira opção neural local**, isolado em worker e ativado de forma opt-in.
5. **Deixar Transformers.js/WebGPU para uma etapa de P&D**, pois sua flexibilidade vem com maior complexidade e variabilidade de hardware.
6. **Reservar BYOK para uma modalidade premium**, com aviso explícito de transmissão de texto e cobrança do provedor.
7. **Manter o fallback DOM independente do provedor TTS**, para que mudanças no player e evolução das vozes não se misturem em uma única área frágil.

Em uma frase: **para a S·IA, o caminho funcional e seguro é manter o navegador como base, preparar uma interface de provedores e testar Piper local como extensão opcional; o caminho mais escalável não é apostar em uma API não oficial nem substituir de uma vez o núcleo já validado.**

## Relação com o código da S·IA

A implementação atual analisada usa `speechSynthesis.getVoices()`, `SpeechSynthesisUtterance`, `speechSynthesis.speak()` e `speechSynthesis.cancel()` em `content.js` e `popup.js`. O motor de sincronização (`sync-engine.js`) não depende de uma voz específica e pode continuar sendo reutilizado, desde que um futuro provedor neural exponha eventos de duração, início, fim e erro equivalentes. [9] [10]

## Referências

[1]: [MDN — `SpeechSynthesis.getVoices()`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis/getVoices) — lista de vozes disponíveis no dispositivo atual.

[2]: [Chrome Developers — Introduction to the Speech Synthesis API](https://developer.chrome.com/blog/web-apps-that-talk-introduction-to-the-speech-synthesis-api) — configuração de voz, idioma, taxa, pitch, volume e necessidade de feature detection.

[3]: [Hugging Face — Transformers.js](https://huggingface.co/docs/transformers.js/en/index) — ONNX Runtime no browser, text-to-speech, WASM, WebGPU e quantização.

[4]: [npm — `@mintplex-labs/piper-tts-web`](https://www.npmjs.com/package/@mintplex-labs/piper-tts-web) — implementação browser baseada em Piper/ONNX e cache local do modelo.

[5]: [GitHub — `rany2/edge-tts`](https://github.com/rany2/edge-tts) — módulo que utiliza o serviço online de text-to-speech do Edge.

[6]: [Microsoft Edge — Read Aloud](https://explore.microsoft.com/en-us/edge/features/read-aloud) — vozes naturais, opções e variação por dispositivo, mercado e versão.

[7]: [Hugging Face — modelo Piper PT-BR Faber Medium](https://huggingface.co/Trelis/piper-pt-br-faber-medium) — exemplo de modelo VITS PT-BR em ONNX, aproximadamente 63 MB e licença CC0 declarada para esse modelo específico.

[8]: [GitHub — `OHF-Voice/piper1-gpl`](https://github.com/OHF-voice/piper1-gpl) — repositório atual do Piper, GPL-3.0, estado e documentação do runtime.

[9]: `extracted/tts-extension/content.js` — integração atual com a Web Speech API, fila e sincronização.

[10]: `extracted/tts-extension/sync-engine.js` — duração estimada, taxas adaptativas e limites.
