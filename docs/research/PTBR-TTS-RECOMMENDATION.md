# Recomendação de TTS neural PT-BR local para a S·IA

## Veredito direto

Não existe, entre as opções pesquisadas, um modelo que possa ser declarado simultaneamente **idêntico à voz humana, perfeito em PT-BR, totalmente open source, irrestrito para uso comercial, pequeno e pronto para ser embutido em uma extensão Chrome**. Esses requisitos entram em tensão: quanto mais natural e expressivo é o modelo, maior tende a ser o peso, a latência, a complexidade e a restrição de licença.

A melhor alternativa prática para a S·IA é:

> **`sherpa-onnx` em WebAssembly + uma voz Piper explicitamente `pt_BR`, executada dentro de um Web Worker, com os pesos distribuídos localmente e `speechSynthesis` mantido como fallback.**

Essa escolha é mais adequada que Kokoro para o problema específico apresentado porque a família Piper possui vozes identificadas como `pt_BR`, enquanto o Supertonic 3 usa um único código `pt` para português e os próprios mantenedores reconhecem que isso pode produzir pronúncia próxima do português europeu. [1] [2]

O melhor candidato moderno de segunda linha é o **Supertonic 3**. Ele possui runtime Web oficial, ONNX Runtime, execução local em CPU, 31 idiomas e suporte a português. Contudo, seus pesos estão sob OpenRAIL-M, não MIT/Apache, e há uma issue oficial relatando exatamente o risco de PT-BR soar como PT-PT. Portanto, ele é excelente para um protótipo comparativo, mas não deve ser tratado como solução perfeita de PT-BR. [3] [4] [5]

## A distinção mais importante: open source, open weights e uso comercial

É necessário separar quatro componentes: o runtime, os pesos do modelo, a voz/dataset e as dependências. Uma licença permissiva no código JavaScript não libera automaticamente os pesos ou a gravação da voz.

| Componente | Opção recomendada | Situação a auditar |
|---|---|---|
| Runtime no browser | `sherpa-onnx` | O repositório oficial exibe Apache-2.0 e documenta TTS em WebAssembly. [6] [7] |
| Voz PT-BR | Piper `pt_BR` | Os model cards devem ser arquivados junto ao produto; o card `cadu` declara `pt_BR`, qualidade medium, 22.050 Hz e CC0 para o dataset associado. [8] |
| Modelo alternativo | Supertonic 3 | Os pesos são OpenRAIL-M; uso comercial é declarado, mas com restrições de uso e atribuição. [3] |
| Runtime alternativo | Exemplo Web do Supertonic | O pacote web é MIT e usa `onnxruntime-web`, mas isso não muda a licença OpenRAIL-M dos pesos. [5] |

A recomendação comercial não deve ser “baixar um modelo e colocar na extensão”. É necessário guardar no repositório da S·IA a licença do runtime, o model card exato, a licença do dataset/voz, a versão do arquivo ONNX, os avisos de atribuição e o histórico de autorização. Em caso de publicação comercial, uma revisão jurídica específica continua sendo prudente.

## Comparação das alternativas

### 1. Piper PT-BR + sherpa-onnx WebAssembly — melhor base prática

O catálogo de modelos do sherpa-onnx lista várias vozes `pt_BR`, incluindo `cadu`, `dii`, `edresson`, `faber`, `jeff` e `miro`. Isso é importante porque a S·IA precisa de **português brasileiro explicitamente condicionado**, e não apenas do idioma genérico português. [1]

O sherpa-onnx possui licença Apache-2.0, suporte offline e documentação oficial para compilar TTS para WebAssembly. Ele também suporta modelos Piper e tem caminho web documentado. [6] [7] O modelo seria executado no navegador sem API, sem servidor e sem enviar as legendas para fora do dispositivo.

A voz `cadu` é um ponto inicial mais seguro para teste de licença: seu model card declara `pt_BR`, qualidade medium, 22.050 Hz e dataset CC0. [8] Isso não significa que seja “a voz mais natural” nem que todos os modelos Piper tenham a mesma licença. O produto deve escolher uma voz depois de teste auditivo nativo e auditoria do artefato exato.

| Critério | Avaliação |
|---|---|
| PT-BR explícito | **Sim** |
| Execução sem servidor | **Sim** |
| Browser/WebAssembly | **Sim, com build e integração** |
| Uso comercial | **Potencialmente sim, após auditoria do runtime e da voz** |
| Licença do runtime | Apache-2.0 no sherpa-onnx |
| Qualidade | Neural, de média a boa; precisa de teste real |
| Tamanho | Dezenas de megabytes por voz/modelo |
| Complexidade | Média/alta |
| Recomendação | **Primeira implementação experimental da S·IA** |

O ponto fraco é a naturalidade. Piper não deve ser vendido como indistinguível de um locutor humano. A vantagem é que a escolha do locale é mais explícita e o pipeline é mais leve e previsível que modelos multilíngues grandes.

### 2. Supertonic 3 — melhor candidato moderno para benchmark

O Supertonic 3 tem 99 milhões de parâmetros, roda localmente em CPU por ONNX Runtime, não exige GPU, não faz chamadas à nuvem e declara 31 idiomas, incluindo português. O projeto oficial possui um exemplo Web que usa ONNX Runtime Web, Web Audio API e fallback de WebGPU para WebAssembly. [2] [3] [5]

Ele é tecnicamente muito atraente para uma extensão, mas tem duas ressalvas decisivas. Primeiro, os pesos usam OpenRAIL-M, que não é equivalente a MIT: a página oficial menciona uso comercial com restrições de uso e exigência de atribuição. [3] Segundo, uma issue oficial reconhece que o modelo utiliza um único código `pt` e não separa `pt-BR` de `pt-PT`; o mantenedor admite que o conjunto de treinamento pode ter mais português europeu e recomenda uma referência vocal brasileira para tentar melhorar o sotaque. [4]

| Critério | Avaliação |
|---|---|
| PT-BR explícito | **Não; usa `pt` genérico** |
| Execução sem servidor | **Sim** |
| Browser/WebAssembly | **Sim, com exemplo oficial** |
| Uso comercial | **Sim, condicionado ao OpenRAIL-M** |
| Licença permissiva irrestrita | **Não** |
| Qualidade potencial | Boa/alta, mas PT-BR precisa ser validado |
| Tamanho | 99M parâmetros; peso final e assets precisam ser medidos |
| Recomendação | **Benchmark paralelo, não escolha única inicial** |

O Supertonic 3 pode superar Piper em naturalidade geral, mas isso não resolve automaticamente a pronúncia brasileira. Para o requisito do usuário, “falar português” e “falar português brasileiro de forma natural” são critérios diferentes.

### 3. Kokoro — não insistir como solução de PT-BR

Como o usuário já testou Kokoro e observou sotaque espanhol e pronúncia ruim em PT-BR, não há razão produtiva para fazer dele o núcleo da S·IA sem um checkpoint/voz realmente treinado e validado para brasileiro. A arquitetura pode continuar suportando Kokoro em outros idiomas, mas a escolha de voz deve ser baseada em avaliação nativa de PT-BR, não apenas no número de idiomas anunciado.

### 4. MeloTTS e OpenVoice — licenças boas, encaixe linguístico ruim

MeloTTS e OpenVoice exibem licenças MIT no código, mas os repositórios oficiais não listam português brasileiro entre os idiomas nativos principais. MeloTTS lista inglês, espanhol, francês, chinês, japonês e coreano; OpenVoice V2 também destaca esse conjunto, sem PT-BR nativo. [9] [10] Além disso, ambos exigiriam adaptação de runtime/modelo para browser e não são uma solução direta para o sotaque brasileiro.

Eles podem ser interessantes para pesquisa ou fine-tuning, mas não são a escolha mais produtiva para a extensão agora.

### 5. XTTS e modelos grandes de clonagem — não atendem ao conjunto de restrições

XTTS pode oferecer boa qualidade e clonagem de voz, mas o modelo tradicional está ligado à Coqui Public Model License, que exige análise específica para uso comercial. Também é muito pesado e complexo para geração contínua dentro de uma extensão Chrome. Não é a alternativa adequada quando o requisito é distribuição local leve, previsível e sem servidor.

### 6. Edge TTS, BYOK e APIs — descartados pelo requisito sem servidor

Essas opções podem produzir vozes muito naturais, mas enviam texto para um serviço externo, dependem de rede e introduzem credenciais, quotas, custos e termos de uso. `edge-tts`, em particular, é um cliente de serviço online e não uma API oficial de extensão. Elas não satisfazem o requisito de tudo funcionar instalado junto ao navegador e à extensão.

## Recomendação final em três níveis

| Nível | Solução | Decisão |
|---|---|---|
| Produção estável | `speechSynthesis` atual | Manter como padrão e fallback permanente. |
| Primeira IA local | Piper `pt_BR` + sherpa-onnx WASM | Implementar em modo opcional, com licença e voz auditadas. |
| Pesquisa de maior naturalidade | Supertonic 3 Web | Testar em paralelo, sobretudo com referência vocal brasileira, sem assumir que o `pt` seja PT-BR. |

A escolha que mais se encaixa no conjunto **PT-BR + local + navegador + comercial + sem servidor** é **Piper PT-BR executado por sherpa-onnx em WebAssembly**. Não é a escolha que promete voz indistinguível de humano, mas é a combinação mais equilibrada entre locale brasileiro, privacidade, distribuição local e viabilidade técnica.

Se a exigência de naturalidade for realmente “próxima de locutor humano”, a solução superior de longo prazo seria treinar ou contratar o treinamento de uma voz **especificamente brasileira**, usando gravações de um locutor com consentimento e uma licença comercial explícita, exportando o resultado para ONNX e executando-o no mesmo runtime sherpa-onnx. Essa rota dá controle real do sotaque, mas deixa de ser uma simples adoção de modelo pronto.

## Como integrar sem quebrar a S·IA atual

A integração deve ser feita como um novo provedor de áudio, não como substituição do `speechSynthesis` e não como alteração do detector de legendas.

```text
content.js / fila atual
        │
        ├── BrowserSpeechProvider  ← padrão atual, intacto
        │
        └── NeuralLocalProvider    ← opcional, via mensagens
                 │
                 └── Web Worker
                         ├── sherpa-onnx WASM
                         ├── modelo Piper pt_BR
                         └── AudioBuffer / Web Audio API
```

O provedor neural deve ter um contrato pequeno, com `prepare(text)`, `play(audio)`, `cancel()`, `pause()`, `resume()`, `isAvailable()` e eventos `start`, `end` e `error`. A fila atual deve continuar controlando a ordem das cues, o replay, a pausa, a velocidade e a recuperação de erro. O detector DOM, inclusive o fallback recentemente criado, deve apenas produzir texto e permanecer alheio ao motor TTS.

O modelo deve ser carregado de forma preguiçosa, apenas quando o usuário ativar “Voz neural local”. Para cumprir literalmente “sem servidor”, o modelo e os arquivos auxiliares devem ser distribuídos dentro da extensão ou instalados por um pacote local. Baixar o modelo de Hugging Face no primeiro uso é conveniente, mas significa que a primeira execução ainda depende de rede.

O modelo não deve ser inferido no thread principal. O worker evita bloquear a interface e o player do Coursera, mas a extensão ainda precisará limitar o tamanho dos chunks, gerar a próxima frase com antecedência, cancelar áudio antigo quando a cue mudar e liberar `AudioBuffer` que não será mais usado.

## Plano de validação antes de ativar para usuários

A comparação deve usar o mesmo conjunto de pelo menos 100 frases reais de legendas da Coursera, incluindo números, siglas, palavras técnicas, abreviações, nomes próprios, pontuação e frases curtas. Cada candidato deve ser avaliado por falantes brasileiros em cinco dimensões: sotaque, pronúncia de `t/d` antes de `i`, nasalização, ritmo e inteligibilidade.

Também devem ser medidos o tempo até a primeira fala, fator de tempo real, uso de memória, comportamento em CPU sem WebGPU, troca de cue, pausa, replay, cancelamento e recuperação quando o modelo falhar.

A decisão deve usar uma regra conservadora: se o provedor neural atrasar a cue, bloquear o Coursera, consumir memória excessiva ou produzir pronúncia inferior à voz nativa escolhida, a S·IA retorna automaticamente ao `BrowserSpeechProvider`. O usuário nunca deve ficar sem leitura porque a IA local não carregou.

## Conclusão

A resposta honesta é que **Supertonic 3 é o melhor runtime moderno para testar no browser, mas não é a melhor garantia de PT-BR**, porque usa `pt` genérico e já existe relato oficial de tendência ao português europeu. **Piper PT-BR sobre sherpa-onnx WebAssembly é a melhor primeira implementação para a S·IA**, desde que uma voz brasileira específica seja escutada, comparada e licenciada antes da distribuição.

A sequência mais segura é: manter o mecanismo atual, criar o provedor neural local em worker, testar Piper `pt_BR` com várias vozes, testar Supertonic 3 em paralelo, e somente ativar por padrão o candidato que vencer a avaliação de pronúncia brasileira em frases reais. Nenhuma alternativa deve ser chamada de “idêntica ao humano” sem uma avaliação auditiva sistemática.

## Referências

[1]: [sherpa-onnx — catálogo oficial de modelos TTS](https://k2-fsa.github.io/sherpa/onnx/tts/all/) — lista vozes Piper `pt_BR` e Supertonic em português.

[2]: [Supertonic 3 — página oficial](https://supertonic3.github.io/) — 99M parâmetros, ONNX Runtime, CPU, 31 idiomas, execução local/browser e licença OpenRAIL-M.

[3]: [Supertone — model card Supertonic 3](https://huggingface.co/Supertone/supertonic-3) — licença OpenRAIL-M e informações dos pesos.

[4]: [Supertonic issue #146 — Brazilian Portuguese pronunciation](https://github.com/supertone-inc/supertonic/issues/146) — reconhecimento oficial da ausência de distinção `pt-BR`/`pt-PT` e da possível tendência europeia.

[5]: [Supertonic — exemplo Web oficial](https://github.com/supertone-inc/supertonic/tree/main/web) — ONNX Runtime Web, WebGPU/WASM e assets locais.

[6]: [sherpa-onnx — repositório oficial](https://github.com/k2-fsa/sherpa-onnx) — licença Apache-2.0, execução offline e suporte a WebAssembly/TTS.

[7]: [sherpa-onnx — TTS em WebAssembly](https://k2-fsa.github.io/sherpa/onnx/tts/wasm/index.html) — processo oficial de compilação e execução TTS em WASM.

[8]: [Piper `cadu` PT-BR — model card](https://huggingface.co/rhasspy/piper-voices/blob/main/pt/pt_BR/cadu/medium/MODEL_CARD) — idioma `pt_BR`, qualidade medium, sample rate e licença CC0 do dataset associado.

[9]: [MeloTTS — repositório oficial](https://github.com/myshell-ai/MeloTTS) — licença MIT e idiomas listados pelo projeto.

[10]: [OpenVoice — repositório oficial](https://github.com/myshell-ai/OpenVoice) — licença MIT e idiomas nativos listados pelo projeto.

[11]: [Supertonic — exemplo Web `package.json`](https://github.com/supertone-inc/supertonic/blob/main/web/package.json) — dependências `onnxruntime-web` e `fft.js`, com pacote web MIT.
