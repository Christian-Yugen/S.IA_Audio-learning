# Implementação do fallback DOM da S·IA

## Objetivo

Foi adicionada uma camada independente para tentar recuperar a leitura quando as fontes atuais de legenda deixarem de funcionar após uma mudança estrutural no player do Coursera.

A regra adotada foi **acrescentar, não substituir**. O caminho existente continua sendo executado primeiro. O fallback não chama `speechSynthesis`, não calcula velocidade, não altera a fila de fala e não modifica o `sync-engine.js`. Ele apenas cria um elemento de legenda compatível com o detector DOM já existente quando encontra um candidato confiável.

## Arquivos

| Arquivo | Alteração |
|---|---|
| `dom-fallback.js` | Novo módulo isolado. Observa o player, identifica candidatos textuais e publica um overlay somente após falha confirmada. |
| `manifest.json` | Apenas adiciona `dom-fallback.js` à lista de content scripts, antes de `content.js`. |
| `scripts/package-extension.ps1` | Apenas inclui `dom-fallback.js` na allowlist do ZIP. |
| `content.js` | Não alterado. |
| `sync-engine.js` | Não alterado. |
| `popup.js`, `sidepanel.js`, `service-worker.js` | Não alterados. |

## Como o fallback funciona

A nova camada procura o mesmo elemento `<video>` usado pela extensão e identifica a raiz do player. Um `MutationObserver` acompanha mudanças de texto, atributos e nós nessa raiz; uma verificação periódica de baixa frequência também permanece ativa para cobrir alterações que não gerem a mutação esperada.

Antes de ativar o fallback, a camada verifica se o vídeo está reproduzindo e se há evidência de que a página possui legendas. Essa evidência pode ser uma faixa `TextTrack`, um container de legenda já conhecido ou um elemento com atributos/classes que indiquem captions/subtitles. Caso nenhum sinal exista, o módulo não tenta falar textos genéricos da página.

Quando o mecanismo atual não apresenta uma legenda válida por pelo menos 1,5 segundo, o módulo varre a raiz do player e pontua candidatos. A pontuação considera, entre outros fatores, posição na região inferior do vídeo, centralização, visibilidade, posicionamento visual, atributos relacionados a legenda, `aria-live`, `role`, largura compatível e proximidade da raiz do player.

O candidato é rejeitado quando pertence a controles, links, vídeo, canvas, SVG, inputs, menus, relógios, elementos ocultos ou elementos com texto inválido. Um texto só é publicado depois de permanecer estável por pelo menos 80 ms e atingir a pontuação mínima.

O texto é publicado em um elemento criado com:

```html
<div data-testid="video-captions" data-sia-dom-fallback="true" aria-live="polite">
  Texto recuperado da legenda
</div>
```

Como o `content.js` existente já procura `[data-testid="video-captions"]`, ele pode consumir esse texto sem nenhuma alteração no seu código. A partir daí, o texto passa pelo mesmo fluxo atual de montagem, deduplicação, `falar()`, fila de `SpeechSynthesis` e sincronização de velocidade.

## Retorno ao caminho normal

A cada verificação, o módulo consulta novamente as fontes atuais. Quando `TextTrack` ou os seletores existentes voltam a encontrar uma legenda válida, o overlay é ocultado, o candidato é limpo e o fallback deixa de produzir texto. Portanto, o mecanismo primário mantém prioridade.

Se não houver candidato com confiança suficiente, nada é publicado. Essa decisão é intencional: o fallback prefere aguardar a captura correta a transformar controles ou texto auxiliar do player em fala.

## Garantias de preservação

Os hashes dos arquivos funcionais registrados antes da implementação permaneceram iguais após a integração:

| Arquivo | Resultado |
|---|---|
| `content.js` | Inalterado |
| `sync-engine.js` | Inalterado |
| `popup.js` | Inalterado |
| `sidepanel.js` | Inalterado |
| `service-worker.js` | Inalterado |
| `popup.html` | Inalterado |
| `sidepanel.html` | Inalterado |

A única alteração no comportamento de carregamento é a inclusão do novo script no manifesto. Como ele trabalha de forma independente, qualquer falha interna do fallback é protegida por verificações e `try/catch`, não devendo interromper o leitor principal.

## Validações executadas

Foram executadas as seguintes validações:

```text
node --check dom-fallback.js
node --check content.js
node --check sync-engine.js
node --check popup.js
node --check sidepanel.js
node --check service-worker.js
node --test tests/sync-engine.test.js
```

Resultado: **15 testes aprovados, 0 falhas**, além de sintaxe válida em todos os scripts.

Também foi criado um ZIP limpo contendo apenas os arquivos de runtime e os ícones:

```text
sia-extension-1.7.0-dom-fallback.zip
```

## Teste manual recomendado

1. Abra `chrome://extensions`.
2. Ative o modo do desenvolvedor.
3. Remova ou recarregue a versão anterior da S·IA.
4. Use “Carregar sem compactação” com a pasta extraída da extensão, ou carregue o ZIP pelo processo de empacotamento/publicação apropriado.
5. Abra uma aula do Coursera com legendas ativas.
6. Confirme primeiro o comportamento normal: a leitura deve ocorrer como antes.
7. No DevTools, inspecione o player e simule uma alteração dos containers/classes da legenda apenas em ambiente de teste.
8. Verifique se, depois do intervalo de confirmação, aparece o elemento `data-sia-dom-fallback="true"`.
9. Confirme que a fala continua sendo produzida pelo mesmo fluxo e que a velocidade se comporta de acordo com a configuração existente.
10. Restaure a página e confirme que o overlay desaparece quando a fonte primária volta a ser encontrada.

A validação automática confirmou sintaxe, regressão do motor e integridade do pacote. A confirmação final em uma aula real continua sendo necessária porque o fallback depende da renderização concreta do player e das vozes disponíveis no navegador.
