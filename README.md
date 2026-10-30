# 🚀 Asteroides

Um jogo de ação 2D inspirado no clássico **Asteroids** (Atari, 1979), feito com **JavaScript puro** e **HTML5 Canvas**, sem bibliotecas nem frameworks.

Pilote sua nave, destrua os asteroides, desvie dos discos voadores e sobreviva ao maior número de fases possível.

▶️ **Jogue agora:** https://tainara-m.github.io/Asteroides/

## ✨ Funcionalidades

- 🛸 **Nave com inércia**: gira, acelera, freia e solta chamas no propulsor
- 🌑 **Asteroides que se dividem**: grandes viram médios, que viram pequenos (quanto menor, mais pontos)
- 👾 **Discos voadores** inimigos que atiram em você (os pequenos são mais precisos e valem mais)
- 🎁 **Power-ups**: escudo, tiro rápido, tiro triplo e vida extra
- 🌀 **Hiperespaço**: teleporte de emergência, mas com risco de explodir
- 📈 **Fases progressivas**: mais asteroides e mais velocidade a cada fase, com a música acelerando junto
- ❤️ **Vidas extras** a cada 5000 pontos e invulnerabilidade temporária ao renascer
- 💥 **Efeitos visuais**: partículas, ondas de choque, tremor de tela, estrelas com parallax
- 🏆 **Recorde salvo** no navegador (`localStorage`)
- 🔊 Música e efeitos sonoros, com opção de mutar (e som sintético de reserva)
- ⏸️ Pausa, tela inicial com animação e tela de Game Over
- 📱 **Controles de toque** para celulares e tablets

## 🎮 Controles

| Ação | Teclas |
|---|---|
| Girar | ⬅ ➡ ou A / D |
| Acelerar | ⬆ ou W |
| Frear | ⬇ ou S |
| Atirar | Espaço (segure para atirar sem parar) |
| Hiperespaço | H |
| Pausar / continuar | P ou Esc |
| Mutar / desmutar | M (ou clique no ícone de som) |
| Iniciar / jogar de novo | Enter (ou toque na tela) |
| Voltar ao menu (após Game Over) | Esc |

## 🎁 Power-ups

| Ícone | Efeito | Duração |
|---|---|---|
| **S** | Escudo: ignora colisões e destrói o que tocar | ~10 s |
| **R** | Tiro rápido | ~15 s |
| **3** | Tiro triplo | ~15 s |
| **+** | Vida extra | instantâneo |

## 🏁 Pontuação

| Alvo | Pontos |
|---|---|
| Asteroide grande | 20 |
| Asteroide médio | 50 |
| Asteroide pequeno | 100 |
| Disco voador | 200 |
| Disco voador pequeno | 500 |

## 🛠️ Tecnologias

- JavaScript moderno (ES6+)
- HTML5 Canvas para toda a renderização
- Web Audio / HTML5 Audio para sons e música
- `localStorage` para guardar recorde e preferência de som
- Sprites e fontes personalizados (com desenho vetorial de reserva)

## 💻 Como rodar localmente

```bash
git clone https://github.com/Tainara-m/Asteroides.git
cd Asteroides
# abra o index.html no navegador, ou sirva a pasta:
python3 -m http.server 8000
```

Depois acesse `http://localhost:8000`.

## 📁 Estrutura

```
Asteroides/
├── index.html   # estrutura e telas (início, pausa, Game Over, controles de toque)
├── style.css    # estilos e fonte
├── game.js      # lógica, física, colisões, desenho e áudio
└── assets/      # sprites, sons, música e ícones
```

## 📄 Licença

Distribuído sob a licença descrita no arquivo [LICENSE](LICENSE).

---

Feito com 💚 por [Tainara Martins](https://github.com/Tainara-m)
