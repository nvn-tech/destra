# Stitch Design Brief — Content Panel for Doctors

Nov 4, 2026

Copy-paste prompts for Google Stitch: one project context prompt, a design system, then one prompt per screen.

## How to use this brief

Generate one screen per prompt, always starting from the same context and design system, so every screen looks like the same product. Updated after the legal and platform research: Instagram connects through Facebook Login (the account must be linked to a Facebook Page), and Autopilot only publishes pre-approved ideas.

1. Create a **Web** project in Stitch for the panel (screens 1–14). Create a separate **Mobile** project for screens 15–16.
2. Paste the **project context prompt** and the **design system prompt** together as the first message, with screen 1 appended. This sets the look for the project.
3. Generate each following screen with its own prompt. Start each with: "Same product and design system as before."
4. Iterate with small, specific changes ("make the compliance panel 360px wide", "move the approve button to the top right"). One or two changes per message works better than a rewrite.
5. Once a screen looks right, use it as the reference: "Use the review queue screen's header and sidebar."
6. Export to Figma or code when the main flow (onboarding → review queue → calendar) is consistent.

Prompts are in English for best results; all UI text in the mockups should be in Brazilian Portuguese (PT-BR). Build first priority: screens 7 (review queue) and 8 (compliance detail). They are the core of the product.

## Project context prompt

Paste this first. The product name is Destra.

```text
PROJECT CONTEXT
Design a web SaaS admin panel called "Destra" for doctors in Brazil who want to grow on Instagram.
The doctor connects their Instagram, adds profiles they admire and topics of interest. The AI studies
the posting style of those profiles and of the doctor's own account, then generates post drafts
(carousels, captions, reel scripts) in the doctor's own voice. Every draft is checked against Brazilian
medical advertising rules (CFM) before it can be published. The doctor reviews, edits and approves
drafts, or turns on "Autopilot" for posts that pass all checks. After publishing, the panel shows
which posts performed better than the doctor's average and why.

PRIMARY USER
A busy specialist doctor (e.g., endocrinologist), 30-55 years old, not a marketer, uses the panel
between appointments, often on a laptop, sometimes approving posts on a phone. They care about
professional credibility and fear breaking CFM rules more than they want viral content.

KEY FEELING
Calm, trustworthy, clinical-but-warm. "A smart assistant that protects my reputation."
Not a flashy influencer tool.

LANGUAGE
All interface text in Brazilian Portuguese (PT-BR). Dates as dd/mm, 24h time, currency R$.

LAYOUT
Desktop-first, 1440px wide. Left sidebar navigation with: Início, Fila de revisão, Calendário,
Inspiração, Referências, Resultados, Configurações. Top bar with workspace name (e.g.,
"Dra. Ana Souza"), Instagram connection status, notifications and avatar.
```

## Design system

Paste this together with the context prompt. Colors are a starting proposal; adjust them to your brand.

```text
DESIGN SYSTEM
Personality: calm, precise, trustworthy, warm. Generous white space, soft shadows only on modals,
flat cards with 1px borders. Rounded corners 12px on cards, 8px on inputs and buttons.

Colors (light theme):
- Background #F7F8FA, surface/cards #FFFFFF, borders #E4E7EC
- Primary (actions, links, selected states): deep teal #0F766E, hover #115E59
- Text: primary #101828, secondary #475467, muted #98A2B3
- Compliance status colors, used consistently everywhere:
  - Aprovado / OK: green #12B76A on light green #ECFDF3
  - Revisar / warning: amber #F79009 on light amber #FFFAEB
  - Bloqueado / blocked: red #F04438 on light red #FEF3F2
- Accent for AI suggestions and insights: soft violet #7A5AF8 on #F4F3FF (use sparingly)

Typography: Inter. Page title 28/36 semibold, section title 18/28 semibold, body 14/20 regular,
small labels 12/16 medium. Numbers in tables use tabular figures.

Components to reuse on every screen:
- Left sidebar 248px, icons + labels, active item with teal left border and light teal background
- Status pill (Aprovado / Revisar / Bloqueado) with icon (check / alert triangle / shield-x)
- "Compliance badge": small shield icon + text "Verificado CFM" in green when a post passes
- Instagram post preview card (square image or carousel with slide dots, caption preview, hashtags)
- Strategy tags as small gray chips (e.g., "Mito vs. fato", "Carrossel", "CTA: salvar")
- Primary button teal filled; secondary button white with border; destructive text button red
- Empty states with a simple line illustration and one clear action

Accessibility: WCAG AA contrast, never rely on color alone (always icon + text for status),
visible focus states, minimum 14px body text.
```

## Onboarding screens (1–5)

Onboarding has to produce first drafts in under 15 minutes. Use a centered card layout with a 5-step progress bar at the top and no sidebar.

### 1. Login / sign-up

```text
Screen: Login and sign-up for Destra. Split layout: left half shows a calm product illustration of
an Instagram carousel preview with a green "Verificado CFM" shield badge, and the headline
"Conteúdo para Instagram no seu tom, dentro das regras do CFM." Right half: form with "Entrar com
Google" button, divider "ou", e-mail and password fields, "Entrar" primary button, link "Criar conta".
Footer: small text "Seus dados protegidos conforme a LGPD".
```

### 2. Professional profile

```text
Screen: Onboarding step 1 of 5 "Seu perfil profissional". Progress bar with 5 steps: Perfil,
Instagram, Interesses, Sua voz, Pronto. Form fields: Nome completo, CRM (number), UF (dropdown with
Brazilian states), Especialidade (searchable dropdown) with RQE number field next to it, and a
"+ Adicionar especialidade" link. If no RQE is entered, show a small amber note: "Sem RQE, seus posts
não podem usar o título de especialista. Mencione pós-graduação com 'não especialista'."
Info box in light teal: "O CFM exige nome, CRM e RQE no seu perfil e em cada post. Nós incluímos
automaticamente." Live preview of the signature at the bottom: "Dra. Ana Souza | CRM-SP 123456 |
RQE 7890". Buttons: "Voltar" and "Continuar".
```

### 3. Connect Instagram

```text
Screen: Onboarding step 2 of 5 "Conecte seu Instagram". A short 3-item checklist explains what is
needed, each with a status icon: (1) "Conta profissional (Criador ou Empresa)", (2) "Conta vinculada a
uma Página do Facebook", (3) "Você é administrador(a) da Página". Large primary button "Conectar com
Facebook" (Meta blue icon) with helper text "Usamos o login do Facebook porque o Instagram só permite
analisar perfis de referência por esse caminho." Link "Não tenho Página do Facebook" opens a small
step-by-step guide (criar Página, vincular ao Instagram) with screenshots placeholders. Below, three
short bullets with icons: "Lemos seus posts para aprender seu estilo", "Publicamos apenas o que você
aprovar", "Você pode desconectar quando quiser". Show a success state variant: avatar,
@dra.anasouza, linked page "Dra. Ana Souza — Endocrinologia", 12,4 mil seguidores, 214 posts, green
check "Conectado", and a small progress line "Analisando seus últimos 100 posts…". Also show an
error state: amber card "Sua conta ainda não está vinculada a uma Página" with button "Ver como
vincular".
```

### 4. Interests and references

```text
Screen: Onboarding step 3 of 5 "Seus interesses e referências". Two sections.
Section A "Temas de interesse": tag input where typed tags become chips (e.g., "Tireoide",
"Menopausa", "Reposição hormonal", "Diabetes"), plus suggested topic chips below with "+".
Section B "Perfis que você admira": search field "Buscar @perfil", and a grid of 6 suggested profile
cards for endocrinology (avatar, name, @handle, followers, small label "Muito usado por
endocrinologistas"), each with "Adicionar" toggle. Selected profiles appear as a list with a weight
slider "Influência no estilo" (baixa / média / alta). Counter "4 de 10 referências". Buttons:
"Voltar" and "Continuar".
```

### 5. Voice sample

```text
Screen: Onboarding step 4 of 5 "Como você fala com seus pacientes?". Large microphone record button
with a waveform, instruction: "Grave 2 minutos explicando um tema como você explicaria para um
paciente. Usamos isso para escrever no seu tom." Timer 00:00 / 02:00. Alternative link "Prefiro
responder perguntas". Below, a tone selector with 3 cards: "Acolhedor e didático", "Técnico e
objetivo", "Próximo e descontraído", one selected. Then a final state variant for step 5 "Pronto!"
showing 5 first draft ideas being generated as skeleton cards with a progress message "Criando seus
primeiros rascunhos… cerca de 2 minutos".
```

## Core panel screens (6–14)

All core screens use the sidebar and top bar from the context prompt. Screens 7 and 8 are the most important; design them first.

### 6. Home (Início)

```text
Screen: Home dashboard "Bom dia, Dra. Ana". Top row of 4 stat cards: "Aguardando revisão: 3",
"Agendados esta semana: 4", "Engajamento vs. sua média: +38%" (green up arrow), "Posts verificados CFM:
100%". Main area left (2/3): "Próximos posts" list of 4 scheduled posts with thumbnail, day/time
(e.g., "ter, 19:00"), format chip and status pill. Right column (1/3): violet AI insight card "O que
está funcionando" with text "Carrosséis 'mito vs. fato' tiveram 2,4× seu engajamento médio" and button
"Criar mais assim"; below it "Inspiração do dia" with 2 small post cards from reference profiles.
Primary button top right: "+ Novo post".
```

### 7. Review queue (Fila de revisão)

```text
Screen: Review queue, the core screen. Left column (320px): list of ideas waiting for review, each
with topic title (e.g., "5 mitos sobre a tireoide"), suggested date, and status pill. One is selected.
Main area: three draft variants side by side as columns labeled "Variante A — Recomendada",
"Variante B", "Variante C (experimento)". Each column shows: strategy chips ("Mito vs. fato",
"Carrossel 7 slides", "CTA: salvar"), an Instagram carousel preview with slide dots, the caption with
the first line in bold as the preview, hashtags, the signature line, and a compliance status pill.
Variant A has a small violet note: "Recomendada: ganchos com estatística tiveram 1,7× sua média".
Variant B shows an amber "Revisar (1)" pill. Each column footer: "Editar", "Escolher esta".
Top right of main area: "Rejeitar ideia" text button and primary "Aprovar e agendar" with a date
picker showing "ter, 12/11 às 19:00".
```

### 8. Compliance detail

```text
Screen: Draft editor with a compliance side panel. Main area: editable caption and carousel slides;
one phrase "cura o cansaço" is highlighted with a red underline and one phrase "o melhor tratamento" with
an amber underline. Right side panel (360px) titled "Verificação CFM" with overall status "Revisar —
2 pontos". Each issue is a card: severity pill, rule name ("Promessa de resultado"), the quoted
text, a short explanation ("O CFM proíbe garantir ou prometer resultados de tratamento."), source
reference small text ("Res. CFM 2.336/2023"), a suggested rewrite in a light green box ("pode ajudar a
entender o cansaço") and buttons "Aplicar sugestão" and "Ignorar com justificativa". Below the
issues: a checklist of passed checks with green checks: "Identificação CRM e RQE", "Sem
sensacionalismo", "Sem preços ou promoções", "Afirmações com referência (2)". A collapsible
"Referências científicas" section lists 2 citations with "Copiar para legenda".
```

### 9. Carousel editor

```text
Screen: Carousel slide editor. Left: vertical thumbnails of 7 slides with drag handles and "+"
button. Center: large 1080x1350 slide canvas showing slide 1 with big title "5 mitos sobre a
tireoide" in the doctor's brand colors, small logo and handle at the bottom. Right panel: slide text
fields (Título, Texto) with word counter "18/25 palavras", layout picker with 4 template thumbnails,
and an AI action row: "Reescrever", "Encurtar", "Mais didático". Top bar: "Salvar rascunho",
"Verificar CFM" and status pill "Aprovado".
```

### 10. Calendar (Calendário)

```text
Screen: Content calendar, month view for November. Each day cell can hold small post chips with
thumbnail, time and status color (green published, teal scheduled, amber waiting review). A legend
at the top. Toggle Semana / Mês. Right drawer opened for a selected post showing preview, scheduled
time, "Reagendar", "Pausar" and "Ver resultado". A banner at the top shows Autopilot status:
"Piloto automático: desligado" with a switch, and a red outline button "Pausar todas as publicações".
```

### 11. Inspiration feed (Inspiração)

```text
Screen: Inspiration feed. Filter bar: topic chips (Tireoide, Menopausa, Diabetes), format (Carrossel,
Reel, Imagem), period (7 dias / 30 dias). Masonry grid of post cards from reference and discovered
profiles: thumbnail, @handle, a performance badge "3,2× a média do perfil", detected strategy chips
("Mito vs. fato", "Estatística"), and actions "Usar como inspiração" (primary small) and icons
save / dismiss. One card shows an amber label "Não recomendado: pode violar regras do CFM" and is
dimmed. A side note explains: "Usamos a estrutura, nunca o texto, para manter seus posts originais."
```

### 12. References (Referências)

```text
Screen: Reference profiles manager. Table with columns: Perfil (avatar, name, @handle), Seguidores,
Posts analisados, Engajamento médio, Estilo principal (chips), Influência (low/medium/high selector),
Status (Ativo / Privado). Top: search "Adicionar @perfil" and counter "6 de 10 no seu plano".
Below the table, a section "Sugeridos para você" with 3 profile cards and "Adicionar". Clicking a row
opens a side panel "Estilo de @perfil" with format distribution bars, top hooks, best posting times,
and 3 top posts.
```

### 13. Results (Resultados)

```text
Screen: Results and insights. Top: period selector and 4 stat cards (Alcance, Engajamento vs. sua
média, Salvamentos, Novos seguidores). A line chart of engagement over 12 weeks with a dashed
baseline "Sua média". A section "O que funcionou" with 3 violet insight cards (e.g., "Ganchos com
estatística: 1,7×", "Terça 19h é seu melhor horário", "Carrosséis superam reels em 40%"). A table of
recent posts: thumbnail, date, format, strategy chips, engagement, "vs. média" with green/red arrows.
```

### 14. Settings (Configurações)

```text
Screen: Settings with tabs: Perfil profissional, Marca, Sua voz, Autonomia, Redes conectadas,
Conta e plano. Show the "Autonomia" tab: three large selectable cards "Manual", "Assistido
(recomendado)", "Piloto automático", each with a short description. Piloto automático shows a note
"Publica apenas ideias que você pré-aprovou e que passaram na verificação CFM. Posts com alertas
vão para a fila de revisão. Pela Res. CFM 2.454/2026, você continua responsável pelo conteúdo." and
a required checkbox "Entendo e aceito a responsabilidade pelo conteúdo publicado", plus a link
"Ver histórico de publicações automáticas". Below: posting frequency (posts per week stepper),
preferred days and times, and a toggle "Adicionar 'Conteúdo revisado por Dr(a).' nas legendas".
Also show the "Redes conectadas" tab as a list of cards: Instagram + Página do Facebook (Conectado),
YouTube (Conectar), X (Conectar), LinkedIn (Conectar — "somente publicação"), TikTok (Em breve —
"rascunhos enviados para sua caixa no TikTok"). Each card shows token status, e.g., "Reconectar em 12
dias".
```

## Mobile screens (15–16)

Doctors approve posts between appointments, so the phone flow is approval-only. Create these in a separate Mobile project, pasting the context and design system prompts first.

### 15. Approve on phone

```text
Screen: Mobile approval screen (390x844). Same product and design system. Top: back arrow, title
"Revisar post", status pill "Aprovado" with "Verificado CFM" shield. Swipeable Instagram carousel
preview filling the width, slide dots below. Variant switcher as 3 small tabs "A · B · C" with A
marked "Recomendada". Caption preview collapsed to 3 lines with "ver mais". Scheduled time row
"ter, 12/11 às 19:00" with edit icon. Sticky bottom bar with two buttons: secondary "Editar" and
primary "Aprovar". A second state variant shows a success toast "Agendado para ter, 19:00".
```

### 16. Notifications

```text
Screen: Mobile notifications list. Same product and design system. Grouped by "Hoje" and "Ontem".
Items with icons: "3 rascunhos prontos para revisão" (teal), "Post publicado: 5 mitos sobre a
tireoide" (green), "Seu post teve 2,1× seu engajamento médio" (violet), "1 post precisa de ajuste
CFM" (amber), "Reconecte seu Instagram em 5 dias" (red). Each item has a time and a chevron. Bottom
tab bar: Início, Fila, Calendário, Perfil.
```

## Sample content for mockups

Use the same fictional doctor and posts on every screen so the prototype tells one story. All names and numbers are fictional.

| Item      | Value                                                        |
| --------- | ------------------------------------------------------------ |
| Doctor    | Dra. Ana Souza, endocrinologista                             |
| Signature | Dra. Ana Souza \| CRM-SP 123456 \| RQE 7890                  |
| Instagram | @dra.anasouza, 12,4 mil seguidores, 214 posts                |
| Topics    | Tireoide, Menopausa, Reposição hormonal, Diabetes, Obesidade |
| Best slot | Terça, 19:00                                                 |

### Sample posts

| Title                                  | Format             | Strategy chips             | Status    |
| -------------------------------------- | ------------------ | -------------------------- | --------- |
| 5 mitos sobre a tireoide               | Carrossel 7 slides | Mito vs. fato, CTA: salvar | Aprovado  |
| Menopausa: o que é normal sentir?      | Carrossel 6 slides | Pergunta, Didático         | Revisar   |
| Cansaço constante pode ser a tireoide? | Reel 45 s          | Estatística, História      | Agendado  |
| Diabetes tipo 2: 3 hábitos que ajudam  | Imagem             | Lista, CTA: comentar       | Publicado |

### Sample caption (for previews)

```text
Você já ouviu que todo cansaço é "problema de tireoide"? 🤔

Nem sempre. A tireoide funciona como um termostato do corpo, e alguns sintomas podem ter outras
causas. Neste carrossel eu explico os 5 mitos que mais escuto no consultório.

Salve para consultar depois e compartilhe com quem precisa ler isso.

#tireoide #endocrinologia #saudedamulher

Dra. Ana Souza | CRM-SP 123456 | RQE 7890
```

### Sample compliance issues

| Severity  | Rule                     | Quoted text           | Suggested rewrite                        |
| --------- | ------------------------ | --------------------- | ---------------------------------------- |
| Bloqueado | Promessa de resultado    | "cura o cansaço"      | "pode ajudar a entender o cansaço"       |
| Revisar   | Autopromoção             | "o melhor tratamento" | "um tratamento indicado em alguns casos" |
| Revisar   | Afirmação sem referência | "30% das mulheres…"   | Adicionar referência ou suavizar         |
