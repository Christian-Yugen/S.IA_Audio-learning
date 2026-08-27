# Laboratório de separação de áudio da S·IA

Este laboratório avalia, de forma isolada, se a S·IA pode preservar música, efeitos e sons ambientes enquanto reduz a voz original de um vídeo e insere a leitura sincronizada da S·IA. Ele não faz parte do runtime da extensão e não altera Coursera, Udemy, YouTube, Browser, Piper, fila ou sincronização.

## Estado inicial

O laboratório foi criado para a Fase 1. Ainda não há amostras reais autorizadas disponíveis no ambiente. O arquivo `fixtures/g7-udemy/test.webm` é um fixture técnico de aproximadamente seis segundos e não deve ser usado para concluir qualidade de separação. O corpus real deverá ser fornecido pelo usuário ou obtido de fonte com autorização e licença compatíveis.

## Estrutura

| Caminho | Finalidade |
|---|---|
| `corpus/manifest.json` | Metadados anonimizados e autorização de cada amostra. |
| `corpus/raw/` | Arquivos audiovisuais de entrada; ignorados pelo Git. |
| `corpus/working/` | WAVs normalizados para processamento; ignorados pelo Git. |
| `models/` | Pesos e artefatos grandes dos modelos; ignorados pelo Git. |
| `results/` | Stems, previews, métricas e logs; ignorados pelo Git. |
| `scripts/` | Scripts reprodutíveis de inspeção, conversão e avaliação. |
| `notes/` | Decisões, auditorias de licença e observações auditivas. |

## Como uma amostra entra no corpus

Cada arquivo deve ser um trecho de 30 a 90 segundos, preferencialmente extraído de conteúdo que o usuário está autorizado a processar. O nome físico do arquivo deve ser anônimo, por exemplo `sample-a01.mp4`. O manifesto usará um código como `A01`, sem armazenar nome de professor, e-mail, credencial ou informação desnecessária.

Antes do processamento, o manifesto deverá conter `id`, `path`, `sourceType`, `scenario`, `language`, `authorization`, `durationExpectedSeconds` e uma observação curta. O campo `authorization` deve ser `user-provided`, `public-domain`, `permissive-license` ou outro valor documentado. Amostras sem autorização não serão processadas.

Exemplo de entrada:

```json
{
  "id": "B01",
  "path": "corpus/raw/sample-b01.mp4",
  "sourceType": "user-provided-course-clip",
  "scenario": "speech-over-music",
  "language": "pt-BR",
  "authorization": "user-provided",
  "durationExpectedSeconds": 60,
  "notes": "Professor fala sobre trilha musical contínua."
}
```

## Cenários mínimos

O corpus deve cobrir fala limpa, fala sobre música, fala sobre ambiente, reverberação, demonstração prática, vídeo editado e legenda fragmentada. O objetivo é medir limites, não montar uma demonstração escolhendo somente o melhor caso.

## Regras de execução

O áudio original nunca será sobrescrito. Toda conversão deverá preservar o hash do original e registrar parâmetros de saída. Os resultados grandes não entram no Git. Nenhum arquivo de aula, caption ou resultado será enviado a servidor. O processamento offline será executado antes de qualquer teste no Chrome.

O laboratório só poderá recomendar o avanço se a avaliação auditiva confirmar que a redução da voz original não destrói a música e os efeitos, que a leitura da S·IA permanece compreensível e que uma falha consegue devolver o áudio original.

## Próximo passo

Adicionar as primeiras amostras autorizadas em `corpus/raw/` e preencher `corpus/manifest.json`. Depois será executado o script de inspeção para verificar duração, canais, taxa de amostragem, codec, hash e aderência ao intervalo de 30–90 segundos. A seleção definitiva dos modelos ocorrerá somente após essa inspeção e a auditoria de licença dos pesos.

## Execução em lote

Quando houver amostras autorizadas e comandos de modelo definidos, o laboratório poderá executar os jobs sequencialmente para limitar a memória concorrente:

```bash
python3 experimental/audio-separation-lab/scripts/run_batch.py \
  notes/batch-config.local.json \
  --output results/batch-YYYYMMDD
```

Cada job deve declarar um `id` e um `command` como lista de strings. O executor salva stdout e stderr separados, mede o tempo de parede, registra código de saída e cria `batch-results.json`. Por padrão, uma falha é registrada e os jobs seguintes continuam; use `--stop-on-error` somente quando a dependência entre jobs exigir interrupção.

O arquivo de configuração local pode conter caminhos absolutos para pesos e mídia, mas não deve ser versionado se contiver nomes pessoais, credenciais ou caminhos privados. A pasta de resultados permanece ignorada pelo Git.
