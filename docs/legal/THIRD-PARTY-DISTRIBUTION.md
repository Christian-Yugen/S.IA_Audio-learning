# Licenças e distribuição de terceiros

## Objetivo

Este documento registra as dependências e os artefatos de terceiros associados ao suporte neural da S·IA. Ele existe para impedir que o repositório ou uma release faça afirmações de licença que ainda não foram confirmadas documentalmente.

## Resumo de status

| Componente | Presença | Situação documental | Pode ser declarado comercial sem revisão adicional? |
|---|---:|---|---:|
| Código da S·IA | Sim | Licença do projeto ainda não definida pela UXBRAS®. | Não |
| Runtime sherpa-onnx WebAssembly | Sim | Aviso e licença incluídos no pacote; verificar o arquivo de licença correspondente. | Não declarar sem revisão final |
| Modelo/voz Piper PT-BR Faber | Embutido no runtime/pacote experimental | Model card e origem devem ser avaliados separadamente dos dados de treinamento. | Não |
| Dataset declarado no model card | Referenciado | A declaração sobre o dataset não prova, por si só, a licença dos pesos finais. | Não |
| Voz feminina Dii | Não incluída | Identificada como incompatível com uso comercial conforme pesquisa registrada. | Não |
| Fonte sherpa-onnx completa | Não deve ser incluída por padrão | Grande árvore de build e dependências, separada do código da extensão. | Não aplicável |

## Regras de publicação

O repositório público deverá incluir avisos claros, cópias das licenças exigidas e atribuições corretas. Não deverá incluir fontes de terceiros, builds intermediários, caches de compilação ou modelos que não possam ser redistribuídos com a licença aplicável.

A existência de um arquivo chamado `LICENSE` dentro de uma dependência não concede automaticamente ao projeto S·IA o direito de redistribuir todo o bundle. Cada componente deve ser mapeado e analisado.

## Piper PT-BR

O modelo atualmente usado é experimental. O fato de o model card declarar características do idioma, do speaker, da qualidade ou do dataset não deve ser interpretado como autorização automática para uso comercial dos pesos finais.

Antes de anunciar suporte comercial, deverão ser obtidos e arquivados:

- licença ou autorização explícita dos pesos do modelo;
- licença dos componentes de fonemização incorporados;
- autorização de redistribuição dentro de uma extensão Chrome;
- confirmação de compatibilidade com uso comercial;
- avisos de atribuição exigidos;
- eventuais restrições de voz, pessoa ou dataset;
- confirmação de que o bundle final não inclui componente incompatível.

Se uma dessas confirmações estiver ausente, o suporte deverá continuar rotulado como **experimental/técnico**.

## Runtime sherpa-onnx

O runtime WebAssembly distribuído com a extensão deverá manter o aviso de licença correspondente em `extension/neural-tts/licenses/`. Alterações, recompilações ou substituições do runtime exigem atualização do inventário de terceiros e verificação do conjunto de arquivos incluído.

A licença do runtime não resolve automaticamente as pendências de licença do modelo ou da voz.

## Voz feminina futura

Uma voz feminina PT-BR somente poderá ser adicionada depois de existir autorização escrita para gravação, treinamento, distribuição, uso comercial e eventual criação de derivados. A autorização deverá indicar quem controla os direitos, o uso permitido e o modelo de remuneração ou atribuição.

Uma voz encontrada na internet não deve ser incorporada apenas porque soa natural ou possui arquivos disponíveis.

## Arquivos que permanecem fora do repositório público por padrão

Os seguintes grupos devem permanecer fora do repositório público ou ser incluídos somente após decisão específica:

| Grupo | Motivo |
|---|---|
| `artifacts/` completo | Contém fontes, caches, builds e dependências de compilação volumosas. |
| `real-fixture/` | Pode conter vídeo ou conteúdo de curso que não é apropriado para redistribuição. |
| Perfis de navegador | Podem conter cookies, sessões e dados pessoais. |
| Logs de execução não revisados | Podem conter URLs, IDs, estados ou conteúdo de páginas. |
| Pacotes antigos | Devem ser releases arquivadas, não código-fonte duplicado. |
| Áudios de treinamento | Só podem ser publicados com autorização documental. |
| Modelos sem licença confirmada | Não podem ser apresentados como distribuição comercial. |

## Checklist antes de uma release pública

- [ ] O código do projeto possui licença definida pela UXBRAS®.
- [ ] Todos os componentes de terceiros estão inventariados.
- [ ] Cada licença exigida está incluída ou vinculada de forma apropriada.
- [ ] A licença dos pesos Piper foi confirmada.
- [ ] A redistribuição do bundle neural foi autorizada.
- [ ] Nenhuma voz incompatível com uso comercial foi incluída.
- [ ] Fixtures e vídeos foram removidos ou autorizados.
- [ ] Logs, perfis e dados pessoais foram removidos.
- [ ] A política de privacidade está publicada em URL HTTPS.
- [ ] A ficha da loja não faz promessa além das autorizações existentes.

## Regra final

Enquanto a auditoria não estiver concluída, a comunicação pública deverá dizer que o motor Piper é **local e experimental**, sem afirmar que todo o pacote neural está liberado para uso comercial.
