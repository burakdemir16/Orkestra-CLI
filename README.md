# Orkestra

Orkestra, yerel AI CLI araclarini tek panelden yoneten local-first bir agent studyosudur. Hedefi, Codex CLI, Claude CLI, Gemini CLI ve benzeri araclari rol bazli ajanlar gibi calistirip tek bir gorev akisi icinde birlestirmektir.

## Ne yapar?

- Arayuzden prompt alir.
- Tanımlı ajanlari `planner -> builder -> reviewer -> fixer` akisi ile calistirir.
- Her ajan icin komut sablonu kullanir.
- Sureci canli timeline olarak gosterir.
- Transcript ve run eventlerini SQLite'a kaydeder.
- Limit/rate/quota benzeri ciktilari yakalayip ajan durumunu isaretler.
- Git degisikliklerini gosterir ve kullanici onayi ile branch, commit, push ve draft PR akisi calistirir.

## Neyi yapmaz?

Ilk surumde OpenAI, Anthropic veya Gemini API key ana yol degildir. Orkestra, bilgisayarda kurulu ve login olmus CLI araclarini calistirir:

```text
Orkestra Paneli -> codex CLI
Orkestra Paneli -> claude CLI
Orkestra Paneli -> gemini CLI
```

Varsayilan ajanlar `dry-run` komutu ile gelir; boylece Codex/Claude/Gemini kurulu olmasa bile panel denenebilir.

## Kurulum

```powershell
npm install
npm run dev
```

Arayuz varsayilan olarak:

```text
http://127.0.0.1:5173
```

Backend:

```text
http://127.0.0.1:8787
```

## Agent komut sablonu

Agent ayarlarinda `command` ve `argsTemplate` tanimlanir. Orkestra su placeholder'lari doldurur:

- `{prompt}`: kullanici gorevi ve onceki ajan baglami
- `{workspace}`: run icin izole calisma klasoru
- `{transcript}`: onceki ajan mesajlari
- `{role}`: agent rolu

Ornek Codex agent:

```text
command: codex
args:
  --model
  gpt-5.5
  {prompt}
```

Ornek Claude agent:

```text
command: claude
args:
  -p
  {prompt}
```

Ornek Gemini agent:

```text
command: gemini
args:
  -p
  {prompt}
```

## Git publish guvenligi

Git publish akisi kullanici onayi ile calisir. `.env`, token, secret, credential veya private key gibi gorunen dosyalar otomatik olarak commit disi birakilir.

Publish akisi:

1. Git status okunur.
2. Guvenli dosyalar secilir.
3. Yeni branch olusturulur.
4. Commit atilir.
5. `origin` varsa push edilir.
6. `gh` kurulu ve login ise draft PR acilir.

## Hafiza

v0.1 transcript ve karar eventlerini SQLite'a kaydeder. MemPalace entegrasyonu icin ileride `MemoryProvider` katmani eklenecek.

## Komutlar

```powershell
npm run dev
npm run build
npm test
```
