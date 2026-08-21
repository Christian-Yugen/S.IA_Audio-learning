# Arquitetura do sistema S·IA

## Finalidade

Este documento descreve a arquitetura que deverá orientar a manutenção da S·IA e a expansão para novas plataformas de cursos. A prioridade é preservar o caminho funcional existente do Coursera, utilizar um único núcleo de áudio e permitir que cada plataforma seja integrada por um adaptador diagnosticável.

## Visão geral

```text
Página da plataforma
        │
        ▼
Adaptador da plataforma
(Coursera / Udemy / futuro)
        │ eventos de legenda normalizados
        ▼
S·IA Core
├── estado e configuração
├── sync-engine protegido
├── fila de fala
├── voz nativa
├── Piper PT-BR local
├── cache e deduplicação
├── pré-síntese
└── fallback automático
        │
        ├── popup e side panel
        ├── diagnóstico
        └── camada educacional futura
```

## Responsabilidade de cada camada

| Camada | Pode conhecer a plataforma? | Pode controlar áudio? | Pode ser substituída por plataforma? |
|---|---:|---:|---:|
| Adaptador | Sim | Não | Sim, um por plataforma |
| Núcleo S·IA | Não | Sim | Não, é único |
| Diagnóstico | Recebe a identificação | Observa estados | Não, contrato comum |
| Camada educacional | Recebe eventos | Não | Não, contrato comum |
| UI | Exibe e solicita ações | Não diretamente | Não, comportamento comum |

### Adaptador

O adaptador descobre a estrutura da plataforma e converte o estado da página em informação normalizada. Ele poderá procurar um vídeo, aguardar a criação do player, acompanhar a legenda ativa, reconhecer troca de aula e informar a fonte de cada cue.

O adaptador não pode implementar regras de velocidade, criar uma fila de fala ou chamar diretamente o Worker Piper. Quando não conseguir resolver a legenda com confiança, deverá emitir diagnóstico e acionar uma estratégia de fallback definida para a plataforma.

### Núcleo de áudio

O núcleo recebe uma cue normalizada e decide como tratá-la de acordo com a configuração do usuário. Ele é o único responsável por escolher a voz nativa ou Piper, sintetizar, reaproveitar cache, deduplicar requisições, preparar a próxima cue, reproduzir PCM e executar fallback.

O `sync-engine.js` atual é um componente protegido. A sua lógica não deve ser copiada para adaptadores ou reescrita para atender a uma plataforma nova.

### Host offscreen e Worker neural

O Piper neural local permanece isolado no host offscreen da extensão. O fluxo é:

```text
content.js
   → mensagem para service-worker.js
   → host offscreen
   → piper-worker.js
   → sherpa-onnx WebAssembly
   → PCM
   → AudioContext do content script
```

A expansão de plataformas não deve criar um segundo Worker ou uma segunda ponte neural. O mesmo caminho deve ser utilizado sempre que o motor Piper estiver selecionado.

## Contrato conceitual do adaptador

```javascript
const adapter = {
  id: "platform-id",
  version: "adapter-version",
  matchesLocation() {},
  findVideo() {},
  getCaptionSource() {},
  getCurrentCaption() {},
  observeCaptionChanges() {},
  getCourseContext() {},
  getDiagnostics() {},
  destroy() {}
};
```

Os nomes acima representam o contrato de responsabilidade. A implementação poderá utilizar classes, funções ou módulos diferentes, desde que mantenha a mesma separação.

## Cue normalizada

Uma legenda entregue ao núcleo deverá carregar mais do que texto. A origem precisa acompanhar a cue para que a extensão possa informar ao usuário como a leitura foi resolvida.

```javascript
{
  platformId: "coursera",
  adapterVersion: "coursera-v1",
  text: "Texto da legenda",
  startTime: 12.4,
  endTime: 16.8,
  source: "primary",
  sourceConfidence: "high",
  courseContext: {
    courseId: "...",
    lessonId: "..."
  }
}
```

O contexto de curso deverá ser mínimo e não deverá incluir dados desnecessários, credenciais ou conteúdo que não seja utilizado pela extensão.

## Contrato de eventos

| Evento | Payload mínimo | Objetivo |
|---|---|---|
| `SIA_PLATFORM_DETECTED` | `platformId`, `adapterVersion` | Informar a plataforma ativa. |
| `SIA_PLAYER_FOUND` | referência controlada ou estado do player | Confirmar que o vídeo foi localizado. |
| `SIA_CAPTION_SOURCE_READY` | `source`, `confidence` | Informar a fonte da legenda. |
| `SIA_CAPTION_CHANGED` | cue normalizada | Entregar uma nova legenda ao núcleo. |
| `SIA_CUE_COMPLETED` | identificador da cue | Liberar ações de cache e aprendizagem. |
| `SIA_ADAPTER_FALLBACK` | fonte anterior, nova fonte e motivo | Explicar a degradação. |
| `SIA_ADAPTER_ERROR` | código, mensagem e ação sugerida | Informar falha compreensível. |
| `SIA_AUDIO_STATE_CHANGED` | motor e estado | Atualizar popup e painel. |
| `SIA_PLATFORM_LEFT` | `platformId` | Destruir listeners e limpar estado. |

## Estados mínimos

O adaptador e o núcleo deverão expor estados que permitam distinguir espera, sucesso, fallback e erro.

```text
PLATFORM_UNKNOWN
PLATFORM_DETECTED
WAITING_FOR_PLAYER
PLAYER_FOUND
WAITING_FOR_CAPTIONS
CAPTION_SOURCE_PRIMARY
CAPTION_SOURCE_FALLBACK
AUDIO_BROWSER_READY
AUDIO_PIPER_WARMING
AUDIO_PIPER_READY
AUDIO_PLAYING
AUDIO_QUEUED
AUDIO_FALLBACK_BROWSER
ADAPTER_ERROR
```

## Invariantes de arquitetura

As seguintes condições devem permanecer verdadeiras:

| Invariante | Teste de verificação |
|---|---|
| A voz nativa é o padrão | Instalação limpa e status inicial. |
| Piper só inicia por escolha do usuário | Verificação de storage e popup. |
| O Worker neural executa no host autorizado | Inspeção de targets e mensagens. |
| Não existe fila duplicada por plataforma | Busca estrutural e testes. |
| A cue informa a fonte | Teste de payload e diagnóstico. |
| A falha neural retorna ao navegador | Simulação de erro de geração. |
| O Coursera continua funcionando | Regressão automatizada e teste físico. |
| A nova plataforma não altera páginas incompatíveis | Teste de reconhecimento negativo. |
| O desligamento do adaptador remove listeners | Teste de ciclo de vida. |

## Limites de acoplamento

O adaptador pode conhecer somente a página da plataforma que representa. O núcleo não deverá consultar seletores de Coursera ou Udemy. A interface não deverá procurar legendas diretamente. A camada educacional não deverá acessar o DOM da plataforma.

Essa regra evita que uma mudança em uma plataforma contamine as demais camadas e facilita a substituição de um adaptador sem alterar áudio, diagnóstico ou recursos de aprendizagem.

## Fluxo de fallback

```text
Fonte principal encontrada?
       ├── sim → validar texto e tempo → emitir cue primary
       └── não
            ↓
      fonte alternativa disponível?
       ├── sim → validar confiança → emitir cue fallback + diagnóstico
       └── não → informar espera/erro sem falar texto incerto
```

O fallback não deve ocultar a sua própria existência. O usuário precisa saber quando a S·IA está operando em compatibilidade reduzida.

## Integração futura da camada educacional

A camada educacional consumirá eventos do núcleo e não deverá intervir na reprodução. Uma pergunta ou flashcard pode ser criado a partir de `SIA_CAPTION_CHANGED`, mas não pode alterar a fila de fala automaticamente sem uma ação explícita ou política documentada.

```text
SIA_CAPTION_CHANGED
        ├── S·IA Core → fala e sincronização
        ├── Diagnóstico → fonte e estado
        └── Aprendizagem → nota, marcador ou cartão
```

## Decisões protegidas

O `sync-engine.js`, o provedor Piper comum, o fluxo offscreen, o fallback de áudio e o caminho nativo do Coursera não devem ser modificados para resolver exclusivamente um problema de adaptador. Se uma mudança nesses pontos parecer necessária, o processo de exceção do [Documento Mestre](../governance/MASTER-SIA-EXPANSION.md) deverá ser seguido antes de qualquer alteração.
