# DistroKid, as researched 2026-11-16

Web research behind spark `audio-distribution`. distrokid.com's help/features/news pages returned 403 to the
fetcher; only `/pricing`, `/product/distrokid/plans-and-pricing-2`, `/mixea` and `/resources/blog/` loaded
directly. **3P** marks a third-party source; **unconfirmed** marks what no source settled. Prices and policies are
dated facts - re-verify before relying on one.

## 1. Upload flow and metadata

- **Release:** track count (single / EP / album; duration thresholds unpublished), artist name + profile mapping
  (Spotify, Apple, YouTube), release date (custom future date needs Musician Plus; Spotify advises >= 7 days, ideally
  ~4 weeks), record label, cover art, store selection, extras, rights declarations
  ([3P guide](https://jackrighteous.com/en-us/blogs/ai-music-distribution-guide/distrokid-upload-form-ai-music-paper-trail)).
- **Track:** audio, title, version (Live / Acoustic / Radio Edit / Remix in a separate field; featured artists in a
  later section), explicit, language, primary + secondary genre, songwriter real names, credits (performer, producer,
  remixer), **AI credits**, ISRC (auto or own; original ISRC required when an original release date is given), UPC
  (free, generated), original vs cover (a cover needs its licence at upload), lyrics (synced Apple lyrics: Plus+),
  Dolby Atmos (BWF ADM, 24-bit/48 kHz, cannot be added later). Track order and ISRC are fixed after upload.
- **Cover art (3P):** square JPG, RGB, 1000 px minimum, 3000x3000 recommended (some say required). Rejected for URLs,
  QR codes, prices, store/social logos, blur, unlicensed stock, "CD" references.
- **Audio:** WAV/MP3/M4A/FLAC/AIFF/WMA, 16-bit/44.1 kHz typical, 1 GB max, filenames without `\ / : * ? " ' < > |`
  ([help](https://support.distrokid.com/hc/en-us/articles/360013647753-)).
- **AI policy:** AI-assisted and fully AI music allowed if you hold the rights; impersonation, spam and infringement
  barred ([DMN 2026-05](https://www.digitalmusicnews.com/2026/05/14/distrokid-ai-credit-disclosure-what-it-looks-like/)).
  The AI Credits step asks lyrics / music / all audio / part; "all audio" asks whether the artist is a human or an AI
  persona. Spotify's AI-credits beta started 2026-04-16 with DistroKid (3P, unverified).
- **Rejections:** no official list; reported causes are cover-song flags, impersonation, undocumented rights, spam.

## 2. Stores

"150+": Spotify, Apple Music/iTunes, Instagram/Facebook, TikTok (+ TikTok Music, Resso, Luna), YouTube Music, Amazon,
Pandora, Deezer, TIDAL, iHeartRadio, ClaroMusica, Saavn, Anghami, KKBox, Boomplay, Snapchat, NetEase, Tencent (QQ,
Kugou, Kuwo, WeSing), Pretzel, TouchTunes, Audiomack, Yandex, Qobuz, Joox, Kuack, MediaNet outlets, Beatport (opt-in,
electronic), MassiveMusic (2026-09-02) ([plans](https://distrokid.com/product/distrokid/plans-and-pricing-2)).
Delivery 1-5 business days for majors, up to 14 regional (3P).

## 3. Mastering - Mixea

([distrokid.com/mixea](https://distrokid.com/mixea)) First master free, then $99/yr unlimited. In: WAV/FLAC/MP3/M4A/AIFF.
Out: 24-bit/48 kHz WAV (+ 16/44.1 WAV and 256k MP3 per 3P). Two sliders - **Intensity** (low-high) and **EQ**
(brighter-warmer); A/B against the original with a waveform. "Optimizes bass, compression, stereo enhancement, EQ,
limiting and loudness". No published LUFS target or chain. A separate upload extra, "Loudness Normalization", levels
toward Spotify's recommendation.

## 4. Tiers and extras

- **Musician** $24.99/yr (1 artist, unlimited uploads, Splits, lyrics) · **Musician Plus** $44.99/yr (2 artists,
  synced lyrics, daily stats, custom label, release and pre-order dates) · **Ultimate** $89.99/yr (up to 100 artists,
  audio replacement, analytics, playlist-contact search) ([pricing](https://distrokid.com/pricing/)).
- **Free extras:** HyperFollow (smart link / pre-save pages), Spotify Canvas generator, mini videos and promo cards,
  Splits (with recoupments).
- **Paid extras (3P prices):** Social Media Pack $4.95 single / $14.95 album per year + 20% (YouTube Content ID,
  TikTok, Meta Rights Manager, Spotify podcasts); Discovery Pack (Shazam/Siri) $0.99/song/yr; Store Maximizer
  ~$7.95/release/yr; Leave a Legacy $29 / $49 once; cover song licensing $12/song/yr via HFA; Dolby Atmos ~$26.99/track;
  DistroKid Publishing (Kobalt, launched 2026-11-11, $75 + 20%, fully AI tracks ineligible).
- **Not found:** DistroLock, DistroVid, stems/vocal remover, BPM/key detection, AI generation tools.

## 5. After release

Payouts twice a week; daily stats from Plus (stores lag ~3 months); Edit Release changes titles, art and dates
without re-upload; audio swap is Ultimate-only.

## 6. Direct routes without an aggregator

| Platform | Public upload API | Notes |
|---|---|---|
| YouTube | yes, `videos.insert` | OAuth `youtube.upload`; audio must be wrapped as video; ~100 uploads/day |
| SoundCloud | yes, `POST /tracks` | OAuth 2.1 + PKCE; whether new app registration is open is unconfirmed |
| Audius | yes, open SDK | upload then `createTrack`; API key + secret |
| Mixcloud | yes, `POST /upload/` | OAuth 2.0, mp3 up to 4 GB |
| Internet Archive | yes, S3-like | access/secret keys, throttled |
| Bandcamp, FMA, Jamendo | no | web upload only |
| Spotify, Apple, Amazon, Tidal, Deezer | no | licensed delivery partner + DDEX ERN only |
| TikTok, Instagram | video posting only | not catalogue distribution |

Free partner route for DSPs: TikTok's SoundOn (3P terms, unverified).

## 7. Identifiers and loudness

- **ISRC** `CC-XXX-YY-NNNNN`; US registrant prefix $95 once ([usisrc.org](https://www.usisrc.org/)).
  **UPC** via GS1 US (~$30 single code, 3P). **DDEX ERN 4.3** is the distributor-to-DSP message.
- **Loudness:** Spotify -14 LUFS (Loud -11, Quiet -19), true peak <= -1 dBTP, <= -2 when louder than -14
  ([Spotify](https://support.spotify.com/us/artists/article/loudness-normalization/)); Apple ~-16; YouTube ~-14 down-only;
  Tidal -14; Amazon ~-14; Deezer ~-15 (3P).

## Buildable here, for free

| Feature | DistroKid | Needs a partner | In-house |
|---|---|---|---|
| DSP delivery (Spotify, Apple, ...) | $25-90/yr | yes | no - a delivery package can be prepared, not delivered |
| Metadata + art + audio validation | included | no | yes |
| ISRC / UPC | included | partly | own-registrant codes, or left for the distributor |
| Mastering (Mixea) | $99/yr | no | yes - local chain, A/B, per-destination target |
| AI credits + rights record | included | no | yes |
| Smart link / pre-save page | free | partly | landing page yes; pre-save needs DSP OAuth |
| Splits | free | for payouts | the sheet and math yes; moving money no |
| Canvas / promo cards / mini videos | free | no API for upload | yes - generate; upload by hand |
| Content ID, Shazam, cover licensing, publishing | paid | yes | no |
| Direct publish: YouTube, SoundCloud, Audius, Mixcloud, Archive | n/a | no | yes, within each API's auth and quota |
