# Especificação do adaptador Udemy
## Documento de planejamento técnico — sem implementação

**Status:** Proposta para aprovação  
**Escopo:** descoberta de player, legendas, transcrições, fallback e integração com o S·IA Core  
**Não autorizado neste documento:** alteração do `sync-engine.js`, criação de fila própria ou mudança do caminho Coursera

## 1. Responsabilidade

O adaptador Udemy deverá traduzir o estado observável da página da Udemy em eventos que o núcleo S·IA já compreende. Ele não será um segundo leitor completo e não deverá conter decisões de áudio.

| Responsabilidade | Permitida ao adaptador |
|---|---:|
| Reconhecer a URL/contexto Udemy | Sim |
| Localizar o vídeo ativo | Sim |
| Descobrir fontes de legenda/transcrição | Sim |
| Observar troca de cue | Sim |
| Normalizar texto e tempo | Sim |
| Informar origem e confiança | Sim |
| Criar fila de fala | Não |
| Chamar Piper diretamente | Não |
| Ajustar sincronização | Não |
| Alterar velocidade do vídeo para compensar áudio | Não |
| Falar texto de baixa confiança | Não |

## 2. Fontes candidatas

A ordem abaixo é uma proposta inicial. A ordem real só será fixada depois da observação passiva.

| Fonte candidata | Classificação inicial | Condição de uso |
|---|---|---|
| `TextTrack` do vídeo | Principal possível | Deve expor cues corretas e atualizadas. |
| Evento ou estado de legenda | Alternativa possível | Deve ser observável sem depender de API privada instável. |
| Linha destacada da transcrição | Fallback possível | Deve possuir correlação temporal confiável. |
| Overlay de legenda no DOM | Fallback de compatibilidade | Deve passar por filtros contra controles, relógios e duplicatas. |
| Texto não temporal do painel | Não usar sozinho | Sem tempo não deve alimentar sincronização automaticamente. |

A documentação oficial da Udemy confirma a existência de legendas e transcrições, mas não confirma qual dessas representações é acessível a uma extensão em todos os cursos e variantes de experiência. O adaptador deverá tratar todas como hipóteses até a validação.

## 3. Cue normalizada

O adaptador deverá produzir um objeto equivalente a:

```javascript
{
  platformId: "udemy",
  adapterVersion: "udemy-v1",
  text: "Texto validado da legenda",
  startTime: 10.25,
  endTime: 14.80,
  source: "primary",
  sourceConfidence: "high",
  courseContext: {
    courseId: "local-context",
    lessonId: "local-context"
  }
}
```

`courseContext` deverá conter somente informações mínimas e não deverá capturar tokens, cookies, dados de conta ou conteúdo além do necessário ao recurso solicitado.

## 4. Máquina de estados

```text
IDLE
  ↓ URL compatível
PLATFORM_DETECTED
  ↓ player encontrado
PLAYER_FOUND
  ↓ fonte procurada
WAITING_FOR_CAPTIONS
  ├── fonte principal → PRIMARY_READY
  └── fonte principal falhou → FALLBACK_PROBING
                               ├── alternativa confiável → FALLBACK_READY
                               └── alternativa incerta → UNSAFE_TO_SPEAK
PRIMARY_READY / FALLBACK_READY
  ↓ cue normalizada
EMITTING_CUE
  ↓ troca de página/player
DESTROYING
```

O estado `UNSAFE_TO_SPEAK` é obrigatório para impedir que texto incerto seja falado como se fosse uma legenda válida.

## 5. Ciclo de vida

O adaptador deverá ser criado apenas quando a localização for compatível. Ao iniciar, ele deverá procurar o player, instalar observadores mínimos e emitir seu estado. Ao detectar troca de aula, troca de player, navegação SPA ou saída do domínio, deverá remover listeners, limpar referências e impedir emissões antigas.

A reconexão deverá ser idempotente. Reexecutar a busca do player não pode instalar um segundo conjunto de observers nem emitir novamente a cue atual sem mudança real.

## 6. Deduplicação no limite correto

O adaptador deverá eliminar apenas duplicatas de observação da mesma cue. A deduplicação de frases sobrepostas, continuidade de sentença e fila pertencem ao núcleo existente.

| Tipo de repetição | Responsável |
|---|---|
| Mesmo nó observado várias vezes | Adaptador |
| Mesmo timestamp e mesma fonte | Adaptador |
| Palavras repetidas entre cues | Núcleo de sincronização |
| Síntese repetida em andamento | Bridge Piper comum |
| Repetição manual do usuário | Núcleo/UI |

## 7. Diagnóstico

Cada mudança de fonte deverá produzir um diagnóstico estruturado:

```javascript
{
  platformId: "udemy",
  adapterVersion: "udemy-v1",
  player: "found",
  source: "transcript",
  confidence: "medium",
  reason: "primary-caption-source-unavailable",
  state: "FALLBACK_READY",
  userAction: "none"
}
```

A interface poderá traduzir isso para linguagem simples, mas não deverá esconder a origem técnica.

## 8. Separação dos fallbacks

Existem dois fallbacks independentes:

### Fallback de legenda

Tenta obter o texto por outra fonte quando a principal falhar. O resultado precisa ser validado e identificado como `fallback`.

### Fallback de áudio

Se o Piper falhar, o núcleo retorna à voz nativa. Essa decisão não pertence ao adaptador Udemy e deve funcionar exatamente como no Coursera.

Uma falha da fonte de legenda não deve ser confundida com uma falha do Piper. O diagnóstico deverá permitir distinguir os dois problemas.

## 9. Contrato com o núcleo

O adaptador deverá enviar eventos comuns:

```text
SIA_PLATFORM_DETECTED
SIA_PLAYER_FOUND
SIA_CAPTION_SOURCE_READY
SIA_CAPTION_CHANGED
SIA_CUE_COMPLETED
SIA_ADAPTER_FALLBACK
SIA_ADAPTER_ERROR
SIA_PLATFORM_LEFT
```

O núcleo continuará responsável por:

- decidir se a fala está habilitada;
- escolher voz nativa ou Piper;
- estimar e corrigir sincronização;
- controlar fila e pré-síntese;
- reproduzir áudio;
- executar fallback de áudio;
- salvar histórico e emitir status.

## 10. Segurança de escopo

A implementação não deverá ampliar permissões além do necessário. Não deverá inserir scripts remotos, extrair credenciais, acessar áreas não relacionadas à aula ou automatizar ações do usuário.

Antes de alterar o manifesto para incluir Udemy, deverá ser revista a política de permissões e a documentação de privacidade. O domínio adicional deverá ser incluído somente quando o adaptador estiver autorizado para o protótipo.

## 11. Critério de pronto do desenho

Esta especificação será considerada pronta para implementação quando:

- as hipóteses da pesquisa tiverem sido observadas;
- a fonte principal candidata estiver definida;
- o fallback tiver critério de confiança;
- o contrato de cue estiver coberto por fixtures;
- o diagnóstico estiver definido;
- o ciclo de vida estiver testado em teoria e fixture;
- o plano de rollback estiver aprovado;
- o usuário autorizar explicitamente a passagem para implementação.

## Referências

- [Plano oficial de execução](../roadmap/PLAN-EXECUTION-UDEMY-AND-LEARNING.md)
- [Pesquisa oficial inicial da Udemy](../research/UDEMY-OFFICIAL-RESEARCH.md)
- [Arquitetura do sistema](SYSTEM-ARCHITECTURE.md)
- [Documento Mestre](../governance/MASTER-SIA-EXPANSION.md)
