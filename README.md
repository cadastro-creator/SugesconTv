# SugesconTv

Dashboards de gestão à vista nas TVs. A TV mostra, em sequência e sem ninguém mexer, relatórios do **Power BI**, do **Looker Studio**, **planilhas do Google** e **sites** que permitem exibição.

- Hospedagem gratuita: **Cloudflare Pages** (site + API) e **Cloudflare KV** (dados).
- Nada para instalar no computador: tudo é feito pelo navegador.
- Sem bibliotecas externas no site, na TV e no app.
- Passo a passo para o Claude no navegador fazer as configurações: [docs/TAREFAS-NAVEGADOR.md](docs/TAREFAS-NAVEGADOR.md).

> ⚠️ **Atenção à privacidade:** links “Publicar na Web” do Power BI e das Planilhas, e relatórios do Looker com incorporação ativada, ficam **visíveis para qualquer pessoa que tenha o link**. Não use com dados sigilosos sem avaliar com o responsável pelos dados.

---

## 1) Publicar no Cloudflare (uma vez só)

1. Crie uma conta gratuita em <https://dash.cloudflare.com>.
2. **Crie o armazenamento (KV):** menu **Storage & Databases → KV → Create** (ou *Workers & Pages → KV*). Nome: `sugescontv-dados`.
3. **Crie o site:** **Workers & Pages → Create → Pages → Connect to Git** e escolha este repositório.
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: *(deixe vazio)*
   - Build output directory: `public`
   - Clique em **Save and Deploy**.
4. **Ligue o KV ao site:** no projeto, **Settings → Bindings → Add → KV namespace**.
   - Variable name: `PAINEL_KV` (exatamente assim)
   - KV namespace: `sugescontv-dados`
5. **Crie a senha do painel:** **Settings → Variables and Secrets → Add**.
   - Type: `Secret` · Name: `ADMIN_PASSWORD` · Value: a senha que você quiser.
   - A senha **nunca** vai para o código nem para o GitHub.
6. **Publique de novo** para valer: **Deployments → … → Retry deployment** (ou faça qualquer commit).

Pronto: o painel fica em `https://<seu-projeto>.pages.dev/admin`. Cada commit no `main` publica automaticamente.

## 2) Criar a primeira tela

1. Abra `/admin` e entre com a senha.
2. Em **Suas telas**, digite um nome (ex.: “Recepção”) e clique em **Criar tela**.
3. No editor, cole o link do relatório em **Adicionar dashboard**. O sistema reconhece o tipo e converte para o formato de exibição.
4. Para mostrar outras páginas do mesmo relatório, use **Adicionar página** dentro do item.
5. Ajuste os **segundos** de cada página (padrão 30 s) e **recarregar a cada X minutos** (padrão 10, mínimo 5 — recarregar mais que isso sobrecarrega a TV).
6. Confira na **prévia** (16:9 ou 9:16) e em **Prévia da sequência** (5 s por página).
7. **Salvamento:** tudo é salvo sozinho. O selo no topo mostra a situação: amarelo = salvando, verde = “Tudo salvo às HH:MM”, vermelho = não salvou (tenta de novo sozinho; há também o botão **Salvar agora**). As TVs buscam mudanças a cada 30 s e aplicam ao fim da página que está na tela (até 1 minuto).
8. **Reiniciar TVs:** botão no topo do editor que recarrega a página em todas as TVs daquela tela (em até 30 s). As TVs também recarregam sozinhas quando o site é atualizado e todo dia às 4h.

Na lista de telas aparecem o **código**, o **link da TV** (`/tv?tela=CODIGO`) e um **QR code** desse link.

A TV mostra todas as páginas do item 1, depois todas as do item 2, e assim por diante, em loop. Itens **pausados** não aparecem.

## 3) Como pegar o link de cada página

**Looker Studio**
1. No relatório: **Arquivo → Incorporar relatório → marque “Ativar incorporação”**.
2. **Compartilhar → Acesso geral: “Qualquer pessoa com o link pode ver”**.
3. Abra a página desejada e copie o endereço da barra do navegador (tem `/reporting/.../page/...`). Cada página é um link.

**Power BI**
1. No relatório: **Arquivo → Incorporar relatório → Publicar na Web (público)**. Copie o link `app.powerbi.com/view?r=...` e cole em **Adicionar dashboard**.
2. Para cada outra página: abra o relatório no Power BI (app.powerbi.com), clique na página e copie o endereço da barra (termina com `/ReportSection...` ou um código). Cole em **Adicionar página**: o painel usa só o nome da página (`pageName`) junto com o link público.
3. As barras de navegação e de filtros ficam escondidas automaticamente.

**Google Planilhas**
1. **Arquivo → Compartilhar → Publicar na Web → Documento inteiro → Publicar**. Copie o link e cole em **Adicionar dashboard**.
2. Para cada outra aba: clique na aba e copie o endereço da barra (termina com `#gid=número`). Cole em **Adicionar página**.

**Sites e cotações**
- Qualquer endereço `https://` que permita exibição dentro de outro site.
- Use os **Modelos prontos** (dólar, euro, Ibovespa, bitcoin, quadro de cotações — widgets do TradingView em pt-BR).
- **Cobre e alumínio em tonelada:** modelos “Cobre e Alumínio (US$/t e R$/t)”. É uma tela do próprio SugesconTv (`/cotacoes?ativos=cobre,aluminio,dolar`) com os preços de referência dos contratos futuros da COMEX (cobre convertido de libra para tonelada; R$/t pelo dólar do dia), gráfico de 1 mês e variação do dia. Atualiza a cada 10 min.

## Modo imagem (fotos) — páginas pesadas sem pesar a TV

Marque **Modo imagem** num item do editor: a TV passa a mostrar uma **foto** da página, tirada **a cada 15 minutos** (segunda a sexta, 7h às 19h, horário de Brasília) por um robô do GitHub (Actions → *Fotos do modo imagem*), em vez de abrir o site ao vivo. Fica levíssimo e funciona em qualquer TV; em troca, não é em tempo real e não tem animação. Os itens sem a marcação continuam ao vivo.

Configuração (uma vez só): na lista de telas, abra **Configurar o modo imagem**, clique em **Mostrar chave → Copiar** e cadastre no GitHub em **Settings → Secrets and variables → Actions → New repository secret** com o nome `FOTOS_TOKEN`. Se trocar a senha do painel, a chave muda. Para rodar na hora: **Actions → Fotos do modo imagem → Run workflow**. Enquanto a primeira foto não existe, a TV mostra o site ao vivo.

## 4) Instalar na TV

**Opção A – navegador da TV (mais simples).** Abra o link da tela (`https://<seu-projeto>.pages.dev/tv?tela=CODIGO`) e salve nos favoritos. Opções no fim do link:
- `&relogio=1` – mostra um relógio pequeno.
- `&girar=90` – para TV na vertical (também `180` e `270`).
- `&quadros=3` – para TVs fracas: limita quantas páginas ficam carregadas na memória (padrão 8).
- `&preparo=20` – segundos mínimos que cada página fica sendo montada escondida antes de aparecer (padrão 15). Aumente se algum relatório ainda aparecer carregando; se a página atual tiver menos tempo que isso, ela fica um pouco mais na tela.

As páginas ficam **carregadas em segundo plano**: enquanto uma página está na tela, a seguinte já está sendo montada escondida por trás dela, e só aparece depois de pelo menos 15 s montando — sem tela de carregamento (parece um quadro fixo). Ao ligar, a TV mostra “Carregando painéis…” até a primeira estar pronta. A recarga a cada X minutos é feita numa cópia escondida, que só substitui a antiga quando está pronta. Sem internet, a TV continua girando entre as páginas já carregadas.

**Opção B – app (Android TV, Google TV, TV box Android, Fire TV com Fire OS).**
1. Baixe `https://<seu-projeto>.pages.dev/apk` (atalho para `/app/sugescontv.apk`) (ou na página *Releases* do GitHub). No Fire TV, use o app **Downloader**; no Android TV, use um gerenciador de arquivos.
2. Na primeira abertura, digite só o **código da tela** (o endereço do site já vem no app; para outro endereço, crie a variável `SITE_URL` em Settings → Secrets and variables → Actions → Variables antes de gerar a versão).
3. O app abre sozinho ao ligar a TV e pode virar a **tela inicial** (a TV pergunta ao apertar HOME). Aperte **VOLTAR 3 vezes** para abrir os ajustes.
4. O app se atualiza sozinho (verifica ao abrir e a cada 6 h). Mudanças nos dashboards **não** exigem atualizar o app.

> ⚠️ Os **Fire TV Stick novos com Vega OS não instalam APK**. Use o **Fire TV Stick 4K Max (2ª geração)**, uma **TV box Android** ou só o **navegador da TV**.

**Gerar o APK (para quem mantém o projeto)** – no GitHub, **Settings → Secrets and variables → Actions**:
1. Crie `ANDROID_KEYSTORE_PASSWORD` (uma senha forte), `ANDROID_KEY_PASSWORD` (**a mesma senha**) e `ANDROID_KEY_ALIAS` (ex.: `sugescontv`).
2. Em **Actions → Gerar chave do APK → Run workflow**. Baixe o artefato `chave-android`, abra o `.txt` e cole o conteúdo no segredo `ANDROID_KEYSTORE_BASE64`. Apague o artefato. **Faça isso uma vez só**: trocar a chave impede a atualização automática das TVs.
3. Para publicar uma versão: **Actions → APK para TV → Run workflow** e digite a versão (ex.: `1.1.0`), ou **Releases → Draft a new release → tag `v1.1.0`**. O GitHub Actions compila, assina, anexa o APK à Release e copia para `/app` no site.

## 5) Solução de problemas

| Problema | O que fazer |
| --- | --- |
| **A TV pede login** (Power BI/Looker) | Power BI: use o link de **Publicar na Web** (`view?r=`), não o link normal nem `reportEmbed`. Looker: ative **Arquivo → Incorporar relatório** e compartilhe como “Qualquer pessoa com o link”. |
| **“Este site não permite exibição em painéis”** | O site bloqueia ser mostrado dentro de outro site. Use um widget de incorporação (ex.: TradingView, nos Modelos prontos) ou outro site. |
| **Planilha pede para publicar** | Arquivo → Compartilhar → **Publicar na Web** e cole o link publicado. |
| **Página em branco ou erro na TV** | Confira na prévia do painel. Páginas que não carregam em 25 s são puladas. |
| **“sem conexão” no canto da TV** | A TV perdeu a internet: continua mostrando a última página e volta sozinha. |
| **Painel diz que falta `PAINEL_KV` ou `ADMIN_PASSWORD`** | Refaça os passos 4 e 5 da seção 1 e publique de novo. |
| **Gráficos (barras, pizza, linhas) não aparecem na TV, só os números** | Coloque o modelo **Diagnóstico da TV** na tela: ele mostra a versão do navegador interno e testa gráficos. Se disser “desatualizado”, atualize o **Android System WebView** na Play Store (Google TV) ou o sistema (Fire TV). Se a pizza de teste também não aparece, a TV não está pintando gráficos: no app, aperte **VOLTAR 3 vezes** e ligue **Compatibilidade de vídeo** (desenha sem aceleração; pode ficar mais lento e o 3D pode não funcionar). |
| **TV não mostra a mudança** | Confira o selo verde “Tudo salvo” no painel e espere até 1 minuto. Se precisar, use **Reiniciar TVs**. |
| **“Muitas tentativas”** | São 10 tentativas de senha a cada 15 min por endereço. Aguarde. |
| **App não abre ao ligar a TV** | Escolha o SugesconTv como **tela inicial** (HOME). Alguns aparelhos bloqueiam abrir apps sozinhos. |

---

### Para desenvolvedores

- `public/` – site estático (painel `admin.html`, TV `tv.html`, `assets/`), `_headers` (CSP e cabeçalhos de segurança).
- `functions/api/[[caminho]].js` → `src/api.js` – API (Pages Functions). `src/verificar.js` – checagem de X-Frame-Options/frame-ancestors.
- `android/` – app Java mínimo. `.github/workflows/` – APK e testes.
- Testes (Node 22): `npm test` (links, API, QR) e `npm run e2e` (Playwright: painel, prévia e TV). Servidor local: `ADMIN_PASSWORD=teste npm run dev`.
