# Pesquisa de voz neural feminina PT-BR

## Resultado principal

A voz `OpenVoiceOS/pipertts_pt-BR_dii` é explicitamente descrita como voz feminina em português brasileiro, usa arquitetura Piper VITS e está exportada para ONNX. Entretanto, o cartão oficial do modelo informa a licença **CC BY-NC-ND 4.0**, permitindo somente uso e compartilhamento não comercial. O cartão também proíbe modificação, adaptação, criação de modelos derivados e uso da identidade vocal para vozes derivadas. Para uso comercial ou outra licença da identidade vocal, o próprio detentor indica contato direto com a TigreGotico Lda.

Fonte verificada no navegador: https://huggingface.co/OpenVoiceOS/pipertts_pt-BR_dii

## Alternativa Apache 2.0 encontrada

`freds0/parler-tts-mini-v1.1-ptbr` informa licença Apache 2.0 e inclui múltiplos nomes de falantes, inclusive femininos. Porém, o modelo usa arquitetura Parler-TTS condicionada por descrição, depende de um encoder de texto e de um codec DAC, e não é um modelo Piper/sherpa-onnx pronto. O `config.json` publicado indica decoder com 24 camadas e dimensão oculta 1024, além de encoder T5; isso o torna muito maior e mais pesado para uma extensão Chrome local do que o Piper atual. A adoção exigiria uma nova cadeia de inferência WebAssembly/ONNX, conversões, quantização e validação de desempenho, e não deve ser apresentada como substituição simples.

Fonte: https://huggingface.co/freds0/parler-tts-mini-v1.1-ptbr

## Conclusão de licenciamento

Não há, na pesquisa atual, uma segunda voz feminina PT-BR leve, Piper/sherpa-onnx compatível e já liberada de forma clara para redistribuição comercial. A Dii pode ser integrada tecnicamente, mas não deve entrar no pacote comercial sem autorização escrita. O caminho seguro é obter uma licença comercial da Dii ou treinar/contratar uma nova voz feminina PT-BR com cessão expressa de direitos para treinamento, pesos, redistribuição e uso comercial.
