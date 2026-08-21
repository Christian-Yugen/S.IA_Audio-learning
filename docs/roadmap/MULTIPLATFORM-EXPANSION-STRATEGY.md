# Estratégia de expansão multiplataforma da S·IA

## Visão

A S·IA será expandida gradualmente de uma extensão integrada ao Coursera para uma camada comum de áudio e aprendizagem sobre diferentes plataformas de cursos online. A expansão não será medida pelo número de domínios adicionados, mas pela qualidade do suporte, pela estabilidade do núcleo e pela transparência do diagnóstico.

O Coursera permanece como **plataforma de referência protegida**. A Udemy é a primeira plataforma adicional a ser analisada. Outras plataformas só serão consideradas depois que o contrato de adaptadores, o sistema de diagnóstico e a matriz de regressão estiverem estáveis.

## Estratégia em uma frase

> **Adicionar adaptadores; não reescrever o núcleo.**

## Ordem de expansão

| Ordem | Plataforma | Objetivo | Estado |
|---:|---|---|---|
| 0 | Coursera | Preservar e usar como baseline funcional. | Protegido e validado |
| 1 | Udemy | Provar o modelo de adaptador isolado com diagnóstico e fallback. | Próxima análise |
| 2 | YouTube | Avaliar cursos abertos e conteúdo educacional com fontes variadas de legenda. | Futuro |
| 3 | edX | Avaliar compatibilidade com outro ambiente acadêmico. | Futuro |
| 4 | Outras plataformas | Priorizar conforme demanda, estabilidade e viabilidade técnica. | Futuro |

A ordem poderá ser revista somente por decisão registrada. A inclusão de uma plataforma com grande demanda não elimina os critérios de segurança e regressão.

## Fases da expansão

### Fase A — Contrato comum

Definir a interface dos adaptadores, a cue normalizada, os eventos e os estados de diagnóstico. Nesta fase não se altera o comportamento do Coursera.

### Fase B — Observação passiva

Estudar a nova plataforma sem iniciar voz, modificar o player ou assumir que o DOM é estável. Devem ser observados carregamento, troca de cue, pausa, busca, troca de aula, mudança de velocidade, recarga e recriação do player.

### Fase C — Protótipo mínimo

Implementar somente o reconhecimento da plataforma, a localização do player, a leitura da fonte principal e a sinalização diagnóstica. O protótipo precisa dizer quando não sabe resolver algo.

### Fase D — Fallback

Adicionar uma segunda estratégia de resolução, como leitura DOM ou eventos, somente quando a estratégia principal falhar e com registro explícito da transição.

### Fase E — Núcleo compartilhado

Encaminhar a cue normalizada ao núcleo único de áudio. O adaptador não poderá criar lógica própria para Piper, voz nativa, fila ou sincronização.

### Fase F — Validação

Executar testes automatizados, fixtures controladas, aulas reais e toda a regressão do Coursera. O suporte inicial será experimental e terá limitações documentadas.

### Fase G — Promoção

A plataforma só poderá ser apresentada como compatível depois de cumprir a matriz mínima de aceitação e possuir um procedimento de rollback.

## Estratégia específica para Udemy

A integração com a Udemy será iniciada por um módulo isolado. O adaptador deverá resolver, em ordem:

1. identificação segura do contexto da plataforma;
2. localização do vídeo ativo;
3. descoberta da fonte de legenda principal;
4. identificação de troca de cue;
5. tratamento de pause, seek e troca de aula;
6. fallback com confiança registrada;
7. envio de eventos normalizados ao núcleo S·IA;
8. diagnóstico visível ao usuário.

O primeiro marco de sucesso não é a quantidade de recursos, mas a capacidade de encaminhar uma cue correta uma única vez, informar sua origem e preservar totalmente o Coursera.

## Critérios de maturidade

| Nível | Requisitos |
|---|---|
| **Protótipo** | Detecta a plataforma e expõe diagnóstico básico. Não promete estabilidade. |
| **Experimental** | Lê a fonte principal, possui fallback, utiliza o núcleo comum e passa por cenários básicos. |
| **Compatível** | Passa pela matriz mínima, possui validação real, regressão do Coursera e limitações documentadas. |
| **Validado** | Tem testes repetíveis, ciclo de vida completo, diagnóstico confiável, rollback e histórico de versões. |
| **Estável** | Mantém resultados consistentes em atualizações da plataforma e possui processo de manutenção ativo. |

## Métricas de qualidade

Cada adaptador deverá registrar, quando possível:

| Métrica | Pergunta respondida |
|---|---|
| Taxa de cues detectadas | Quantas legendas válidas foram capturadas? |
| Duplicação | O mesmo texto foi emitido mais de uma vez? |
| Perda | Houve cue visível que não foi capturada? |
| Fonte | Quantas cues vieram da fonte principal e do fallback? |
| Confiança | A origem da cue foi identificada com segurança? |
| Latência | Quanto tempo houve entre cue e início da fala? |
| Falhas | Quantas falhas de player, legenda e áudio ocorreram? |
| Recuperação | O adaptador se recuperou após pausa, seek ou troca de aula? |

As métricas não devem enviar dados para servidores por padrão. Elas podem ser exibidas localmente, exportadas manualmente ou utilizadas em testes locais.

## Prioridade de futuras plataformas

Uma plataforma futura será priorizada quando combinar demanda dos usuários, presença de legendas, possibilidade de observação segura, baixo acoplamento ao núcleo, viabilidade de fallback e ausência de impedimentos de distribuição.

| Fator | Peso de decisão |
|---|---:|
| Demanda real | Alto |
| Qualidade e disponibilidade das legendas | Alto |
| Possibilidade de adaptador isolado | Alto |
| Existência de fallback seguro | Alto |
| Impacto sobre o Coursera | Eliminatório se negativo |
| Necessidade de chamadas remotas | Desfavorável |
| Complexidade de autenticação ou iframe | Avaliar antes |
| Conformidade de uso | Eliminatório se não atendida |

## Não objetivos da primeira expansão

A primeira integração da Udemy não deverá tentar resolver simultaneamente tradução automática, tutor inteligente, avaliação de voz, sincronização entre várias abas, conta própria do usuário ou sincronização em nuvem. Esses recursos poderão ser analisados mais tarde, depois que a compatibilidade da legenda estiver comprovada.

Limitar o escopo é uma forma de proteger o Coursera e obter evidências claras sobre cada etapa.

## Rollback da expansão

Se o adaptador da Udemy falhar, a ação padrão será desativar somente o adaptador Udemy, sem remover o núcleo nem alterar o adaptador Coursera. O pacote imediatamente anterior deverá permanecer disponível para reinstalação.

Uma mudança que não permita esse rollback isolado não está pronta para distribuição.

## Governança

Toda etapa deverá seguir o [Documento Mestre](../governance/MASTER-SIA-EXPANSION.md), o [controle de mudanças](../governance/CHANGE-CONTROL.md) e o checklist de release. Qualquer tentativa de modificar um componente protegido será interrompida e transformada em uma solicitação formal de exceção.
