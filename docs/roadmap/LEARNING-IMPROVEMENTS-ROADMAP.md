# Roadmap de melhorias de aprendizagem da S·IA

## Objetivo

Depois de estabilizar a expansão multiplataforma, a S·IA poderá evoluir de um leitor de legendas para um **assistente de aprendizagem ativa**. A camada educacional deverá aproveitar as cues normalizadas de qualquer adaptador, mas permanecer independente do DOM, do player e do motor de áudio.

O ciclo pedagógico proposto é:

> **Ouvir → compreender → lembrar → responder → revisar.**

## Princípios

A camada educacional deverá ser opcional, local por padrão, explicável, desligável e não intrusiva. Ela não poderá pausar ou modificar o vídeo sem ação ou configuração explícita do usuário. Também não poderá mudar a fila de fala, o sincronismo ou o fallback do núcleo de áudio.

## Ordem de implementação

| Fase | Recurso | Benefício principal | Dependência |
|---:|---|---|---|
| 1 | Notas sincronizadas | Permite registrar uma ideia no instante exato da aula. | Eventos de cue e timestamp |
| 2 | Favoritos e marcadores | Cria uma lista de trechos para revisão. | Contexto da aula |
| 3 | Repetição contextual | Reproduz novamente a cue e retorna ao trecho original. | Núcleo de áudio e contexto |
| 4 | Flashcards manuais | Dá ao usuário controle sobre o material de estudo. | Armazenamento local |
| 5 | Flashcards sugeridos | Identifica definições e conceitos recorrentes. | Parser local e revisão humana |
| 6 | Modo prova | Testa o aluno antes de revelar a resposta. | Flashcards e timestamps |
| 7 | Revisão espaçada | Organiza revisões no dia seguinte e depois. | Histórico local |
| 8 | Glossário contextual | Explica termos ligados ao trecho da aula. | Extração de termos |
| 9 | Tutor Socrático | Faz perguntas de recordação, compreensão e aplicação. | Motor de perguntas |
| 10 | Shadowing | Permite ouvir, pausar e repetir frases em voz alta. | Reprodução e reconhecimento opcional |

## Funcionalidades prioritárias

### Notas sincronizadas

O usuário poderá criar uma nota ligada à plataforma, curso, aula, timestamp e cue. A nota deverá continuar útil mesmo quando o usuário retornar à aula, mas não deverá guardar mais conteúdo da página do que o necessário.

### Flashcards

A S·IA poderá transformar uma definição ou conceito em cartão, mas toda sugestão deverá ser revisável antes de ser salva. O usuário poderá editar frente, verso, dificuldade e tags.

O formato mínimo local deverá conter:

```json
{
  "front": "O que é normalização de dados?",
  "back": "Explicação revisada pelo usuário ou extraída do contexto da aula.",
  "platformId": "coursera",
  "courseId": "curso-local",
  "lessonId": "aula-local",
  "timestamp": 312.4,
  "tags": ["dados", "fundamentos"],
  "reviewState": "new"
}
```

### Modo prova

O modo prova deverá ocultar ou reduzir a ajuda visual, apresentar perguntas, registrar tentativa e revelar o trecho original somente após a resposta ou solicitação do usuário. A S·IA deverá privilegiar recuperação ativa, não apenas exposição da resposta.

### Revisão espaçada

O sistema deverá organizar os cartões pelo nível de domínio informado pelo usuário ou inferido de respostas locais. A agenda deverá ser transparente, editável e armazenada localmente.

### Tutor Socrático

O Tutor Socrático deverá fazer perguntas progressivas, evitando entregar imediatamente uma resposta completa. As perguntas deverão partir do contexto disponível da aula e oferecer um botão para retornar ao trecho que fundamenta a questão.

## Privacidade da camada educacional

O padrão deverá ser:

| Dado | Armazenamento padrão |
|---|---|
| Notas | Local |
| Flashcards | Local |
| Histórico de revisão | Local |
| Respostas do usuário | Local |
| Timestamps | Local |
| Conteúdo de legenda necessário ao cartão | Local, com controle do usuário |
| Sincronização entre dispositivos | Desligada até decisão futura |
| Envio para modelo remoto | Desligado por padrão |

A exportação manual deverá ser oferecida em formatos abertos, como Markdown, JSON e CSV. A importação deverá validar o formato antes de modificar o histórico local.

## Camada de inteligência

A primeira versão deverá priorizar regras determinísticas, contexto da própria legenda e revisão do usuário. A adoção futura de modelos locais ou remotos será analisada separadamente, sempre considerando memória, desempenho, privacidade, licenças e funcionamento sem servidor.

Nenhum modelo de linguagem poderá ser introduzido na extensão apenas por parecer mais inteligente. Deverá existir uma hipótese pedagógica, um critério de sucesso, um teste de qualidade e um modo de desligamento.

## Métricas de aprendizagem

As métricas devem ajudar o usuário, não criar vigilância. O painel poderá mostrar:

| Indicador | Interpretação |
|---|---|
| Conceitos vistos | Quantidade de conceitos encontrados nas aulas. |
| Cartões criados | Material produzido pelo usuário. |
| Revisões concluídas | Prática realizada. |
| Itens difíceis | Conteúdo que exige mais retornos. |
| Trechos marcados | Pontos que o usuário considera importantes. |
| Evolução pessoal | Comparação do próprio histórico, sem ranking externo. |

## Critérios para liberar uma melhoria educacional

Uma melhoria só deverá ser incorporada quando não quebrar áudio ou compatibilidade, tiver uma configuração clara, possuir armazenamento local seguro, apresentar uma forma de exclusão e passar por testes do núcleo e do adaptador.

A melhoria deverá ser aditiva. Se desligada, a experiência de leitura e síntese deverá permanecer igual à versão anterior.
