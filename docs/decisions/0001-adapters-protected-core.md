# ADR-0001 — Adaptadores isolados e núcleo protegido

**Status:** Aceita  
**Data:** 21 de agosto de 2026  
**Escopo:** Expansão multiplataforma da S·IA

## Contexto

A S·IA possui um caminho funcional validado para o Coursera, incluindo leitura de legendas, sincronização adaptativa, voz nativa, Piper PT-BR opcional, pré-síntese e fallback. A próxima expansão analisará a Udemy e poderá futuramente abranger outras plataformas.

Cada plataforma pode apresentar estrutura de player, ciclo de vida e fonte de legenda diferentes. Misturar essas diferenças ao núcleo de áudio aumentaria o risco de regressão e dificultaria o diagnóstico.

## Decisão

A S·IA utilizará adaptadores isolados por plataforma e um único núcleo compartilhado para voz, fila, sincronização, Piper, pré-síntese e fallback.

O adaptador será responsável por descobrir player e legenda, normalizar cues, acompanhar ciclo de vida e informar a origem da legenda. O núcleo será responsável por processar áudio e sincronização. A interface de usuário exibirá diagnóstico e permitirá controle, mas não lerá diretamente o DOM da plataforma.

O caminho funcional do Coursera e os componentes protegidos não poderão ser alterados para atender uma nova plataforma sem o protocolo de exceção e a aprovação prévia, explícita e específica do usuário.

## Consequências positivas

A implementação da Udemy poderá ser criada sem duplicar fila ou sincronização. Uma correção do núcleo poderá beneficiar adaptadores compatíveis, e um problema específico da plataforma poderá ser contido no adaptador correspondente.

O usuário poderá ver se a fonte principal ou um fallback está ativo. O rollback poderá desativar um adaptador sem remover o suporte já validado do Coursera.

## Consequências negativas

Cada adaptador exigirá análise, testes e manutenção próprios. A existência de uma interface comum não elimina as diferenças de comportamento das plataformas. A expansão será mais lenta do que copiar seletores e lógica, mas será mais auditável e segura.

## Alternativas rejeitadas

A primeira alternativa rejeitada foi copiar o `sync-engine.js` para cada plataforma. Isso criaria divergência e impediria a garantia de um único comportamento de sincronização.

A segunda alternativa rejeitada foi colocar seletores da Udemy diretamente no código Coursera. Isso violaria isolamento e aumentaria o risco de regressão indireta.

A terceira alternativa rejeitada foi falar qualquer texto encontrado no DOM quando a fonte principal falhasse. Sem confiança e diagnóstico, essa estratégia poderia reproduzir controles, relógios ou texto incorreto.

## Verificação

A decisão será considerada respeitada quando:

| Verificação | Resultado esperado |
|---|---|
| Adaptador Coursera | Permanece funcional e protegido. |
| Adaptador Udemy | É separado e identificado. |
| Núcleo de áudio | Existe uma única implementação. |
| Diagnóstico | Exibe plataforma, fonte e estado. |
| Fallback | É acionado e relatado de modo explícito. |
| Regressão | Testes do Coursera permanecem aprovados. |

## Referências

- [Documento Mestre](../governance/MASTER-SIA-EXPANSION.md)
- [Arquitetura do sistema](../architecture/SYSTEM-ARCHITECTURE.md)
- [Estratégia de expansão](../roadmap/MULTIPLATFORM-EXPANSION-STRATEGY.md)
