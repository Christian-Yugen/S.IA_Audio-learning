# Avisos de terceiros — S·IA Piper PT-BR experimental

## sherpa-onnx

O runtime WebAssembly e a ponte JavaScript foram gerados a partir do sherpa-onnx v1.13.6. O arquivo `SHERPA_ONNX_LICENSE` contém a licença Apache-2.0 do projeto.

## Voz Piper `pt_BR-faber-medium-int8`

O model card incluído em `PIPER_FABER_MODEL_CARD` confirma idioma `pt_BR`, um speaker, qualidade medium e sample rate de 22.050 Hz. O card declara **CC0 para o dataset** usado no treinamento.

A declaração de CC0 do dataset não deve ser interpretada automaticamente como uma licença explícita de redistribuição comercial dos pesos finais do modelo. Antes de publicar ou comercializar a extensão com essa voz, é obrigatório obter confirmação documental da licença dos pesos e dos componentes de fonemização incorporados ao bundle.

## Status de distribuição

Este build é técnico/experimental. A pasta `neural-tts` não deve ser publicada comercialmente enquanto a auditoria dos pesos, da voz, do dataset, do runtime compilado e das dependências estáticas não estiver concluída.

O artefato `pt_BR-dii-high-int8` foi deliberadamente excluído: seu pacote declara CC BY-NC-SA 4.0, incompatível com uso comercial.
