# Plano de implantação do Piper PT-BR + sherpa-onnx WebAssembly na S·IA

## Objetivo

Adicionar à S·IA um provedor neural local opcional para leitura de legendas em português brasileiro, usando Piper PT-BR com sherpa-onnx WebAssembly, sem substituir nem alterar o comportamento funcional atual.

A regra central do projeto é:

> **Acrescentar uma alternativa acionável; não reescrever o caminho que já funciona.**

## Resultado esperado

A extensão continuará iniciando no modo atual, usando a voz nativa do navegador e o pipeline já validado. O usuário poderá ativar explicitamente a opção “Voz neural local PT-BR”. Somente nesse modo o novo runtime será carregado. Se o modelo não puder ser carregado, se houver erro, lentidão excessiva, incompatibilidade ou consumo de memória inadequado, a extensão retornará automaticamente ao mecanismo nativo.

## Invariantes que não podem mudar

| Componente | Garantia obrigatória |
|---|---|
| Detecção atual de legendas | Não modificar as funções existentes. |
| Fallback DOM | Continuar independente do provedor de voz. |
| Fila de leitura | Manter ordem, deduplicação e descarte de repetições. |
| Sincronização | Preservar cálculo de duração, antecipação e ajustes de velocidade. |
| Controles | Preservar pausa, retomada, replay, cancelamento, pitch, volume e velocidade. |
| Histórico/Companion | Não alterar o formato atual nem o comportamento do armazenamento. |
| Instalação | A extensão deve continuar funcionando sem o modelo neural. |
| Falhas | Qualquer falha neural deve ser isolada e não interromper o player do Coursera. |
| Distribuição | Não usar rede para inferência. O carregamento remoto inicial só será aceito se for explicitamente escolhido e documentado; para offline real, os assets devem estar no pacote. |

## Fases de execução

### Fase 1 — Congelamento do baseline

Registrar hashes dos arquivos atuais, versão da extensão, manifesto, permissões, testes existentes e comportamento observado em aulas reais. Criar uma cópia de referência para comparação. Nenhum arquivo funcional deve ser alterado nesta fase.

Critério de aprovação: o baseline deve estar reproduzível e todos os testes atuais devem passar antes do início da integração.

### Fase 2 — Fixação do conjunto Piper PT-BR

Escolher uma voz específica `pt_BR`, começando por `cadu`, `faber` ou outra voz que vença o teste auditivo. Fixar versão, hash dos arquivos ONNX e JSON, sample rate, qualidade, arquivos de fonemização e model card. Auditar separadamente o runtime sherpa-onnx, o modelo, a voz/dataset e as dependências.

A documentação do sherpa-onnx lista várias vozes Piper PT-BR e possui suporte a TTS WebAssembly. A escolha final não deve ser feita apenas pelo nome “high”, “medium” ou “low”; deverá considerar pronúncia, naturalidade, tamanho, velocidade e licença do artefato exato.

Critério de aprovação: licença e avisos de atribuição documentados, modelo reproduzível e amostras PT-BR aprovadas por falante brasileiro.

### Fase 3 — Arquitetura isolada de provedor

Criar um módulo novo, sem alterar o comportamento do provedor atual, com uma abstração semelhante a:

```text
BrowserSpeechProvider  -> mecanismo atual
PiperLocalProvider     -> novo mecanismo neural opcional

provider.prepare(text, options)
provider.play(audioHandle)
provider.pause()
provider.resume()
provider.cancel()
provider.isAvailable()
provider.dispose()
```

O controlador deve continuar tratando o texto e a fila. O provedor neural deve cuidar exclusivamente de gerar e tocar áudio, informando eventos `start`, `end`, `cancel` e `error`.

Critério de aprovação: o modo padrão continuar executando o mesmo caminho de código e a nova implementação poder ser desligada por uma feature flag.

### Fase 4 — Worker WebAssembly e assets locais

Executar o sherpa-onnx WASM em Web Worker para evitar bloquear a interface do Coursera. O worker receberá textos curtos, carregará o modelo uma única vez, gerará PCM/WAV ou buffers de áudio e devolverá mensagens estruturadas ao contexto principal.

Os assets deverão ficar versionados e separados:

```text
neural-tts/
  worker.js
  sherpa-onnx-runtime.wasm
  sherpa-onnx-runtime.js
  models/
    pt_BR-cadu-medium.onnx
    pt_BR-cadu-medium.onnx.json
  voices/
    voice-style-or-config.json
  LICENSES/
    sherpa-onnx-Apache-2.0.txt
    piper-voice-license.txt
    model-card.md
```

O carregamento deve ser preguiçoso. A extensão não deve pagar o custo do modelo até que o usuário escolha a voz neural. O worker também deverá liberar buffers e permitir descarte completo do modelo quando o modo neural for desativado.

Critério de aprovação: inicialização idempotente, cancelamento seguro, ausência de bloqueio perceptível na página e liberação de memória após descarte.

### Fase 5 — Adaptador de áudio

Adicionar um adaptador entre o áudio gerado pelo worker e o fluxo já existente. A implementação não deve falsificar ou sobrescrever `window.speechSynthesis`. A fala neural deve usar um contexto de áudio dedicado, preferencialmente um offscreen document ou contexto equivalente da extensão, com controle explícito de `AudioBufferSourceNode`.

O adaptador deverá informar o início real da reprodução, o término, cancelamento e erro. A estimativa de duração usada pela sincronização deve ser baseada na duração real do áudio gerado sempre que possível.

Critério de aprovação: a fila não avançar antes do evento de fim, o replay cancelar o áudio anterior, a pausa não criar sobreposição e a troca de cue não deixar áudio órfão.

### Fase 6 — Ativação e fallback

Adicionar no pop-up uma opção claramente identificada, inicialmente desligada:

```text
Motor de voz:
  Voz do navegador — padrão atual
  Voz neural local PT-BR — experimental
```

A preferência deverá ser salva separadamente por usuário/curso, sem alterar as configurações existentes. O sistema deverá usar o modo nativo quando:

- o usuário não ativar a voz neural;
- o modelo não estiver disponível;
- o browser não suportar o runtime necessário;
- a inicialização exceder o timeout definido;
- ocorrer erro na geração ou reprodução;
- a fila neural acumular atraso acima do limite.

A extensão deverá indicar “Voz neural local” ou “Voz nativa” no status, mas o fallback para voz nativa deverá ser automático e silencioso quando possível.

Critério de aprovação: nenhuma falha do worker causar erro não tratado no `content.js` ou impedir a leitura normal.

### Fase 7 — Testes de regressão, qualidade e desempenho

Executar os testes atuais sem modificações e acrescentar testes isolados para mensagens do worker, seleção de provedor, cancelamento, timeout e fallback. A validação de áudio deverá usar ao menos 100 frases reais de legendas de cursos, contendo números, siglas, termos técnicos, nomes próprios, pontuação, abreviações e frases curtas.

Medir:

| Métrica | Critério de decisão |
|---|---|
| Tempo até a primeira fala | Não pode tornar a leitura desconfortável. |
| Fator de tempo real | Deve acompanhar a reprodução em máquinas suportadas. |
| Uso de memória | Medir antes, durante e depois do descarte do modelo. |
| Pronúncia PT-BR | Avaliação por falantes brasileiros, incluindo `t/d` antes de `i`, nasalização e ritmo. |
| Estabilidade | Sem travamentos, áudio duplicado ou fila presa. |
| Sincronização | A fala não pode acumular atraso progressivo em aulas longas. |
| Compatibilidade | Testar Chrome com e sem WebGPU, desktop e máquinas com poucos recursos. |

Critério de aprovação: o modo neural deve ser claramente útil e não pode degradar o modo nativo.

### Fase 8 — Empacotamento e distribuição

Fixar o build do runtime WASM, o modelo, as licenças, os hashes e a lista de arquivos distribuídos. O empacotador deve incluir apenas os assets necessários. O pacote deve ser testado em uma instalação limpa do Chrome, sem arquivos presentes apenas no ambiente de desenvolvimento.

A versão inicial deve ser tratada como recurso experimental. O modelo pode aumentar significativamente o tamanho do pacote e o tempo de atualização. Se o modelo for baixado no primeiro uso, isso deve ser informado ao usuário e a extensão precisa validar integridade antes de carregá-lo.

Critério de aprovação: ZIP reproduzível, permissões mínimas, licenças incluídas e instalação limpa funcionando com e sem ativação neural.

### Fase 9 — Critérios de liberação

A voz neural só poderá ser liberada como opção experimental quando todos os itens seguintes forem verdadeiros:

1. O baseline atual continua passando nos mesmos testes.
2. Os hashes dos arquivos funcionais não mudam sem justificativa documentada.
3. A licença do runtime, do modelo e da voz está arquivada.
4. O modelo identifica PT-BR de forma explícita ou a limitação de locale está claramente assumida.
5. O worker pode ser iniciado, cancelado e destruído sem afetar o Coursera.
6. O fallback nativo funciona automaticamente.
7. O modo padrão continua sendo o atual.
8. A qualidade da voz foi avaliada por falantes brasileiros.
9. A instalação não depende de servidor para inferência.
10. O pacote foi testado em instalação limpa e em uma aula real.

## Decisão técnica recomendada

A ordem de implementação deve ser:

```text
1. Baseline congelado
2. Piper PT-BR e licenças fixados
3. Worker sherpa-onnx WASM isolado
4. Adaptador de áudio
5. Feature flag desligada por padrão
6. Fallback automático para BrowserSpeechProvider
7. Teste real em aulas do Coursera
8. Liberação experimental
```

O Supertonic 3 pode ser mantido como benchmark futuro, mas não deve entrar nesta primeira implantação porque usa `pt` genérico e há relatos oficiais de pronúncia próxima ao português europeu. O objetivo desta etapa é resolver PT-BR de forma controlada, não ampliar o número de idiomas.

## Princípio de segurança de regressão

Em qualquer dúvida entre a voz neural e a voz atual, a voz atual vence. A nova camada não terá permissão para substituir silenciosamente o comportamento original, modificar a fila existente, interceptar a legenda ou alterar o motor de sincronização. Ela será apenas um provedor alternativo acionável.
