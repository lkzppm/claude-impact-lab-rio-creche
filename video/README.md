# Vídeo demo (60 s)

Coloque o arquivo aqui com o nome **`demo.mp4`** — o [README da entrega](../README.md) já aponta para
`video/demo.mp4`.

```bash
# da raiz do repositório
cp /caminho/do/seu/arquivo.mp4 video/demo.mp4
git add video/demo.mp4 && git commit -m "Adiciona vídeo demo de 60s"
```

## Antes de commitar

- **Nome exato:** `demo.mp4` (minúsculas). Qualquer outro nome quebra o link do README.
- **Tamanho:** o GitHub rejeita arquivos acima de **100 MB** e avisa acima de 50 MB. Se passar disso,
  comprima antes:
  ```bash
  ffmpeg -i entrada.mp4 -vcodec libx264 -crf 28 -preset veryfast -vf "scale=1280:-2" -acodec aac -b:a 96k video/demo.mp4
  ```
- **Duração:** 60 segundos. O regulamento (`spec/10-regras-e-entrega.md`) define o vídeo como
  **obrigatório** quando a aplicação não está publicamente acessível por completo.

## Roteiro sugerido (60 s)

| Tempo | O que mostrar |
|---|---|
| 0–10 s | Nível Central: o **motor contínuo** rodando sozinho — última rodada, próxima rodada, vagas repassadas |
| 10–25 s | **Mapa do território** com drill-down: rede → CRE → creche |
| 25–40 s | Painel da CRE: convocações **vencendo hoje**, com carimbo de tempo e log de eventos |
| 40–60 s | **"Perguntar ao painel"**: uma pergunta em português, a resposta e as ferramentas que o Claude consultou |
