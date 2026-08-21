# Política de controle de mudanças da S·IA

## Finalidade

Esta política transforma as regras do Documento Mestre em um fluxo operacional para o GitHub. Ela se aplica a código, manifestos, permissões, modelos, runtime, documentação, testes, scripts, adaptadores e pacotes de release.

## Classificação de componentes

| Classe | Exemplos | Regra |
|---|---|---|
| **Protegido** | `sync-engine.js`, caminho Coursera, núcleo de voz, Piper, fallback de áudio | Alteração proibida sem exceção aprovada. |
| **Compartilhado** | Contratos, eventos, diagnóstico e armazenamento comum | Deve preservar todos os adaptadores existentes. |
| **Aditivo** | Novo adaptador, novo teste, novo painel educacional | Pode evoluir mediante testes e revisão. |
| **Experimental** | Integração incompleta, recurso em avaliação ou modelo sem auditoria final | Deve ser identificado e não pode ser apresentado como estável. |
| **Gerado** | ZIP, logs, capturas e resultados de execução | Não deve ser tratado como fonte de código. |

## Fluxo normal

### 1. Abrir uma proposta

Toda mudança começa com uma issue ou documento de proposta que explique o problema, o objetivo, os componentes envolvidos, o risco, o critério de sucesso e o plano de rollback.

### 2. Identificar componentes protegidos

Antes da implementação, a proposta deverá declarar se toca ou pode afetar o Coursera, o `sync-engine.js`, o núcleo de áudio, o Piper, o fallback ou o contrato comum. Se a resposta for positiva, o fluxo de exceção deverá ser acionado antes da edição.

### 3. Implementar de modo isolado

A implementação deverá utilizar um adaptador, flag, evento ou módulo novo sempre que possível. Não será permitido misturar uma correção específica da Udemy dentro de uma função do Coursera para reduzir o trabalho imediato.

### 4. Testar

Os testes deverão incluir o novo cenário, os testes existentes do núcleo e a regressão física do Coursera. Falhas não devem ser ocultadas alterando as asserções ou removendo casos.

### 5. Revisar

A revisão deverá confirmar a separação de responsabilidades, a ausência de dados sensíveis, a documentação da fonte das legendas, a presença do fallback e a possibilidade de rollback.

### 6. Empacotar

O pacote deverá ser produzido por allowlist, com manifesto na raiz, versão correta e somente recursos autorizados. Builds, logs e pacotes antigos não devem ser confundidos com código-fonte.

### 7. Liberar

A liberação deverá informar o escopo, as limitações, os testes executados e qualquer dependência de licença ou autorização ainda pendente.

## Regras do pull request

Um pull request deverá conter:

| Campo | Obrigatório |
|---|---:|
| Problema descrito | Sim |
| Escopo da alteração | Sim |
| Componentes afetados | Sim |
| Confirmação de preservação do Coursera | Sim |
| Confirmação de núcleo único de áudio | Sim |
| Diagnóstico e fallback | Sim para nova plataforma |
| Testes automatizados | Sim |
| Teste físico | Sim quando alterar integração ou áudio |
| Plano de rollback | Sim |
| Licença e dados sensíveis revisados | Sim |
| Aprovação excepcional | Quando aplicável |

## Protocolo de exceção

Uma alteração em componente protegido só poderá ser realizada depois de:

1. reproduzir o problema;
2. analisar hipóteses alternativas;
3. tentar soluções aditivas;
4. registrar por que elas falharam;
5. criar teste reproduzível;
6. medir o antes e o depois;
7. definir rollback;
8. obter aprovação prévia, explícita e específica do usuário.

A aprovação deverá indicar regra, arquivo, alteração e versão. Ela não autoriza refatorações adicionais ou mudanças em outros componentes.

O procedimento completo está no [Documento Mestre](MASTER-SIA-EXPANSION.md).

## Regras de commit

Os commits deverão ser pequenos, coerentes e descritivos. Recomenda-se o formato:

```text
feat(adapter): adiciona protótipo isolado da Udemy
fix(diagnostics): identifica fallback de legenda
 test(core): cobre troca de player
 docs(governance): atualiza política de exceção
```

Um commit que misture reorganização, mudança de áudio, novo adaptador e alteração de documentação dificulta auditoria e rollback e deverá ser evitado.

## Regras de revisão do Coursera

Mesmo quando o código Coursera não for editado diretamente, a revisão deverá verificar se a mudança altera content scripts, manifest, permissões, listeners globais, storage, roteamento de mensagens ou inicialização. Uma alteração indireta também pode causar regressão e deve ser testada.

## Condições de bloqueio

A mudança deverá ser bloqueada quando:

- quebrar qualquer teste existente;
- remover ou ocultar o diagnóstico;
- não possuir fallback exigido;
- duplicar lógica do núcleo de áudio;
- alterar o caminho protegido sem aprovação;
- incluir segredo, token, perfil de navegador ou dado pessoal;
- distribuir artefato cuja licença não foi revisada;
- não permitir rollback claro;
- prometer suporte estável sem cumprir a matriz de aceitação.

## Registro de aprovação

A aprovação do responsável deverá ser anexada ao pull request ou ao registro de decisão. Uma aprovação verbal não registrada não libera uma alteração protegida.
