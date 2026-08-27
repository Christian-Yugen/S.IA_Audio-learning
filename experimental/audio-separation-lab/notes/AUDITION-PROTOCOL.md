# Protocolo de avaliação auditiva cega

## Objetivo

Avaliar se uma faixa separada pode sustentar o Modo Imersão sem tornar a experiência pior que o áudio original. A avaliação deve distinguir cinco propriedades: redução da voz original, preservação de música e ambiente, quantidade de artefatos, inteligibilidade da narração da S·IA e sensação de sincronização.

A avaliação auditiva não deve usar o nome do modelo no arquivo apresentado ao avaliador. O pacote de escuta deve usar identificadores neutros, como `A01`, `A02` e `A03`, com a correspondência guardada separadamente pelo laboratório.

## Preparação

Cada amostra deve ter entre 30 e 90 segundos e ser normalizada para o mesmo nível de reprodução antes da escuta. O avaliador deve receber, para cada cenário, o áudio original, o acompanhamento separado, a voz separada e o preview de imersão. A ordem deve ser alternada para reduzir viés de posição.

A escuta deve ocorrer com volume confortável e constante. Não se deve comparar arquivos reproduzidos em volumes diferentes. O avaliador pode repetir cada arquivo, mas deve registrar a primeira impressão e qualquer defeito perceptível.

## Escala

| Nota | Significado |
|---:|---|
| 1 | Inaceitável para uso; defeito dominante ou compreensão prejudicada. |
| 2 | Fraco; funciona apenas em condições muito favoráveis. |
| 3 | Aceitável para teste; defeitos claramente perceptíveis. |
| 4 | Bom; defeitos pequenos e não impeditivos. |
| 5 | Muito bom; adequado ao cenário sem defeito relevante. |

## Ficha por amostra

| Campo | Nota |
|---|---:|
| A voz original foi suficientemente reduzida no acompanhamento | 1–5 |
| Música, efeitos e ambiente foram preservados | 1–5 |
| A faixa tem poucos artefatos metálicos, ecos ou cortes | 1–5 |
| A narração da S·IA permanece compreensível | 1–5 |
| A mistura parece natural e não cansa ao ouvir | 1–5 |
| A sincronização percebida é aceitável | 1–5 |
| O resultado é utilizável neste cenário | sim/não |

O campo de observações deve registrar o defeito dominante em linguagem concreta, por exemplo: “voz original ainda forma palavras no fundo”, “música perdeu graves”, “efeito de sala ficou metálico”, “narração entrou atrasada” ou “houve corte no início da frase”. Termos vagos como “parece ruim” não são suficientes.

## Critério provisório de avanço

Um modelo só poderá avançar para protótipo experimental se, no conjunto completo, tiver média mínima de 4 para redução da voz e preservação do ambiente, média mínima de 4 para clareza da S·IA, nenhuma falha catastrófica nos cenários principais e resultado utilizável em pelo menos 80% das amostras. Esses limites são critérios internos de segurança do protótipo, não uma certificação de qualidade.

O modo deve ser recusado se a voz original continuar claramente inteligível em grande parte das amostras, se música e efeitos forem destruídos, se o processamento impedir recuperação imediata do áudio original ou se a latência tornar a leitura desconfortável.

## Regras de cegamento e transparência

O avaliador pode saber que está comparando separadores, mas não deve saber qual arquivo pertence a qual modelo durante a primeira rodada. Depois da nota, a correspondência pode ser revelada para investigação. O relatório final deve manter separadas as notas humanas, as métricas automáticas e a decisão de engenharia.

## Estado atual

O protocolo está pronto, mas a rodada válida ainda não começou porque o laboratório possui apenas um smoke test de fala limpa e um arquivo musical de teste. Nenhum dos dois cobre adequadamente o cenário de aulas com professor, música e ambiente. Os trechos reais autorizados do usuário continuam necessários.
